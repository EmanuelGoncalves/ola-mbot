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
const RAY_STEP = 0.05;
/** The circuit for following a line: a circle through the starting square, in squares. */
const CIRCUIT = Object.freeze({ x: 2.5, y: 2.5, radius: Math.hypot(1.5, 1.5) });
/** Half the width of its line, and where the two sensors sit under the robot. */
const LINE_HALF_WIDTH = 0.08;
const SENSORS_AHEAD = 0.3;
const SENSORS_APART = 0.08;
/** At the start, this heading runs along the circuit. */
const CIRCUIT_HEADING = 315;

/** A step and a quarter turn of the robot on screen, when no real robot sets the pace. */
const BRISK = { stepMs: 600, quarterTurnMs: 420 };

/**
 * The robot on screen. It follows the same commands as the real mBot.
 * Events: `change` (pose, lights or trail), `world` (boxes, star or signs), `sightings`, `bump`, `note`.
 */
export class Simulator extends EventTarget {
  pose = { ...WORLD.start };
  lights = null;
  trail = [];
  obstacles = new Set();
  goal = null;
  /** Squares with a word or a number on them: `[{ x, y, text }]`. */
  signs = [];
  /** What the radar saw: `[{ from, to }]`, both `{ x, y }` in squares. */
  sightings = [];
  /** The circuit drawn on the mat, `{ x, y, radius }` in squares, or null. */
  circuit = null;
  bumps = 0;
  stepsMoved = 0;
  notesPlayed = 0;
  /** False while a real robot moves with this one: then it keeps the real robot's pace, however slow. */
  alone = true;

  #tuning;
  #beeper;
  #wheels = { left: 0, right: 0 };
  #driving = false;
  #boxesAside = null;

  constructor({ tuning, beeper }) {
    super();
    this.#tuning = tuning;
    this.#beeper = beeper;
    this.reset();
  }

