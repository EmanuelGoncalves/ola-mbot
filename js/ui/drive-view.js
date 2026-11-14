import { el } from '../dom.js';
import { JINGLES, playJingle } from '../jingles.js';
import { OUT_OF_SIGHT_CM } from '../robot/mbot.js';
import { COLORS, NOTES } from '../robot/palette.js';
import { distinct, locate, SCAN, sweep } from '../robot/radar.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';
import { isAbort, sleep } from '../timing.js';
import { createRobotPortrait } from './robot-figure.js';
import { StageView } from './stage-view.js';

const SPEEDS = [
  { id: 'slow', icon: '🐢', value: 100 },
  { id: 'normal', icon: '🐕', value: 160 },
  { id: 'fast', icon: '🐇', value: 230 },
];
const TURN_FACTOR = 0.7;
const PIANO_NOTE_MS = 300;
const EYES_POLL_MS = 200;

/** Wheel directions (left, right) for each arrow, and the keyboard key that does the same. */
const DIRECTIONS = [
  { id: 'forward', icon: '▲', wheels: [1, 1], key: 'ArrowUp' },
  { id: 'left', icon: '◀', wheels: [-TURN_FACTOR, TURN_FACTOR], key: 'ArrowLeft' },
  { id: 'right', icon: '▶', wheels: [TURN_FACTOR, -TURN_FACTOR], key: 'ArrowRight' },
  { id: 'backward', icon: '▼', wheels: [-1, -1], key: 'ArrowDown' },
];

/** The "Conduzir" tab: hold an arrow to drive, map the room, tap lights, piano keys and jingles. */
export class DriveView {
  #hub;
  #simulator;
  #tuning;
  #onFreePlay;
  #speed = SPEEDS[1].value;
  /** Arrows being pressed, newest last: the robot follows the newest. */
  #held = [];
  /** The jingle being played and the controller that stops it, or null. */
  #playing = null;
  #pianoKeys = new Map();
  #jingleButtons = new Map();
  /** "Parar antes de bater": the eyes stop the robot from driving into things. */
  #eyesOn = load('eyes', false);
  #eyesWatching = false;
  #blocked = false;
  #eyesButton = el('button', { class: 'button', type: 'button', onClick: () => this.#setEyes(!this.#eyesOn) }, '👀 ', T.drive.eyesToggle);
  #eyesStatus = el('p', { class: 'hint eyes-status' });
  /** The radar turn in progress, if any. */
  #scan = null;
  /** Settles when the radar turn in progress, if any, is over. */
  #scanDone = Promise.resolve();
  #scanButton = el('button', { class: 'button', type: 'button', onClick: () => this.#scanRoom() });
  #mapStatus = el('p', { class: 'hint map-status', 'aria-live': 'polite' });
  #scale = el('p', { class: 'hint' });

