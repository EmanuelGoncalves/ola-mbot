import { animate, nextFrame } from '../timing.js';

/** The mat: a grid of cells. Heading is in degrees, 0 pointing up, growing clockwise. */
export const WORLD = Object.freeze({
  cols: 6,
  rows: 6,
  start: Object.freeze({ x: 1, y: 4, heading: 0 }),
});

const ROBOT_RADIUS = 0.34;
const BUMP_DISTANCE = 0.18;
const TRAIL_SPACING = 0.1;
const TRAIL_LIMIT = 800;

/**
 * The robot on screen. It follows the same commands as the real mBot.
 * Events: `change` (pose, lights or trail), `world` (boxes or star), `bump`, `note`.
 */
export class Simulator extends EventTarget {
  pose = { ...WORLD.start };
  lights = null;
  trail = [];
  obstacles = new Set();
  goal = null;
  bumps = 0;
  stepsMoved = 0;

  #tuning;
  #beeper;
  #wheels = { left: 0, right: 0 };
  #driving = false;

  constructor({ tuning, beeper }) {
    super();
    this.#tuning = tuning;
    this.#beeper = beeper;
    this.reset();
  }

  /** Puts the robot back on its starting cell and wipes the trail. */
  reset() {
    this.pose = { ...WORLD.start };
    this.lights = null;
    this.trail = [{ x: this.pose.x, y: this.pose.y }];
    this.bumps = 0;
    this.stepsMoved = 0;
    this.#wheels = { left: 0, right: 0 };
    this.#changed();
  }

  /** Sets the boxes (`[[x, y], …]`) and the star (`{x, y}` or null). */
  setWorld({ obstacles = [], goal = null } = {}) {
    this.obstacles = new Set(obstacles.map(([x, y]) => cellKey(x, y)));
    this.goal = goal;
    this.dispatchEvent(new Event('world'));
    this.reset();
  }

  /** Adds or removes a box; never on the start cell or where the robot is standing. */
  toggleObstacle(x, y) {
    if (!inBounds(x, y) || sameCell({ x, y }, WORLD.start)) return;
    const key = cellKey(x, y);
    if (!this.obstacles.delete(key)) {
      this.obstacles.add(key);
      if (!this.#fits(this.pose.x, this.pose.y)) this.obstacles.delete(key);
    }
    this.dispatchEvent(new Event('world'));
  }

  /** The boxes on the mat, as `[[x, y], …]`. */
  get boxes() {
    return [...this.obstacles].map((key) => key.split(',').map(Number));
  }

  get cell() {
    return { x: Math.round(this.pose.x), y: Math.round(this.pose.y) };
  }

  atGoal() {
    return this.goal !== null && sameCell(this.cell, this.goal);
  }

  atStart() {
    return sameCell(this.cell, WORLD.start);
  }

  isBlocked(x, y) {
    return !inBounds(x, y) || this.obstacles.has(cellKey(x, y));
  }

  // --- Robot commands ---

  async move(steps, signal) {
    for (let i = 0; i < Math.abs(steps); i++) {
      await this.#step(Math.sign(steps), signal);
    }
  }

  async turn(quarters, signal) {
    const from = this.pose.heading;
    await animate(this.#tuning.quarterTurnMs * Math.abs(quarters), signal, (progress) => {
      this.pose.heading = from + 90 * quarters * progress;
      this.#changed();
    });
    this.pose.heading = normaliseDegrees(this.pose.heading);
  }

  async moveUntilObstacle(signal) {
    for (let i = 0; i < WORLD.cols + WORLD.rows && !this.obstacleAhead(); i++) {
      await this.#step(1, signal);
    }
  }

  setLights(color) {
    this.lights = color?.hex ?? null;
    this.#changed();
  }

  playTone(hz, ms) {
    this.#beeper.play(hz, ms);
    this.dispatchEvent(new Event('note'));
  }

  /** True when the next cell ahead is a box or the edge of the mat. */
  obstacleAhead() {
    const [dx, dy] = this.#forward(1);
    return this.isBlocked(Math.round(this.pose.x + dx), Math.round(this.pose.y + dy));
  }

  /** Free driving with wheel speeds, as in `MBot.drive`. */
  drive(left, right) {
    this.#wheels = { left, right };
    if (!this.#driving && (left !== 0 || right !== 0)) this.#driveLoop();
  }

  stop() {
    this.#wheels = { left: 0, right: 0 };
  }

  // --- Internals ---

  async #step(direction, signal) {
    const { x, y } = this.pose;
    const [dx, dy] = this.#forward(direction);
    if (this.isBlocked(Math.round(x + dx), Math.round(y + dy))) {
      await this.#bump(dx, dy, signal);
      return;
    }
    await animate(this.#tuning.stepMs, signal, (progress) => this.#place(x + dx * progress, y + dy * progress));
    this.stepsMoved += 1;
  }

  /** Nudges towards the obstacle and back, so the bump is visible but harmless. */
  async #bump(dx, dy, signal) {
    const { x, y } = this.pose;
    this.bumps += 1;
    this.dispatchEvent(new Event('bump'));
    await animate(this.#tuning.stepMs, signal, (progress) => {
      const nudge = Math.sin(Math.PI * progress) * BUMP_DISTANCE;
      this.pose.x = x + dx * nudge;
      this.pose.y = y + dy * nudge;
      this.#changed();
    });
  }

  async #driveLoop() {
    this.#driving = true;
    let last = performance.now();
    while (this.#wheels.left !== 0 || this.#wheels.right !== 0) {
      await nextFrame();
      const now = performance.now();
      this.#integrate(now - last);
      last = now;
    }
    this.#driving = false;
  }

  /** Moves the robot by what its wheels did during `ms`. */
  #integrate(ms) {
    const { speed, stepMs, quarterTurnMs } = this.#tuning;
    const { left, right } = this.#wheels;
    const steps = ((left + right) / 2 / speed) * (ms / stepMs);
    const quarters = ((left - right) / 2 / speed) * (ms / quarterTurnMs);
    this.pose.heading = normaliseDegrees(this.pose.heading + 90 * quarters);
    const [dx, dy] = this.#forward(steps);
    const x = this.pose.x + dx;
    const y = this.pose.y + dy;
    // Straight on if there is room; otherwise slide along the wall or the box.
    const free = [[x, y], [x, this.pose.y], [this.pose.x, y]].find(([toX, toY]) => this.#fits(toX, toY));
    if (free) this.#place(...free);
    else this.#changed();
  }

  #fits(x, y) {
    const offsets = [-ROBOT_RADIUS, ROBOT_RADIUS];
    return offsets.every((ox) => offsets.every((oy) => !this.isBlocked(Math.round(x + ox), Math.round(y + oy))));
  }

  #forward(distance) {
    const radians = (this.pose.heading * Math.PI) / 180;
    return [Math.sin(radians) * distance, -Math.cos(radians) * distance];
  }

  #place(x, y) {
    this.pose.x = roundTiny(x);
    this.pose.y = roundTiny(y);
    const last = this.trail.at(-1);
    if (Math.hypot(this.pose.x - last.x, this.pose.y - last.y) >= TRAIL_SPACING) {
      this.trail.push({ x: this.pose.x, y: this.pose.y });
      if (this.trail.length > TRAIL_LIMIT) this.trail.shift();
    }
    this.#changed();
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD.cols && y < WORLD.rows;
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function normaliseDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

/** Removes floating-point dust such as 2.0000000001. */
function roundTiny(value) {
  return Math.round(value * 1e6) / 1e6;
}
