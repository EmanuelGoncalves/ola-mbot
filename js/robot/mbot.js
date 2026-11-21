import { sleep } from '../timing.js';
import { buttonRequest, distanceRequest, lightRequest, lightsPacket, lineRequest, ReplyParser, resetPacket, sensorRequest, tonePacket, versionRequest, wheelsPacket } from './protocol.js';
import { driveTime, squareOf, turnTime } from './tuning.js';

const REPLY_TIMEOUT_MS = 400;
/** Each question carries a number, so answers are not mixed up when two are waiting. */
const LAST_INDEX = 250;
/** The sensor answers 400 cm when it sees nothing, and 0 when it could not measure. */
export const OUT_OF_SIGHT_CM = 400;
/** The distance between the mBot's two wheels. */
const WHEEL_GAP_CM = 11.5;
/** About how far the eyes sit in front of the point the mBot turns around. */
export const EYES_AHEAD_CM = 10;
const SEEK_LIMIT_MS = 8000;
const SEEK_POLL_MS = 80;
const LIGHTS_OFF = [0, 0, 0];
/**
 * The robot holds a note longer than it is asked to: about 1.28 times, at every pitch (measured
 * on a real mBot with firmware 06.01.009). So it is asked for less.
 */
const NOTE_STRETCH = 1.28;
/** Time for a note to reach the robot and for the robot to start listening again after it. */
const NOTE_MARGIN_MS = 55;
const SHORTEST_NOTE_MS = 30;
/** What to ask the robot for, so that a note is over `ms` after it was sent. */
export const noteLength = (ms) => Math.max(SHORTEST_NOTE_MS, Math.round((ms - NOTE_MARGIN_MS) / NOTE_STRETCH));
/**
 * To change its lights the firmware switches its interrupts off for a moment, and could lose a
 * byte that arrives right then. A real mBot answered 60 of 60 questions sent in the same write
 * as a colour change, so this pause is only a small margin.
 */
const LIGHTS_DEAF_MS = 40;
/**
 * A reset is said this many times, this far apart: a robot in the middle of a garbled packet
 * swallows the first one.
 */
const RESET_TIMES = 3;
const RESET_GAP_MS = 120;
/** While a job has the robot's full attention, its lights change no more often than this. */
const ATTENTIVE_LIGHTS_EVERY_MS = 500;
/** Between the short drive that puts the axle in place and the turn, the robot rests this long. */
const PIVOT_REST_MS = 100;
/** A waiting note goes this much later than the other waiting packets, which it would otherwise keep waiting. */
const NOTE_GOES_LAST_MS = 20;

/** The real mBot, driven over a link that has `send(bytes)` and `data` events. */
export class MBot {
  #link;
  #tuning;
  #parser = new ReplyParser();
  #waiting = new Map();
  #index = 0;
  /** When the robot will have finished its note and listens again. */
  #listensAt = 0;
  /** A job that needs the sensors all the time is on: see `focus`. */
  #focused = false;
  #lightsSentAt = 0;
  /** The newest packet of each kind that is waiting for the robot to listen. */
  #newest = {};