  /** `onFreePlay` closes any lesson or mission, so the mat is the child's own. */
  constructor({ hub, simulator, tuning, onFreePlay }) {
    this.#hub = hub;
    this.#simulator = simulator;
    this.#tuning = tuning;
    this.#onFreePlay = onFreePlay;
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
        el('div', { class: 'row' }, el('button', { class: 'button', type: 'button', onClick: () => this.#goHome() }, '🏠 ', T.drive.home)),
        this.#scale,
      ),
      el(
        'section',
        { class: 'panel' },
        el('h2', { text: T.drive.title }),
        el('p', { class: 'hint', text: T.drive.hint }),
        el('div', { class: 'pad' }, DIRECTIONS.map((direction) => this.#arrow(direction)), el('div', { class: 'pad-centre' }, portrait.element)),
        this.#speedChooser(),
        el('div', { class: 'drive-group' }, el('h3', { text: T.drive.eyes }), el('div', { class: 'row' }, this.#eyesButton, this.#eyesStatus)),
        el(
          'div',
          { class: 'drive-group' },
          el('h3', { text: T.drive.map }),
          el('p', { class: 'hint', text: T.drive.mapHint }),
          el(
            'div',
            { class: 'row' },
            this.#scanButton,
            el('button', { class: 'button', type: 'button', onClick: () => this.#clearMap() }, '🧽 ', T.drive.mapClear),
          ),
          this.#mapStatus,
        ),
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
            NOTES.map((note) => this.#pianoKey(note)),
          ),
        ),
        el(
          'div',
          { class: 'drive-group' },
          el('h3', { text: T.drive.jingles }),
          el('p', { class: 'hint', text: T.drive.jinglesHint }),
          el('div', { class: 'jingles' }, JINGLES.map((jingle) => this.#jingleButton(jingle))),
        ),
      ),
    );

    document.addEventListener('keydown', (event) => this.#onKey(event, true));
    document.addEventListener('keyup', (event) => this.#onKey(event, false));
    // A key let go while another window is in front never tells us: let go of the arrows when the window loses focus.
    window.addEventListener('blur', () => {
      if (this.#held.length === 0) return;
      this.#held = [];
      this.#applyDrive();
    });
    this.#setEyes(this.#eyesOn);
    this.#showScanning(false);
    this.showScale();
  }

  /** Lets go of every arrow, stops the robot, the radar and the jingle. */
  stop() {
    this.#held = [];
    this.#scan?.abort();
    this.#playing?.abort.abort();
    this.#hub.stop();
  }

  /** Says how big a square of the mat is on the floor. */
  showScale() {
    this.#scale.textContent = `📏 ${T.program.scale(this.#tuning.cellCm)}`;
  }

  /**
   * The radar: the robot turns once around and looks at every stop. What the real
   * mBot sees becomes the boxes of the mat; the robot on screen only shows what it sees.
   */
  #scanRoom() {
    if (this.#scan) this.#scan.abort();
    else this.#scanDone = this.#sweepRoom();
  }

  async #sweepRoom() {
    this.stop();
    const scan = new AbortController();
    const real = this.#hub.connected;
    if (real) this.#onFreePlay(); // the mat is about to change
    const pose = { ...this.#simulator.pose };
    let stops = 0;
    this.#scan = scan;
    this.#showScanning(true);
    this.#simulator.showSightings([]);
    this.#mapStatus.textContent = T.drive.mapScanning(0, SCAN.stops);
    try {
      const seen = await sweep(this.#hub, {
        stepMs: this.#tuning.scanStepMs,
        signal: scan.signal,
        onStop: (reading) => {
          this.#mapStatus.textContent = T.drive.mapScanning(++stops, SCAN.stops);
          if (reading.range === null) return;
          this.#simulator.showSightings([...this.#simulator.sightings, { from: pose, to: locate(pose, reading).spot }]);
        },
      });
      if (!real) {
        this.#mapStatus.textContent = T.drive.mapOnScreen;
      } else if (this.#hub.connected) {
        this.#simulator.setBoxes(distinct(seen).map((reading) => locate(pose, reading).cell));
        this.#mapStatus.textContent = T.drive.mapFound(this.#simulator.boxes.length);
      } else {
        this.#mapStatus.textContent = T.drive.mapStopped; // the mBot went away half-way: the readings cannot be trusted
      }
    } catch (error) {
      if (!isAbort(error)) throw error;
      this.#mapStatus.textContent = T.drive.mapStopped;
    } finally {
      this.#scan = null;
      this.#showScanning(false);
      await this.#hub.stop();
    }
  }

  /** Puts the robot on screen back on its starting square; a radar turn would no longer match. */
  #goHome() {
    this.#scan?.abort();
    this.#simulator.reset();
  }

  #showScanning(scanning) {
    this.#scanButton.textContent = scanning ? `■ ${T.drive.mapStop}` : `🗺️ ${T.drive.mapScan}`;
  }

  async #clearMap() {
    this.stop();
    await this.#scanDone.catch(() => {});
    this.#onFreePlay();
    this.#simulator.setBoxes([]);
    this.#simulator.showSightings([]);
    this.#mapStatus.textContent = T.drive.mapCleared;
  }

  #pianoKey(note) {
    const key = el(
      'button',
      { class: 'piano-key', type: 'button', 'aria-label': note.name, onClick: () => this.#hub.playTone(note.hz, PIANO_NOTE_MS) },
      note.name.split(' ')[0],
    );
    this.#pianoKeys.set(note.id, key);
    return key;
  }

  #jingleButton(jingle) {
    const button = el(
      'button',
      { class: 'button jingle', type: 'button', 'aria-pressed': 'false', onClick: () => this.#toggleJingle(jingle) },
      el('span', { 'aria-hidden': 'true', text: jingle.icon }),
      jingle.name,
    );
    this.#jingleButtons.set(jingle, button);
    return button;
  }

  /** Plays a jingle; tapping the one that is playing stops it. */
  async #toggleJingle(jingle) {
    const wasPlaying = this.#playing?.jingle === jingle;
    this.#playing?.abort.abort();
    if (wasPlaying) return;
    const abort = new AbortController();
    const current = () => this.#playing?.abort === abort;
    this.#playing = { jingle, abort };
    this.#showPlaying(jingle, null);
    try {
      await playJingle(jingle, this.#hub, {
        signal: abort.signal,
        onNote: (id) => current() && this.#showPlaying(jingle, id),
      });
    } catch (error) {
      if (!isAbort(error)) throw error;
    } finally {
      if (current()) {
        this.#playing = null;
        this.#showPlaying(null, null);
      }
    }
  }

  /** Marks the jingle being played and lights the piano key of its current note. */
  #showPlaying(jingle, noteId) {
    for (const [item, button] of this.#jingleButtons) button.setAttribute('aria-pressed', String(item === jingle));
    for (const [id, key] of this.#pianoKeys) key.classList.toggle('is-playing', id === noteId);
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
    this.#applyDrive();
  }

  /** Drives as the newest pressed arrow says; with the eyes on, not forwards into an obstacle. */
  #applyDrive() {
    if (this.#scan) return; // the radar is turning the robot
    const direction = this.#held.at(-1);
    const braking = this.#eyesOn && this.#blocked && direction?.id === 'forward';
    const [left, right] = direction && !braking ? direction.wheels : [0, 0];
    this.#hub.drive(left * this.#speed, right * this.#speed);
  }

  #setEyes(on) {
    this.#eyesOn = on;
    save('eyes', on);
    this.#eyesButton.setAttribute('aria-pressed', String(on));
    this.#seen({ blocked: false, cm: null });
    if (on) this.#watch();
  }

  /** Looks ahead a few times a second while the eyes are on and this tab is showing. */
  async #watch() {
    if (this.#eyesWatching) return;
    this.#eyesWatching = true;
    while (this.#eyesOn) {
      const showing = !document.hidden && !this.element.closest('[hidden]');
      if (showing && !this.#scan) this.#seen(await this.#hub.look());
      await sleep(EYES_POLL_MS);
    }
    this.#eyesWatching = false;
  }

  /** Shows what the eyes see and brakes or lets go as it changes. */
  #seen({ blocked, cm }) {
    const inSight = cm !== null && cm > 0 && cm < OUT_OF_SIGHT_CM;
    const sight = `${blocked ? T.drive.eyesBlocked : T.drive.eyesClear}${inSight ? ` ${T.drive.eyesDistance(cm)}` : ''}`;
    this.#eyesStatus.textContent = this.#eyesOn ? sight : T.drive.eyesOff;
    this.#eyesStatus.classList.toggle('is-blocked', this.#eyesOn && blocked);
    if (blocked === this.#blocked) return;
    this.#blocked = blocked;
    if (this.#held.length > 0) this.#applyDrive(); // with no arrow held, the robot is not ours to stop
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
