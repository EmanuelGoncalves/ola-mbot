import { sleep } from '../timing.js';
import { distanceRequest, lightsPacket, ReplyParser, tonePacket, wheelsPacket } from './protocol.js';

const DISTANCE_INDEX = 1;
const REPLY_TIMEOUT_MS = 400;
const OBSTACLE_CM = 15;
const SEEK_LIMIT_MS = 8000;
const SEEK_POLL_MS = 80;
const LIGHTS_OFF = [0, 0, 0];

/** The real mBot, driven over a link that has `send(bytes)` and `data` events. */
export class MBot {
  #link;
  #tuning;
  #parser = new ReplyParser();
  #waiting = new Map();

  constructor(link, tuning) {
    this.#link = link;
    this.#tuning = tuning;
    link.addEventListener('data', (event) => this.#receive(event.detail));
  }

  /** Wheel speeds from −255 to 255; positive is forwards. */
  drive(left, right) {
    return this.#link.send(wheelsPacket(left, right));
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
    const speed = Math.sign(quarters) * this.#tuning.speed;
    return this.#driveFor(speed, -speed, Math.abs(quarters) * this.#tuning.quarterTurnMs, signal);
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
    // Older firmware ignores the duration, so silence the buzzer ourselves.
    setTimeout(() => this.#link.send(tonePacket(0, 0)).catch(() => {}), ms);
  }

  async obstacleAhead() {
    const cm = await this.readDistance();
    return cm !== null && cm > 0 && cm < OBSTACLE_CM;
  }

  /** Distance seen by the ultrasonic sensor in cm, or null if the robot did not answer. */
  async readDistance() {
    const reply = new Promise((resolve) => this.#waiting.set(DISTANCE_INDEX, resolve));
    await this.#link.send(distanceRequest(DISTANCE_INDEX));
    return Promise.race([reply, sleep(REPLY_TIMEOUT_MS).then(() => null)]);
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
