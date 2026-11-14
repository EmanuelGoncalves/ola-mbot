import { colorById, COLORS } from './robot/palette.js';
import { load, save } from './storage.js';
import { sleep } from './timing.js';

/** A step of a show with the lights off. */
export const OFF = 'off';
/** The id of the show the child makes. */
export const MY_SHOW_ID = 'mine';

const BEAT_MS = 400;
/** How long each colour of the child's own show stays on. */
export const SHOW_SPEEDS = [
  { id: 'slow', icon: '🐢', beatMs: 800 },
  { id: 'normal', icon: '🐕', beatMs: 400 },
  { id: 'fast', icon: '🐇', beatMs: 180 },
];
const MOST_STEPS = 16;

const repeat = (times, steps) => Array.from({ length: times }, () => steps).flat();

/**
 * Light shows: colours that follow one another on the robot's two lights.
 * Each step is [colour id or OFF, beats].
 */
export const SHOWS = [
  {
    id: 'rainbow',
    icon: '🌈',
    name: 'Arco-íris',
    steps: [['red', 1], ['orange', 1], ['yellow', 1], ['green', 1], ['blue', 1], ['purple', 1], ['pink', 1]],
  },
  { id: 'police', icon: '🚓', name: 'Carro da polícia', steps: repeat(4, [['blue', 0.5], ['red', 0.5]]) },
  { id: 'traffic-light', icon: '🚦', name: 'Semáforo', steps: [['green', 4], ['yellow', 1.5], ['red', 4]] },
  { id: 'heart', icon: '💓', name: 'Coração a bater', steps: repeat(3, [['red', 0.4], [OFF, 0.4], ['red', 0.4], [OFF, 1.6]]) },
  { id: 'fire', icon: '🔥', name: 'Fogueira', steps: repeat(2, [['red', 0.6], ['orange', 0.4], ['yellow', 0.3], ['orange', 0.5], ['red', 0.3], ['yellow', 0.4]]) },
  { id: 'sea', icon: '🌊', name: 'Ondas do mar', steps: repeat(2, [['blue', 2], ['green', 1.5], ['white', 0.75], ['green', 1.5]]) },
  {
    id: 'party',
    icon: '🎉',
    name: 'Festa',
    steps: repeat(2, [['purple', 0.5], ['pink', 0.5], ['blue', 0.5], ['green', 0.5], ['yellow', 0.5], ['orange', 0.5], ['white', 0.5], ['red', 0.5]]),
  },
  { id: 'lightning', icon: '⚡', name: 'Trovoada', steps: [['white', 0.25], [OFF, 0.25], ['white', 0.25], [OFF, 2], ['white', 0.5], [OFF, 0.5], ['white', 0.25], [OFF, 2.5]] },
  { id: 'christmas', icon: '🎄', name: 'Natal', steps: [...repeat(3, [['red', 1], ['green', 1]]), ['white', 0.5], [OFF, 0.5], ['white', 0.5], [OFF, 0.5]] },
  { id: 'sunset', icon: '🌅', name: 'Pôr do sol', steps: [['yellow', 2.5], ['orange', 2.5], ['pink', 2.5], ['purple', 2.5], ['blue', 2.5], [OFF, 1.5]] },
  { id: 'unicorn', icon: '🦄', name: 'Unicórnio', steps: repeat(2, [['pink', 1], ['purple', 1], ['white', 0.5], ['blue', 1], ['white', 0.5]]) },
  { id: 'twinkle', icon: '✨', name: 'Pisca-pisca', steps: repeat(3, [['yellow', 0.5], [OFF, 0.5], ['white', 0.5], [OFF, 0.5]]) },
];

/**
 * Plays a show once on `robot` (see RobotHub) and leaves the lights off.
 * `onStep(index)` is called as each step starts; abort `signal` to stop.
 */
export async function playShow(show, robot, { signal, onStep = () => {}, wait = sleep } = {}) {
  const beatMs = show.beatMs ?? BEAT_MS;
  try {
    for (const [index, [color, beats]] of show.steps.entries()) {
      signal?.throwIfAborted();
      onStep(index);
      await robot.setLights(colorById(color));
      await wait(beats * beatMs, signal);
    }
  } finally {
    await robot.setLights(null);
  }
}

/**
 * The show the child makes: a row of colours, each on for one beat, and a speed.
 * Fires `change`. `store` can be replaced in tests.
 */
export class MyShow extends EventTarget {
  #store;
  #colors;
  #speed;

  constructor(store = { load, save }) {
    super();
    this.#store = store;
    const saved = store.load('my-show', {});
    const known = (color) => color === OFF || COLORS.some((item) => item.id === color);
    this.#colors = Array.isArray(saved.colors) ? saved.colors.filter(known).slice(0, MOST_STEPS) : ['red', 'yellow', 'green', 'blue'];
    this.#speed = SHOW_SPEEDS.find((speed) => speed.id === saved.speed) ?? SHOW_SPEEDS[1];
  }

  /** Colour ids, or OFF, in the order they light up. */
  get colors() {
    return [...this.#colors];
  }

  get speed() {
    return this.#speed;
  }

  get full() {
    return this.#colors.length >= MOST_STEPS;
  }

  /** The child's show in the shape of the others, for `playShow`. */
  get show() {
    return { id: MY_SHOW_ID, steps: this.#colors.map((color) => [color, 1]), beatMs: this.#speed.beatMs };
  }

  add(color) {
    if (this.full) return;
    this.#colors.push(color);
    this.#changed();
  }

  removeAt(index) {
    this.#colors.splice(index, 1);
    this.#changed();
  }

  clear() {
    this.#colors = [];
    this.#changed();
  }

  setSpeed(speed) {
    this.#speed = speed;
    this.#changed();
  }

  #changed() {
    this.#store.save('my-show', { colors: this.#colors, speed: this.#speed.id });
    this.dispatchEvent(new Event('change'));
  }
}

/** The one show of the child's own, shared by the Programar and Conduzir tabs. */
export const myShow = new MyShow();

/** A show by its id: one of the list, or the child's own. */
export function showById(id) {
  return id === MY_SHOW_ID ? myShow.show : (SHOWS.find((show) => show.id === id) ?? SHOWS[0]);
}
