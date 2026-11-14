import { svg } from '../dom.js';
import { WORLD } from '../robot/simulator.js';
import { createRobotFigure } from './robot-figure.js';

const CELL = 100;
const POPUP_MS = 800;
const STAR_PATH = 'M0,-30 L8.8,-12.1 28.5,-9.3 14.3,4.6 17.6,24.3 0,15 -17.6,24.3 -14.3,4.6 -28.5,-9.3 -8.8,-12.1 Z';

const centre = (cell) => (cell + 0.5) * CELL;

/** Draws the mat, the boxes, the star, the trail and the robot for a simulator. */
export class StageView {
  /** When true, tapping a cell adds or removes a box. */
  editable = true;

  #simulator;
  #boxes = svg('g');
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
      this.#star,
      this.#boxes,
      this.#trail,
      this.#robot.group,
      this.#popups,
    );
    this.element.addEventListener('click', (event) => this.#onTap(event));
    simulator.addEventListener('change', () => this.#drawRobot());
    simulator.addEventListener('world', () => this.#drawWorld());
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
    const { boxes, goal } = this.#simulator;
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
