import { svg } from '../dom.js';
import { T } from '../texts.js';
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

/** What floats up from the robot when it takes, leaves or cannot take a thing. */
const THING_POPUPS = { took: '🤲', left: '📦', heavy: '🏋️', nothing: '❓', empty: '❓' };

/** Draws the mat or a printed map, with its signs, boxes, star and things, what the radar saw, the trail and the robot. */
export class StageView {
  /** When true, tapping a cell adds or removes a box. */
  editable = true;

  #simulator;
  #label;
  #mat = svg('rect', { class: 'stage-mat', rx: 28 });
  #grid = svg('path', { class: 'stage-grid' });
  #startMark = svg('g');
  #things = svg('g');
  #held = svg('g');
  #signs = svg('g');
  #boxes = svg('g');
  #sightings = svg('g');
  #star = svg('path', { class: 'stage-star', d: STAR_PATH });
  #circuit = svg('circle', { class: 'stage-circuit' });
  #trail = svg('polyline', { class: 'stage-trail' });
  #popups = svg('g');
  #robot = createRobotFigure();

  constructor(simulator, label) {
    this.#simulator = simulator;
    this.#label = label;
    this.element = svg(
      'svg',
      { class: 'stage', role: 'img', 'aria-label': label },
      this.#mat,
      this.#grid,
      this.#startMark,
      this.#circuit,
      this.#things,
      this.#signs,
      this.#star,
      this.#boxes,
      this.#sightings,
      this.#trail,
      this.#robot.group,
      this.#held,
      this.#popups,
    );
    this.element.addEventListener('click', (event) => this.#onTap(event));
    simulator.addEventListener('change', () => this.#drawRobot());
    simulator.addEventListener('world', () => this.#drawWorld());
    simulator.addEventListener('things', () => this.#drawThings());
    simulator.addEventListener('thing', (event) => this.#popup(THING_POPUPS[event.detail.what]));
    simulator.addEventListener('mishap', () => this.#popup('😵'));
    simulator.addEventListener('sightings', () => this.#drawSightings());
    simulator.addEventListener('bump', () => this.#popup('💥'));
    simulator.addEventListener('note', () => this.#popup('🎵'));
    this.#drawWorld();
    this.#drawRobot();
  }

  /** The mat is as large as its world, and a printed map has its own colours and a mark on its starting square. */
  #drawMat() {
    const { cols, rows, start, map } = this.#simulator.world;
    this.element.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
    this.element.dataset.map = map ?? '';
    this.#mat.setAttribute('width', cols * CELL);
    this.#mat.setAttribute('height', rows * CELL);
    const lines = [];
    for (let x = 1; x < cols; x++) lines.push(`M${x * CELL},12 V${rows * CELL - 12}`);
    for (let y = 1; y < rows; y++) lines.push(`M12,${y * CELL} H${cols * CELL - 12}`);
    this.#grid.setAttribute('d', lines.join(' '));
    this.#startMark.replaceChildren(
      ...(map
        ? [
            svg('rect', { class: 'stage-start', x: start.x * CELL + 8, y: start.y * CELL + 8, width: 84, height: 84, rx: 18 }),
            svg('text', { class: 'stage-start-text', x: centre(start.x), y: start.y * CELL + 86, text: T.maps.start }),
          ]
        : []),
    );
  }

  /** The things of a printed map that lie on its squares; what the robot carries is drawn with the robot. */
  #drawThings() {
    this.#things.replaceChildren(
      ...this.#simulator.things
        .filter((thing) => !thing.held)
        .flatMap(({ x, y, icon, name, hazard }) => [
          hazard && svg('rect', { class: 'stage-hazard', x: x * CELL + 4, y: y * CELL + 4, width: 92, height: 92, rx: 16 }),
          svg('text', { class: 'stage-thing', x: centre(x), y: y * CELL + 44, text: icon }),
          svg('text', { class: 'stage-thing-name', x: centre(x), y: y * CELL + 86, text: name }),
        ])
        .filter(Boolean),
    );
    this.#drawRobot();
  }

  #drawWorld() {
    this.#drawMat();
    this.#drawThings();
    const { boxes, goal, signs } = this.#simulator;
    // The signs hold the possible answers, so they are read out with the picture's name.
    const words = signs.length > 0 ? ` ${T.program.signs(signs.map((sign) => sign.text))}` : '';
    this.element.setAttribute('aria-label', `${this.#label}.${words}`);
    this.#signs.replaceChildren(
      ...signs.flatMap(({ x, y, text }) => {
        const { size, width, left } = signPlate(x, text, this.#simulator.world.cols);
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
    const { circuit } = this.#simulator;
    this.#circuit.style.display = circuit ? '' : 'none';
    if (circuit) {
      for (const [name, value] of [['cx', centre(circuit.x)], ['cy', centre(circuit.y)], ['r', circuit.radius * CELL]]) this.#circuit.setAttribute(name, value);
    }
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
    // What the robot carries rides beside it in a bubble each, upright whichever way the robot faces.
    this.#held.setAttribute('transform', `translate(${centre(pose.x) + 30} ${centre(pose.y) - 30})`);
    this.#held.replaceChildren(
      ...this.#simulator.holding.flatMap((thing, i) => [
        svg('circle', { class: 'stage-held-bubble', cx: i * 30, cy: 0, r: 19 }),
        svg('text', { class: 'stage-held', x: i * 30, y: 1, text: thing.icon }),
      ]),
    );
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
    const { cols, rows } = this.#simulator.world;
    const x = Math.floor(((event.clientX - box.left) / box.width) * cols);
    const y = Math.floor(((event.clientY - box.top) / box.height) * rows);
    this.#simulator.toggleObstacle(x, y);
  }
}

/** A sign is as wide as its text needs: a long word spills a little over the squares beside it, never off the mat. */
function signPlate(x, text, cols) {
  const letters = [...text].length;
  const size = SIGN_SIZES.find(([upTo]) => letters <= upTo)[1];
  const width = Math.max(SIGN_MIN_WIDTH, letters * size * LETTER_WIDTH + SIGN_PADDING);
  const left = Math.max(4, Math.min(cols * CELL - width - 4, centre(x) - width / 2));
  return { size, width, left };
}