  constructor(link, tuning) {
    this.#link = link;
    this.#tuning = tuning;
    link.addEventListener('data', (event) => this.#receive(event.detail));
  }

  /** Wheel speeds from −255 to 255; positive is forwards. */
  drive(left, right) {
    const { flipDrive, flipTurn } = this.#tuning;
    const ahead = ((left + right) / 2) * (flipDrive ? -1 : 1);
    const spin = ((left - right) / 2) * (flipTurn ? -1 : 1);
    return this.#send(wheelsPacket(ahead + spin, ahead - spin), { kind: 'wheels' });
  }

  stop() {
    return this.drive(0, 0);
  }

  /**
   * Positive steps go forwards, negative go backwards. `bend` turns the robot that many degrees
   * to the right on the way: one wheel then covers more ground than the other, by the turn
   * times the gap between them.
   */
  move(steps, signal, bend = 0) {
    const speed = Math.sign(steps) * this.#tuning.speed;
    const square = squareOf(this.#tuning);
    const cm = Math.abs(steps) * square.cm;
    const extra = cm > 0 ? (((bend * Math.PI) / 180) * WHEEL_GAP_CM) / (2 * cm) : 0;
    return this.#driveFor(speed * (1 + extra), speed * (1 - extra), driveTime(this.#tuning, Math.abs(steps)), signal);
  }

  /**
   * Positive quarter turns go right, negative go left. The mBot turns around the middle of its
   * wheel axle, which sits `pivotCm` behind the middle of its body: a turn on the spot would
   * swing the body off its square. So the robot first drives forward until the axle is where
   * the middle of its body was, turns, and drives back by as much.
   */
  async turn(quarters, signal) {
    const { cm } = squareOf(this.#tuning);
    const ahead = cm > 0 ? (this.#tuning.pivotCm ?? 0) / cm : 0;
    if (ahead > 0) {
      await this.move(ahead, signal);
      await sleep(PIVOT_REST_MS, signal);
    }
    await this.spin(quarters, signal);
    if (ahead > 0) {
      await sleep(PIVOT_REST_MS, signal);
      await this.move(-ahead, signal);
    }
  }

  /** Quarter turns around the wheel axle, without minding where the body ends. */
  spin(quarters, signal) {
    return this.rotate(quarters, turnTime(this.#tuning, Math.abs(quarters)), signal);
  }

  /** Spins on the spot during `ms`, clockwise when `degrees` is positive. The mBot cannot measure the angle. */
  rotate(degrees, ms, signal) {
    const speed = Math.sign(degrees) * this.#tuning.speed;
    return this.#driveFor(speed, -speed, ms, signal);
  }

  async moveUntilObstacle(signal) {
    const { speed } = this.#tuning;
    await this.drive(speed, speed);
    try {
      const deadline = performance.now() + SEEK_LIMIT_MS;
      while (performance.now() < deadline && !(await this.obstacleAhead())) {
        await sleep(SEEK_POLL_MS, signal);
      }
    } finally {
      await this.stop();
    }
  }

  /** `color` comes from the palette; null switches the lights off. */
  setLights(color) {
    const notBefore = this.#focused ? this.#lightsSentAt + ATTENTIVE_LIGHTS_EVERY_MS : 0;
    return this.#send(lightsPacket(color?.rgb ?? LIGHTS_OFF), { kind: 'lights', deafMs: LIGHTS_DEAF_MS, notBefore });
  }

  /**
   * Starts from a clean slate: forgets everything that was waiting to be sent, then stops the
   * wheels and the buzzer and switches the lights off.
   */
  async reset() {
    for (const kind of Object.keys(this.#newest)) this.#newest[kind] = {}; // what was waiting is no longer the newest
    this.#listensAt = 0;
    this.#focused = false;
    this.#link.clear?.();
    for (let time = 0; time < RESET_TIMES; time++) {
      await this.#link.send(resetPacket());
      await sleep(RESET_GAP_MS);
    }
    await this.setLights(null);
  }

  /**
   * Gives a job the robot's full attention, or ends that. Following a line or exploring a room
   * needs the sensors read all the time, and the robot reads nothing while it plays a note or
   * changes its lights. So meanwhile the buzzer stays silent and the lights change slowly.
   */
  focus(on) {
    this.#focused = on;
  }

  /** The note stops by itself after `ms`; until then the robot does nothing else. */
  playTone(hz, ms) {
    if (this.#focused) return Promise.resolve();
    // The note is cut short, so that the robot is listening again when the next one is due.
    const sounding = noteLength(ms);
    const deafMs = Math.max(ms, Math.ceil(sounding * NOTE_STRETCH) + NOTE_MARGIN_MS);
    return this.#send(tonePacket(hz, sounding), { kind: 'tone', deafMs, last: true });
  }

  /**
   * What the ultrasonic "eyes" see: `{ blocked, cm }`, or null if the robot did not answer.
   * Blocked means something is less than one square away, as for the robot on screen.
   */
  async look() {
    const cm = await this.readDistance();
    return cm === null ? null : { blocked: cm > 0 && cm < squareOf(this.#tuning).cm, cm };
  }

  async obstacleAhead() {
    return (await this.look())?.blocked ?? false;
  }

  /** Distance seen by the ultrasonic sensor in cm, or null if the robot did not answer. */
  readDistance() {
    return this.#ask(distanceRequest);
  }

  /**
   * What the two line sensors underneath see: 0 both over the black line, 1 only the left one,
   * 2 only the right one, 3 neither. Null if the robot did not answer.
   */
  async readLine() {
    const seen = await this.#ask(lineRequest);
    return seen === null ? null : Math.round(seen);
  }

  /** The version of the firmware in the robot, such as "06.01.009", or null. */
  readVersion() {
    return this.#ask(versionRequest);
  }

  /** How much light falls on the board: 0 in the dark, about 1000 in full light. Null if no answer. */
  readLight() {
    return this.#ask(lightRequest);
  }

  /** True while the button on the board is pressed; null if no answer. */
  async readButton() {
    const pressed = await this.#ask(buttonRequest);
    return pressed === null ? null : pressed === 1;
  }

  /** Asks any sensor by its device number and port, for the command line; null if no answer. */
  read(device, ...data) {
    return this.#ask((index) => sensorRequest(index, device, ...data));
  }

  /** Sends bytes just as they are, for the command line. */
  sendRaw(bytes) {
    return this.#send(Uint8Array.from(bytes));
  }

  /** Sends a question made by `request(index)` and waits for its answer, or null if none comes. */
  async #ask(request) {
    const index = (this.#index = (this.#index % LAST_INDEX) + 1);
    const reply = new Promise((resolve) => this.#waiting.set(index, resolve));
    await this.#send(request(index));
    const value = await Promise.race([reply, sleep(REPLY_TIMEOUT_MS).then(() => null)]);
    this.#waiting.delete(index);
    return value;
  }

  /**
   * Sends a packet when the robot is listening. The factory firmware does nothing else while it
   * plays a note, and hears nothing while it changes its lights: what arrives meanwhile can
   * overflow its 64-byte buffer or lose bytes, and a garbled packet can be taken for a very long
   * note. So packets wait until the robot listens again, and of several waiting packets of one
   * `kind` only the newest is sent. `deafMs` is how long this packet keeps the robot from
   * listening; `last` lets the other waiting packets go first; `notBefore` is the earliest
   * moment it may go.
   */
  async #send(bytes, { kind = null, deafMs = 0, last = false, notBefore = 0 } = {}) {
    const ticket = {};
    if (kind) this.#newest[kind] = ticket;
    const wait = () => Math.max(this.#listensAt + (last ? NOTE_GOES_LAST_MS : 0), notBefore) - performance.now();
    while (wait() > 0) await sleep(wait());
    if (kind && this.#newest[kind] !== ticket) return;
    if (deafMs > 0) this.#listensAt = performance.now() + deafMs;
    if (kind === 'lights') this.#lightsSentAt = performance.now();
    await this.#link.send(bytes, kind);
    // The packet may have waited its turn at the link: the robot is deaf from when it really went.
    if (deafMs > 0) this.#listensAt = Math.max(this.#listensAt, performance.now() + deafMs);
  }

  async #driveFor(left, right, ms, signal) {
    await this.drive(left, right);
    try {
      await sleep(ms, signal);
    } finally {
      await this.stop();
    }
  }

  #receive(bytes) {
    for (const { index, value } of this.#parser.push(bytes)) {
      this.#waiting.get(index)?.(value);
      this.#waiting.delete(index);
    }
  }
}
