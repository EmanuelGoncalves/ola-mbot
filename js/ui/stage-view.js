import { svg } from '../dom.js';
import { WORLD } from '../robot/simulator.js';
import { createRobotFigure } from './robot-figure.js';

const CELL = 100;
const POPUP_MS = 800;
const STAR_PATH = 'M0,-30 L8.8,-12.1 28.5,-9.3 14.3,4.6 17.6,24.3 0,15 -17.6,24.3 -14.3,4.6 -28.5,-9.3 -8.8,-12.1 Z';

/** The size of a sign's letters, by how many it has: `[up to this many, size]`. */
const SIGN_SIZES = [[2, 46], [3, 40], [5, 34], [Infinity, 30]];
const SIGN_MIN_WIDTH = 84;
const SIGN_PADDING = 16;
/** About how wide a letter is, as a part of its size. */
const LETTER_WIDTH = 0.6;

const centre = (cell) => (cell + 0.5) * CELL;

/** Draws the mat, the signs, the boxes, the star, what the radar saw, the trail and the robot for a simulator. */
export class StageView {
  /** When true, tapping a cell adds or removes a box. */
  editable = true;

  #simulator;
  #signs = svg('g');
  #boxes = svg('g');
  #sightings = svg('g');
  #star = svg('path', { class: 'stage-star', d: STAR_PATH });
  #trail = svg('polyline', { class: 'stage-trail' });
  #popups = svg('g');
  #robot = createRobotFigure();

  constructor(simulator, label) {
    this.#simulator = simulator;
    const { cols, rows } = WORLD;
    this.element = svg(
      'svg',
      { class: 'stage', viewBox: `0 0 ${cols * CELL} ${rows * CELL}`, role: 'img', 'aria-label': label },
      svg('rect', { class: 'stage-mat', width: cols * CELL, height: rows * CELL, rx: 28 }),
      this.#gridLines(),
      this.#signs,
      this.#star,
      this.#boxes,
      this.#sightings,
      this.#trail,
      this.#robot.group,
      this.#popups,
    );
    this.element.addEventListener('click', (event) => this.#onTap(event));
    simulator.addEventListener('change', () => this.#drawRobot());
    simulator.addEventListener('world', () => this.#drawWorld());
    simulator.addEventListener('sightings', () => this.#drawSightings());
    simulator.addEventListener('bump', () => this.#popup('💥'));
    simulator.addEventListener('note', () => this.#popup('🎵'));
    this.#drawWorld();
    this.#drawRobot();
  }

  #gridLines() {
    const { cols, rows } = WORLD;
    const lines = [];
    for (let x = 1; x < cols; x++) lines.push(`M${x * CELL},12 V${rows * CELL - 12}`);
    for (let y = 1; y < rows; y++) lines.push(`M12,${y * CELL} H${cols * CELL - 12}`);
    return svg('path', { class: 'stage-grid', d: lines.join(' ') });
  }

  #drawWorld() {
    const { boxes, goal, signs } = this.#simulator;
    this.#signs.replaceChildren(
      ...signs.flatMap(({ x, y, text }) => {
        const { size, width, left } = signPlate(x, text);
        return [
          svg('rect', { class: 'stage-sign', x: left, y: y * CELL + 8, width, height: 84, rx: 16 }),
          svg('text', { class: 'stage-sign-text', x: left + width / 2, y: y * CELL + 52, 'font-size': size, text }),
        ];
      }),
    );
    this.#boxes.replaceChildren(
      ...boxes.map(([x, y]) =>
        svg(
          'g',
          { transform: `translate(${x * CELL} ${y * CELL})` },
          svg('rect', { class: 'stage-box', x: 12, y: 12, width: 76, height: 76, rx: 12 }),
          svg('path', { class: 'stage-box-tape', d: 'M12,50 H88 M50,12 V88' }),
        ),
      ),
    );
    this.#star.style.display = goal ? '' : 'none';
    if (goal) this.#star.setAttribute('transform', `translate(${centre(goal.x)} ${centre(goal.y)})`);
  }

  /** A thin ray and a dot for each thing the radar saw. */
  #drawSightings() {
    this.#sightings.replaceChildren(
      ...this.#simulator.sightings.flatMap(({ from, to }) => [
        svg('line', { class: 'stage-ray', x1: centre(from.x), y1: centre(from.y), x2: centre(to.x), y2: centre(to.y) }),
        svg('circle', { class: 'stage-echo', cx: centre(to.x), cy: centre(to.y), r: 9 }),
      ]),
    );
  }

  #drawRobot() {
    const { pose, trail, lights } = this.#simulator;
    const points = [...trail, pose].map(({ x, y }) => `${centre(x)},${centre(y)}`);
    this.#trail.setAttribute('points', points.join(' '));
    this.#robot.group.setAttribute('transform', `translate(${centre(pose.x)} ${centre(pose.y)}) rotate(${pose.heading})`);
    this.#robot.setLights(lights);
  }

  /** Shows a symbol floating up from the robot for a moment. */
  #popup(symbol) {
    const { x, y } = this.#simulator.pose;
    const text = svg('text', { class: 'stage-popup', x: centre(x), y: centre(y) - 40, text: symbol });
    this.#popups.append(text);
    setTimeout(() => text.remove(), POPUP_MS);
  }

  #onTap(event) {
    if (!this.editable) return;
    const box = this.element.getBoundingClientRect();
    const x = Math.floor(((event.clientX - box.left) / box.width) * WORLD.cols);
    const y = Math.floor(((event.clientY - box.top) / box.height) * WORLD.rows);
    this.#simulator.toggleObstacle(x, y);
  }
}

/** A sign is as wide as its text needs: a long word spills a little over the squares beside it, never off the mat. */
function signPlate(x, text) {
  const letters = [...text].length;
  const size = SIGN_SIZES.find(([upTo]) => letters <= upTo)[1];
  const width = Math.max(SIGN_MIN_WIDTH, letters * size * LETTER_WIDTH + SIGN_PADDING);
  const left = Math.max(4, Math.min(WORLD.cols * CELL - width - 4, centre(x) - width / 2));
  return { size, width, left };
}
