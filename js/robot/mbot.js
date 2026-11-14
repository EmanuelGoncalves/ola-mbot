import { sleep } from '../timing.js';
import { distanceRequest, lightsPacket, ReplyParser, tonePacket, wheelsPacket } from './protocol.js';

const REPLY_TIMEOUT_MS = 400;
/** Each question carries a number, so answers are not mixed up when two are waiting. */
const LAST_INDEX = 250;
/** The sensor answers 400 cm when it sees nothing, and 0 when it could not measure. */
export const OUT_OF_SIGHT_CM = 400;
const SEEK_LIMIT_MS = 8000;
const SEEK_POLL_MS = 80;
const LIGHTS_OFF = [0, 0, 0];

/** The real mBot, driven over a link that has `send(bytes)` and `data` events. */
export class MBot {
  #link;
  #tuning;
  #parser = new ReplyParser();
  #waiting = new Map();
  #index = 0;
  #silence = null;

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
    return this.#link.send(wheelsPacket(ahead + spin, ahead - spin));
  }

  stop() {
    return this.drive(0, 0);
  }

  /** Positive steps go forwards, negative go backwards. */
  move(steps, signal) {
    const speed = Math.sign(steps) * this.#tuning.speed;
    return this.#driveFor(speed, speed, Math.abs(steps) * this.#tuning.stepMs, signal);
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
    return this.#link.send(lightsPacket(color?.rgb ?? LIGHTS_OFF));
  }

  async playTone(hz, ms) {
    await this.#link.send(tonePacket(hz, ms));
    // Older firmware ignores the duration, so silence the buzzer ourselves, unless a newer note is playing by then.
    clearTimeout(this.#silence);
    this.#silence = setTimeout(() => this.#link.send(tonePacket(0, 0)).catch(() => {}), ms);
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
    await this.#link.send(distanceRequest(index));
    const cm = await Promise.race([reply, sleep(REPLY_TIMEOUT_MS).then(() => null)]);
    this.#waiting.delete(index);
    return cm;
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
