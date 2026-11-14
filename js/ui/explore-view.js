import { el, svg } from '../dom.js';
import { JINGLES, playJingle } from '../jingles.js';
import { Explorer, Phase, realBody } from '../robot/explorer.js';
import { colorById } from '../robot/palette.js';
import { ROOMS, VirtualRoom, wallsOf } from '../robot/room.js';
import { T } from '../texts.js';
import { isAbort } from '../timing.js';
import { celebrate } from './celebrate.js';
import { createRobotFigure } from './robot-figure.js';

/** Pause after each move of the robot on screen, so the exploring can be watched. */
const PACE_MS = 140;
/** The map always shows at least this much floor, in cm, and this much around what was seen. */
const SMALLEST_MAP_CM = 320;
const MARGIN_CM = 45;
/** The robot figure is about 90 units tall. It is drawn a little larger than life (the mBot is 17 cm long), to be easy to see. */
const ROBOT_SCALE = 0.3;
const VICTORY = JINGLES.find((jingle) => jingle.id === 'victory');

/**
 * The "Explorar" part of the Conduzir tab: the robot looks for the way out of the room by
 * itself, and a map shows where it thinks it has been. With a real mBot connected it explores
 * the real room; without one, the robot on screen explores a pretend room.
 */
export class ExploreView {
  #hub;
  #tuning;
  /** The exploring in progress, if any. */
  #run = null;
  #room = 0;

  // What the map shows, in cm from where the robot started; y grows ahead of it.
  #walls = [];
  #path = [];
  #hits = [];
  #door = null;
  #pose = { x: 0, y: 0, heading: 0 };

  #map = svg('svg', { class: 'explore-map', role: 'img', 'aria-label': T.explore.mapLabel });
  #robot = createRobotFigure();
  #status = el('p', { text: T.explore.ready });
  #steps = Object.values(Phase).map((phase) => ({ phase, item: el('li', { text: T.explore.phases[phase].name }) }));
  #startButton = el('button', { class: 'button button-go button-big', type: 'button', onClick: () => this.start() }, '🧭 ', T.explore.start);
  #stopButton = el('button', { class: 'button button-stop button-big', type: 'button', hidden: true, onClick: () => this.stop() }, '■ ', T.explore.stop);
  #roomButton = el('button', { class: 'button', type: 'button', onClick: () => this.#nextRoom() }, '🚪 ', T.explore.otherRoom);
  #roomNote = el('p', { class: 'hint' });

