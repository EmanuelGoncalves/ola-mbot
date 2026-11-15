import { isAbort, sleep } from '../timing.js';
import { EYES_AHEAD_CM, OUT_OF_SIGHT_CM } from './mbot.js';
import { colorById } from './palette.js';
import { squareOf } from './tuning.js';

/** The lights blink for this long when the robot picks something up or puts it down… */
const BLINK_MS = 350;
/** …in these colours: it took something, it left something, there was nothing to take or leave. */
const BLINKS = { took: 'green', left: 'blue', nothing: 'red' };

/**
 * One robot for the rest of the app: every command goes to the robot on screen
 * and, when one is connected, to the real mBot as well.
 */
export class RobotHub {
  #simulator;
  #tuning;
  #mbot = null;
  #focused = false;

  constructor(simulator, tuning) {
    this.#simulator = simulator;
    this.#tuning = tuning;
  }

  get connected() {
    return this.#mbot !== null;
  }

  /** The real mBot, or null: for what only the real robot does, such as exploring a room. */
  get real() {
    return this.#mbot;
  }

  attach(mbot) {
    this.#mbot = mbot;
    this.#simulator.alone = false;
    mbot.focus(this.#focused);
  }

  /** Stops everything, here and on the real robot, and leaves both ready for new orders. */
  async reset() {
    this.#focused = false;
    this.#simulator.stop();
    this.#simulator.setLights(null);
    await this.#real((robot) => robot.reset());
  }

  /**
   * Tells the real robot that a job needs its full attention (see `MBot.focus`), or that it is
   * over. The robot on screen can do everything at once.
   */
  focus(on) {
    this.#focused = on;
    this.#mbot?.focus(on);
  }

  detach() {
    this.#mbot = null;
    this.#simulator.alone = true;
  }

  move(steps, signal) {
    return this.#both((robot) => robot.move(steps, signal));
  }

  turn(quarters, signal) {
    return this.#both((robot) => robot.turn(quarters, signal));
  }

  rotate(degrees, ms, signal) {
    return this.#both((robot) => robot.rotate(degrees, ms, signal));
  }

  /**
   * Spins only the real robot during `ms`, clockwise or, with `direction` −1, the other way. For
   * finding how many such spins make a full turn: until then nobody knows how far the robot on
   * screen should turn with it.
   */
  spinReal(ms, signal, direction = 1) {
    return this.#real((robot) => robot.rotate(direction, ms, signal));
  }

  /**
   * Picks up what lies on the robot's square of a printed map, and resolves with it or with
   * null. The real robot has no hand: its lights blink, as do the ones on screen. This is the
   * one place to ask a sensor, one day, whether the real robot was really given the thing.
   */
  async pick(signal) {
    const thing = this.#simulator.pick();
    await this.#blink(thing ? BLINKS.took : BLINKS.nothing, signal);
    return thing;
  }

  /** Puts down, on the robot's square, everything it carries; resolves with those things. */
  async drop(signal) {
    const things = this.#simulator.drop();
    await this.#blink(things.length > 0 ? BLINKS.left : BLINKS.nothing, signal);
    return things;
  }

  async #blink(color, signal) {
    await this.setLights(colorById(color));
    try {
      await sleep(BLINK_MS, signal);
    } finally {
      await this.setLights(null);
    }
  }

  moveUntilObstacle(signal) {
    return this.#both((robot) => robot.moveUntilObstacle(signal));
  }

  setLights(color) {
    return this.#both((robot) => robot.setLights(color));
  }

  playTone(hz, ms) {
    return this.#both((robot) => robot.playTone(hz, ms));
  }

  drive(left, right) {
    return this.#both((robot) => robot.drive(left, right));
  }

  stop() {
    return this.#both((robot) => robot.stop());
  }

  /**
   * What the robot sees ahead: `{ blocked, cm }`. The real robot's eyes win
   * when it is connected and answers; on screen there is no distance (`cm` is null).
   */
  async look() {
    if (this.#mbot) {
      try {
        const seen = await this.#mbot.look();
        if (seen) return seen;
      } catch (error) {
        console.warn('mBot sensor read failed', error);
      }
    }
    return { blocked: this.#simulator.obstacleAhead(), cm: null };
  }

  /**
   * Distance in squares from the robot's centre to what its eyes see.
   * With a real robot connected it is the real distance, or null when it sees nothing.
   */
  async range() {
    if (!this.#mbot) return this.#simulator.rangeAhead();
    const cm = await this.#mbot.readDistance().catch(() => null);
    return cm > 0 && cm < OUT_OF_SIGHT_CM ? (cm + EYES_AHEAD_CM) / squareOf(this.#tuning).cm : null;
  }

  /**
   * What the line sensors under the robot see (see `MBot.readLine`). The real robot's when one
   * is connected, null if it does not answer; otherwise the robot on screen's.
   */
  async readLine() {
    if (!this.#mbot) return this.#simulator.lineSeen();
    return this.#mbot.readLine().catch(() => null);
  }

  async obstacleAhead() {
    return (await this.look()).blocked;
  }

  async #both(command) {
    await Promise.all([command(this.#simulator), this.#real(command)]);
  }

  /** A Bluetooth hiccup must not stop the program on screen. */
  async #real(command) {
    if (!this.#mbot) return;
    try {
      await command(this.#mbot);
    } catch (error) {
      if (isAbort(error)) throw error;
      console.warn('mBot command failed', error);
    }
  }
}