  /** The times of a step and of a quarter turn. Alone, the robot on screen is never slower than a brisk real one. */
  get #pace() {
    const { stepMs, quarterTurnMs } = this.#tuning;
    return this.alone ? { stepMs: Math.min(stepMs, BRISK.stepMs), quarterTurnMs: Math.min(quarterTurnMs, BRISK.quarterTurnMs) } : { stepMs, quarterTurnMs };
  }

  /** Puts the robot back on its starting cell and wipes the trail and what the radar saw. */
  reset() {
    this.showSightings([]);
    this.pose = { ...WORLD.start };
    this.lights = null;
    this.trail = [{ x: this.pose.x, y: this.pose.y }];
    this.bumps = 0;
    this.stepsMoved = 0;
    this.notesPlayed = 0;
    this.#wheels = { left: 0, right: 0 };
    this.#changed();
  }

  /** Sets the boxes (`[[x, y], …]`), the star (`{x, y}` or null) and the signs (`[[x, y, text], …]`). */
  setWorld({ obstacles = [], goal = null, signs = [] } = {}) {
    this.obstacles = new Set(obstacles.map(([x, y]) => cellKey(x, y)));
    this.goal = goal;
    this.signs = signs.map(([x, y, text]) => ({ x, y, text }));
    this.dispatchEvent(new Event('world'));
    this.reset();
  }

  /** Adds or removes a box. */
  toggleObstacle(x, y) {
    if (!this.obstacles.delete(cellKey(x, y))) this.#addBox(x, y);
    this.dispatchEvent(new Event('world'));
  }

  /** Replaces the boxes, as after a radar scan; the robot stays where it is. */
  setBoxes(cells) {
    this.obstacles = new Set();
    for (const [x, y] of cells) this.#addBox(x, y);
    this.dispatchEvent(new Event('world'));
  }

  /** Draws the circuit on the mat, with the robot on its line and pointing along it; or takes it away. Twice the same does nothing. */
  showCircuit(shown) {
    if (shown === Boolean(this.circuit)) return;
    // The boxes of the mat would be in the robot's way: they are put aside meanwhile.
    [this.obstacles, this.#boxesAside] = shown ? [new Set(), this.obstacles] : [this.#boxesAside, null];
    this.circuit = shown ? CIRCUIT : null;
    this.dispatchEvent(new Event('world'));
    this.reset();
    if (shown) this.pose.heading = CIRCUIT_HEADING;
    this.#changed();
  }

  showSightings(sightings) {
    this.sightings = sightings;
    this.dispatchEvent(new Event('sightings'));
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

  /** The text of the sign the robot is standing on, or null. */
  signHere() {
    return this.signs.find((sign) => sameCell(sign, this.cell))?.text ?? null;
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

  turn(quarters, signal) {
    return this.rotate(90 * quarters, this.#pace.quarterTurnMs * Math.abs(quarters), signal);
  }

  /** Spins on the spot by `degrees` (clockwise when positive) during `ms`. */
  async rotate(degrees, ms, signal) {
    const from = this.pose.heading;
    await animate(ms, signal, (progress) => {
      this.pose.heading = from + degrees * progress;
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
    this.notesPlayed += 1;
    this.#beeper.play(hz, ms);
    this.dispatchEvent(new Event('note'));
  }

  /** True when the next cell ahead is a box or the edge of the mat. */
  obstacleAhead() {
    const [dx, dy] = this.#forward(1);
    return this.isBlocked(Math.round(this.pose.x + dx), Math.round(this.pose.y + dy));
  }

  /** Distance in squares from the robot's centre to the box or the edge of the mat straight ahead. */
  rangeAhead() {
    const [dx, dy] = this.#forward(RAY_STEP);
    let { x, y } = this.pose;
    let range = 0;
    while (!this.isBlocked(Math.round(x), Math.round(y))) {
      x += dx;
      y += dy;
      range += RAY_STEP;
    }
    return range;
  }

  /**
   * What the two line sensors under the robot see, as the real ones answer: 0 both over the
   * line, 1 only the left one, 2 only the right one, 3 neither (also when there is no circuit).
   */
  lineSeen() {
    if (!this.circuit) return 3;
    const turn = (this.pose.heading * Math.PI) / 180;
    const [aheadX, aheadY] = this.#forward(SENSORS_AHEAD);
    const [rightX, rightY] = [Math.cos(turn), Math.sin(turn)];
    /** True when the sensor on that side (−1 left, 1 right) is off the line. */
    const off = (side) => {
      const x = this.pose.x + aheadX + (side * rightX * SENSORS_APART) / 2;
      const y = this.pose.y + aheadY + (side * rightY * SENSORS_APART) / 2;
      return Math.abs(Math.hypot(x - this.circuit.x, y - this.circuit.y) - this.circuit.radius) > LINE_HALF_WIDTH;
    };
    return (off(-1) ? 2 : 0) + (off(1) ? 1 : 0);
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

  /** A box never goes on the start cell, outside the mat or where the robot is standing. */
  #addBox(x, y) {
    if (!inBounds(x, y) || sameCell({ x, y }, WORLD.start)) return;
    const key = cellKey(x, y);
    this.obstacles.add(key);
    if (!this.#fits(this.pose.x, this.pose.y)) this.obstacles.delete(key);
  }

  async #step(direction, signal) {
    const { x, y } = this.pose;
    const [dx, dy] = this.#forward(direction);
    if (this.isBlocked(Math.round(x + dx), Math.round(y + dy))) {
      await this.#bump(dx, dy, signal);
      return;
    }
    await animate(this.#pace.stepMs, signal, (progress) => this.#place(x + dx * progress, y + dy * progress));
    this.stepsMoved += 1;
  }

  /** Nudges towards the obstacle and back, so the bump is visible but harmless. */
  async #bump(dx, dy, signal) {
    const { x, y } = this.pose;
    this.bumps += 1;
    this.dispatchEvent(new Event('bump'));
    await animate(this.#pace.stepMs, signal, (progress) => {
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
      this.advance(now - last);
      last = now;
    }
    this.#driving = false;
  }

  /** Moves the robot by what its wheels did during `ms`. The driving loop calls it at every frame. */
  advance(ms) {
    const { stepMs, quarterTurnMs } = this.#pace;
    const { speed } = this.#tuning;
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