  constructor({ hub, tuning }) {
    this.#hub = hub;
    this.#tuning = tuning;
    this.mapPanel = el('section', { class: 'panel explore-map-panel', hidden: true }, this.#map, el('p', { class: 'hint', text: T.explore.legend }));
    this.controlPanel = el(
      'section',
      { class: 'panel', hidden: true },
      el('h2', { text: T.explore.title }),
      el('p', { class: 'hint', text: T.explore.intro }),
      el('div', { class: 'row' }, this.#startButton, this.#stopButton, this.#roomButton),
      el('div', { class: 'bubble', 'aria-live': 'polite' }, this.#status),
      this.#roomNote,
      el('div', { class: 'drive-group' }, el('h3', { text: T.explore.plan }), el('ol', { class: 'explore-plan' }, this.#steps.map((step) => step.item))),
      el(
        'details',
        { class: 'fold' },
        el('summary', { text: T.explore.tipsTitle }),
        el('ul', { class: 'steps' }, T.explore.tips.map((text) => el('li', { text }))),
      ),
    );
    this.#showRoom();
  }

  get exploring() {
    return this.#run !== null;
  }

  stop() {
    this.#run?.abort();
  }

  async start() {
    if (this.#run) return;
    const real = this.#hub.real;
    const run = new AbortController();
    const body = real ? realBody(real, this.#tuning) : new VirtualRoom(ROOMS[this.#room], { pace: PACE_MS });
    this.#run = run;
    this.#setRunning(true);
    this.#clearMap(real ? [] : wallsAround(ROOMS[this.#room]));
    this.#hub.focus(true);
    try {
      const explorer = new Explorer(body, {
        stepCm: this.#tuning.cellCm,
        signal: run.signal,
        onEvent: (event) => {
          // A robot that went away would be explored for by guesses: stop instead.
          if (real && !this.#hub.connected) run.abort();
          else this.#heard(event);
        },
      });
      const result = await explorer.run();
      this.#hub.focus(false);
      if (result.found) await this.#celebrate(result.widthCm, run.signal);
      else this.#say(T.explore.gaveUp[result.reason]);
    } catch (error) {
      if (!isAbort(error)) throw error;
      this.#say(real && !this.#hub.connected ? T.explore.lost : T.explore.stopped);
    } finally {
      this.#run = null;
      this.#setRunning(false);
      this.#hub.focus(false);
      await this.#hub.stop();
    }
  }

  /** Follows what the explorer does: its place on the map, and what it says about it. */
  #heard(event) {
    if (event.type === 'pose') {
      this.#pose = event.pose;
      this.#path.push(event.pose);
      this.#draw();
    } else if (event.type === 'hit') {
      this.#hits.push(event);
    } else if (event.type === 'phase') {
      this.#showStep(event.phase);
      this.#say(T.explore.phases[event.phase].doing);
    } else if (event.type === 'gap') {
      const cm = Math.round(event.width);
      this.#say(event.width === null ? T.explore.notDoor : event.small ? T.explore.tooSmall(cm) : T.explore.tooWide(cm));
    } else if (event.type === 'door') {
      this.#door = { ...this.#pose, widthCm: event.widthCm };
      this.#say(T.explore.door(event.widthCm));
      this.#draw();
    } else if (event.type === 'closed') {
      this.#door = null;
      this.#say(T.explore.closed);
    }
  }

  async #celebrate(widthCm, signal) {
    this.#say(T.explore.out(widthCm));
    celebrate();
    await this.#hub.setLights(colorById('green'));
    await playJingle(VICTORY, this.#hub, { signal });
    await this.#hub.setLights(null);
  }

  #say(text) {
    this.#status.textContent = text;
  }

  #showStep(phase) {
    for (const step of this.#steps) {
      step.item.classList.toggle('is-current', step.phase === phase);
      if (step.phase === phase) step.item.setAttribute('aria-current', 'step');
      else step.item.removeAttribute('aria-current');
    }
  }

  #setRunning(running) {
    this.#startButton.hidden = running;
    this.#stopButton.hidden = !running;
    this.#roomButton.disabled = running;
    if (!running) this.#showStep(null);
  }

  #nextRoom() {
    this.#room = (this.#room + 1) % ROOMS.length;
    this.#showRoom();
    this.#say(T.explore.ready);
  }

  /** Before exploring, the map shows the pretend room the robot on screen would explore. */
  #showRoom() {
    this.#roomNote.textContent = T.explore.onScreen(ROOMS[this.#room].name);
    this.#clearMap(wallsAround(ROOMS[this.#room]));
  }

  #clearMap(walls) {
    this.#walls = walls;
    this.#path = [{ x: 0, y: 0 }];
    this.#hits = [];
    this.#door = null;
    this.#pose = { x: 0, y: 0, heading: 0 };
    this.#draw();
  }

  /** Draws the map, as large as it needs to be to hold everything seen so far. Ahead of the start is up. */
  #draw() {
    const points = [...this.#path, ...this.#hits, ...this.#walls.flatMap(([x1, y1, x2, y2]) => [{ x: x1, y: y1 }, { x: x2, y: y2 }])];
    const [xs, ys] = [points.map((point) => point.x), points.map((point) => -point.y)];
    const span = Math.max(SMALLEST_MAP_CM, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * MARGIN_CM;
    const [left, top] = [(Math.max(...xs) + Math.min(...xs) - span) / 2, (Math.max(...ys) + Math.min(...ys) - span) / 2];
    this.#map.setAttribute('viewBox', `${left} ${top} ${span} ${span}`);
    const { x, y, heading } = this.#pose;
    this.#robot.group.setAttribute('transform', `translate(${x} ${-y}) rotate(${heading}) scale(${ROBOT_SCALE})`);
    this.#map.replaceChildren(
      svg('rect', { class: 'explore-floor', x: left, y: top, width: span, height: span }),
      svg('path', { class: 'explore-wall', d: this.#walls.map(([x1, y1, x2, y2]) => `M${x1},${-y1} L${x2},${-y2}`).join(' ') }),
      ...this.#hits.map((hit) => svg('circle', { class: 'explore-hit', cx: hit.x, cy: -hit.y, r: 3 })),
      svg('polyline', { class: 'explore-path', points: this.#path.map((point) => `${point.x},${-point.y}`).join(' ') }),
      this.#door && svg('circle', { class: 'explore-door', cx: this.#door.x, cy: -this.#door.y, r: 14 }),
      this.#door && svg('text', { class: 'explore-door-label', x: this.#door.x, y: -this.#door.y - 22, text: `🚪 ${this.#door.widthCm} cm` }),
      this.#robot.group,
    );
  }
}

/**
 * The walls of a pretend room as the robot sees the world: in cm from where it starts, with
 * what is ahead of it up the map.
 */
function wallsAround(room) {
  const { x, y, heading } = room.start;
  const turn = (heading * Math.PI) / 180;
  const seen = (px, py) => [(px - x) * Math.cos(turn) - (py - y) * Math.sin(turn), (px - x) * Math.sin(turn) + (py - y) * Math.cos(turn)];
  return wallsOf(room).map(([x1, y1, x2, y2]) => [...seen(x1, y1), ...seen(x2, y2)]);
}
