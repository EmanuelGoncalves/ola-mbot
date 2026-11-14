import { el } from '../dom.js';
import { COLORS, NOTES } from '../robot/palette.js';
import { T } from '../texts.js';
import { createRobotPortrait } from './robot-figure.js';
import { StageView } from './stage-view.js';

const SPEEDS = [
  { id: 'slow', icon: '🐢', value: 100 },
  { id: 'normal', icon: '🐕', value: 160 },
  { id: 'fast', icon: '🐇', value: 230 },
];
const TURN_FACTOR = 0.7;
const PIANO_NOTE_MS = 300;

/** Wheel directions (left, right) for each arrow, and the keyboard key that does the same. */
const DIRECTIONS = [
  { id: 'forward', icon: '▲', wheels: [1, 1], key: 'ArrowUp' },
  { id: 'left', icon: '◀', wheels: [-TURN_FACTOR, TURN_FACTOR], key: 'ArrowLeft' },
  { id: 'right', icon: '▶', wheels: [TURN_FACTOR, -TURN_FACTOR], key: 'ArrowRight' },
  { id: 'backward', icon: '▼', wheels: [-1, -1], key: 'ArrowDown' },
];

/** The "Conduzir" tab: hold an arrow to drive, tap lights and piano keys. */
export class DriveView {
  #hub;
  #speed = SPEEDS[1].value;
  /** Arrows being pressed, newest last: the robot follows the newest. */
  #held = [];

  constructor({ hub, simulator }) {
    this.#hub = hub;
    const stage = new StageView(simulator, T.tabs.drive);
    stage.editable = false;
    const portrait = createRobotPortrait();
    simulator.addEventListener('change', () => portrait.setLights(simulator.lights));

    this.element = el(
      'div',
      { class: 'drive-view' },
      el(
        'section',
        { class: 'panel' },
        stage.element,
        el('div', { class: 'row' }, el('button', { class: 'button', type: 'button', onClick: () => simulator.reset() }, '🏠 ', T.drive.home)),
      ),
      el(
        'section',
        { class: 'panel' },
        el('h2', { text: T.drive.title }),
        el('p', { class: 'hint', text: T.drive.hint }),
        el('div', { class: 'pad' }, DIRECTIONS.map((direction) => this.#arrow(direction)), el('div', { class: 'pad-centre' }, portrait.element)),
        this.#speedChooser(),
        el(
          'div',
          { class: 'drive-group' },
          el('h3', { text: T.drive.lights }),
          el(
            'div',
            { class: 'row' },
            COLORS.map((color) =>
              el('button', {
                class: 'light-dot',
                type: 'button',
                style: `background:${color.hex}`,
                'aria-label': color.name,
                onClick: () => hub.setLights(color),
              }),
            ),
            el('button', { class: 'light-dot', type: 'button', 'aria-label': T.drive.lightsOff, onClick: () => hub.setLights(null) }, '🌙'),
          ),
        ),
        el(
          'div',
          { class: 'drive-group' },
          el('h3', { text: T.drive.piano }),
          el(
            'div',
            { class: 'piano' },
            NOTES.map((note) =>
              el('button', { class: 'piano-key', type: 'button', onClick: () => hub.playTone(note.hz, PIANO_NOTE_MS) }, note.name.split(' ')[0]),
            ),
          ),
        ),
      ),
    );

    document.addEventListener('keydown', (event) => this.#onKey(event, true));
    document.addEventListener('keyup', (event) => this.#onKey(event, false));
  }

  /** Lets go of every arrow and stops the robot. */
  stop() {
    this.#held = [];
    this.#hub.stop();
  }

  #arrow(direction) {
    const press = (event) => {
      this.#hold(direction, true);
      event.currentTarget.setPointerCapture(event.pointerId); // keeps driving if the finger slides off the arrow
    };
    const release = () => this.#hold(direction, false);
    return el(
      'button',
      {
        class: `pad-arrow pad-${direction.id}`,
        type: 'button',
        'aria-label': T.drive[direction.id],
        onPointerdown: press,
        onPointerup: release,
        onPointercancel: release,
        onLostpointercapture: release,
        onContextmenu: (event) => event.preventDefault(),
      },
      direction.icon,
    );
  }

  #speedChooser() {
    const buttons = SPEEDS.map((speed) =>
      el(
        'button',
        {
          class: 'button',
          type: 'button',
          'aria-pressed': String(speed.value === this.#speed),
          onClick: () => {
            this.#speed = speed.value;
            buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(SPEEDS[index] === speed)));
          },
        },
        `${speed.icon} ${T.drive.speeds[speed.id]}`,
      ),
    );
    return el('div', { class: 'drive-group' }, el('h3', { text: T.drive.speed }), el('div', { class: 'row' }, buttons));
  }

  /** Presses or lets go of an arrow, then drives the way the newest pressed arrow points. */
  #hold(direction, pressed) {
    this.#held = this.#held.filter((item) => item !== direction);
    if (pressed) this.#held.push(direction);
    const [left, right] = this.#held.at(-1)?.wheels ?? [0, 0];
    this.#hub.drive(left * this.#speed, right * this.#speed);
  }

  /** Arrow keys drive too, for computers with a keyboard. */
  #onKey(event, pressed) {
    const direction = DIRECTIONS.find((item) => item.key === event.key);
    const elsewhere = this.element.closest('[hidden]') || event.target.closest?.('input, dialog');
    if (!direction || event.repeat || elsewhere) return;
    event.preventDefault();
    this.#hold(direction, pressed);
  }
}
