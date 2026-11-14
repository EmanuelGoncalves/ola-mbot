import { sleep } from '../timing.js';
import { distanceRequest, lightsPacket, ReplyParser, tonePacket, wheelsPacket } from './protocol.js';

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
/** Time for a note to reach the robot and for the robot to start listening again after it. */
const NOTE_MARGIN_MS = 80;
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
    const cm = Math.abs(steps) * this.#tuning.cellCm;
    const extra = cm > 0 ? (((bend * Math.PI) / 180) * WHEEL_GAP_CM) / (2 * cm) : 0;
    return this.#driveFor(speed * (1 + extra), speed * (1 - extra), Math.abs(steps) * this.#tuning.stepMs, signal);
  }

  /** Positive quarter turns go right, negative go left. */
  turn(quarters, signal) {
    return this.rotate(quarters, Math.abs(quarters) * this.#tuning.quarterTurnMs, signal);
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
    return this.#send(lightsPacket(color?.rgb ?? LIGHTS_OFF), { kind: 'lights' });
  }

  /** The note stops by itself after `ms`; until then the robot does nothing else. */
  playTone(hz, ms) {
    return this.#send(tonePacket(hz, ms), { kind: 'tone', busyMs: ms });
  }

  /**
   * What the ultrasonic "eyes" see: `{ blocked, cm }`, or null if the robot did not answer.
   * Blocked means something is less than one square away, as for the robot on screen.
   */
  async look() {
    const cm = await this.readDistance();
    return cm === null ? null : { blocked: cm > 0 && cm < this.#tuning.cellCm, cm };
  }

  async obstacleAhead() {
    return (await this.look())?.blocked ?? false;
  }

  /** Distance seen by the ultrasonic sensor in cm, or null if the robot did not answer. */
  async readDistance() {
    const index = (this.#index = (this.#index % LAST_INDEX) + 1);
    const reply = new Promise((resolve) => this.#waiting.set(index, resolve));
    await this.#send(distanceRequest(index));
    const cm = await Promise.race([reply, sleep(REPLY_TIMEOUT_MS).then(() => null)]);
    this.#waiting.delete(index);
    return cm;
  }

  /**
   * Sends a packet when the robot is listening. The factory firmware does nothing else while it
   * plays a note, and its buffer holds only 64 bytes: what arrives meanwhile can overflow it, and
   * a garbled packet can be taken for a very long note. So packets wait for the note to end, and
   * of several waiting packets of one `kind` only the newest is sent. `busyMs` is how long this
   * packet keeps the robot busy.
   */
  async #send(bytes, { kind = null, busyMs = 0 } = {}) {
    const ticket = {};
    if (kind) this.#newest[kind] = ticket;
    const wait = () => this.#listensAt + (busyMs > 0 ? NOTE_GOES_LAST_MS : 0) - performance.now();
    while (wait() > 0) await sleep(wait());
    if (kind && this.#newest[kind] !== ticket) return;
    if (busyMs > 0) this.#listensAt = performance.now() + busyMs + NOTE_MARGIN_MS;
    await this.#link.send(bytes);
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
