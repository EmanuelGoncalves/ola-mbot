import { isAbort } from '../timing.js';

/**
 * One robot for the rest of the app: every command goes to the robot on screen
 * and, when one is connected, to the real mBot as well.
 */
export class RobotHub {
  #simulator;
  #mbot = null;

  constructor(simulator) {
    this.#simulator = simulator;
  }

  get connected() {
    return this.#mbot !== null;
  }

  attach(mbot) {
    this.#mbot = mbot;
  }

  detach() {
    this.#mbot = null;
  }

  move(steps, signal) {
    return this.#both((robot) => robot.move(steps, signal));
  }

  turn(quarters, signal) {
    return this.#both((robot) => robot.turn(quarters, signal));
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

  /** The real robot's eyes win when it is connected. */
  async obstacleAhead() {
    if (this.#mbot) {
      try {
        return await this.#mbot.obstacleAhead();
      } catch (error) {
        console.warn('mBot sensor read failed', error);
      }
    }
    return this.#simulator.obstacleAhead();
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
