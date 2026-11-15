import { el } from '../dom.js';
import { freePlayOn, LEVELS, MAP_SQUARE_CM, MAPS, missionsAt, missionsOn } from '../maps.js';
import { correctedStepTime, squareOf } from '../robot/tuning.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';
import { isAbort, sleep } from '../timing.js';

/** The test move of the step tuning goes this many squares. */
const TEST_SQUARES = 3;
/** Between the quarter turns of the test, as between two blocks of a program. */
const TURN_REST_MS = 250;
/** One tap on "rodou de menos" or "rodou demais" changes the quarter turn by this part. */
const TURN_NUDGE = 0.04;

/**
 * The "Mapas" tab: the printed maps, their missions by level, and a way to tune the real robot
 * on a map. `onPlay(mission)` opens a mission in the Programar tab; `tune(key, value)` changes a
 * tuning value and returns what it became.
 */
export class MapsView {
  #board;
  #hub;
  #tuning;
  #tune;
  #onPlay;
  #map = MAPS.find((map) => map.id === load('map', null)) ?? MAPS[0];
  /** The test move in progress, if any. */
  #test = null;
  #went = el('input', { id: 'map-went', type: 'range', min: 0.5, max: 6, step: 0.1, value: TEST_SQUARES, onInput: () => this.#showWent() });
  #wentReadout = el('output', { for: 'map-went' });
  #report = el('p', { class: 'hint', 'aria-live': 'polite' });
  #tuner;

  constructor({ board, hub, tuning, tune, onPlay }) {
    this.#board = board;
    this.#hub = hub;
    this.#tuning = tuning;
    this.#tune = tune;
    this.#onPlay = onPlay;
    this.#tuner = this.#buildTuner();
    this.element = el('div', { class: 'maps-view' });
    board.addEventListener('change', () => this.#render());
    this.#showWent();
    this.#render();
  }

  /** Stops a test move. */
  stop() {
    this.#test?.abort();
  }

  #render() {
    const missions = missionsOn(this.#map);
    this.element.replaceChildren(
      el(
        'header',
        { class: 'view-intro' },
        el('h2', { text: T.maps.title }),
        el('p', { text: T.maps.intro }),
        el('p', { class: 'hint', text: T.maps.how }),
        el('div', { class: 'choice', role: 'group', 'aria-label': T.maps.choose }, MAPS.map((map) => this.#mapButton(map))),
        el('p', { class: 'view-progress', text: `⭐ ${T.maps.progress(this.#board.starsIn(missions), missions.length, this.#map.name)}` }),
      ),
      el(
        'section',
        { class: 'panel map-board' },
        this.#preview(),
        el('p', { class: 'hint', text: T.maps.place(MAP_SQUARE_CM) }),
        el('button', { class: 'button', type: 'button', onClick: () => this.#onPlay(freePlayOn(this.#map)) }, '🖍️ ', T.maps.freePlay),
      ),
      ...LEVELS.map((level) => this.#level(level)),
      this.#tuner,
    );
  }

  #mapButton(map) {
    const choose = () => {
      this.#map = map;
      save('map', map.id);
      this.#render();
    };
    return el('button', { class: 'button', type: 'button', 'aria-pressed': String(map === this.#map), onClick: choose }, `${map.icon} ${map.name}`);
  }

  /** The map as it lies on the floor, square by square, to check it against the printed one. */
  #preview() {
    const { cols, rows, start, things, id, name } = this.#map;
    const squares = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const thing = things.find((item) => item.x === x && item.y === y);
        const isStart = start.x === x && start.y === y;
        squares.push(
          el(
            'div',
            { class: `map-square${thing?.hazard ? ' is-hazard' : ''}${isStart ? ' is-start' : ''}` },
            el('span', { class: 'map-square-icon', text: isStart ? '🤖' : (thing?.icon ?? '') }),
            el('span', { class: 'map-square-name', text: isStart ? T.maps.start : (thing?.name ?? '') }),
          ),
        );
      }
    }
    const label = T.maps.preview(name, things.map((item) => item.name).join(', '));
    return el('div', { class: 'map-preview', 'data-map': id, style: `--cols: ${cols}`, role: 'img', 'aria-label': label }, squares);
  }

  #level(level) {
    return el(
      'section',
      { class: 'school-level' },
      el('h3', { text: `${level.icon} ${level.name}` }),
      el('ol', { class: 'card-grid' }, missionsAt(this.#map, level).map((mission, index) => this.#card(mission, index + 1))),
    );
  }

  #card(mission, number) {
    const earned = this.#board.hasStar(mission);
    return el(
      'li',
      { class: `card${earned ? ' is-done' : ''}` },
      el(
        'div',
        { class: 'card-top' },
        el('span', { 'aria-hidden': 'true', text: mission.icon }),
        earned ? el('span', { role: 'img', 'aria-label': T.maps.earned, text: '⭐' }) : el('span', { class: 'card-mark-empty', 'aria-hidden': 'true', text: '☆' }),
      ),
      el('h3', { text: `${number}. ${mission.title}` }),
      el('p', { text: mission.goal }),
      el('button', { class: `button${earned ? '' : ' button-brand'}`, type: 'button', onClick: () => this.#onPlay(mission) }, earned ? T.maps.replay : T.maps.play),
    );
  }

  /** The printed squares are a ruler: the step and the quarter turn can be put right by eye. */
  #buildTuner() {
    const button = (label, run) => el('button', { class: 'button', type: 'button', onClick: run }, label);
    return el(
      'details',
      { class: 'fold map-tuner' },
      el('summary', { text: T.maps.tuneTitle }),
      el('p', { class: 'hint', text: T.maps.tuneIntro }),
      el('p', { text: T.maps.stepIntro }),
      el('div', { class: 'row' }, button(`⬆️ ${T.maps.stepTest}`, () => this.#move((robot, signal) => robot.move(TEST_SQUARES, signal)))),
      el('div', { class: 'tuning-row' }, el('label', { for: 'map-went' }, T.maps.stepWent, ' ', this.#wentReadout), this.#went, button(`📏 ${T.maps.stepFix}`, () => this.#fixStep())),
      el('p', { text: T.maps.turnIntro }),
      el(
        'div',
        { class: 'row' },
        button(`🔄 ${T.maps.turnTest}`, () => this.#move((robot, signal) => fullTurn(robot, signal))),
        button(`↩️ ${T.maps.turnLess}`, () => this.#nudgeTurn(1)),
        button(`↪️ ${T.maps.turnMore}`, () => this.#nudgeTurn(-1)),
      ),
      this.#report,
    );
  }

  #showWent() {
    this.#wentReadout.textContent = Number(this.#went.value).toFixed(1).replace('.', ',');
  }

  /** Runs one test move on the real robot alone, with steps the size of the map's squares. */
  async #move(move) {
    const robot = this.#hub.real;
    if (!robot) return this.#say(T.maps.tuneNeedsRobot);
    if (this.#test) return;
    this.#test = new AbortController();
    this.#say(T.maps.moving);
    const before = this.#tuning.mapCm;
    this.#tuning.mapCm = MAP_SQUARE_CM;
    try {
      await move(robot, this.#test.signal);
    } catch (error) {
      if (!isAbort(error)) throw error;
    } finally {
      if (before === undefined) delete this.#tuning.mapCm;
      else this.#tuning.mapCm = before;
      this.#test = null;
      this.#say('');
      await robot.stop();
    }
  }

  /** The robot went `#went` squares instead of three: the step time is changed by as much. */
  #fixStep() {
    const went = Number(this.#went.value);
    if (went === TEST_SQUARES) return this.#say(T.maps.stepRight);
    this.#tune('stepMs', correctedStepTime(this.#tuning.stepMs, TEST_SQUARES, went));
    this.#went.value = TEST_SQUARES;
    this.#showWent();
    this.#say(T.maps.stepDone(Math.round(squareOf({ ...this.#tuning, mapCm: MAP_SQUARE_CM }).ms)));
  }

  /** Makes the quarter turn a little longer (`way` 1) or shorter (−1). */
  #nudgeTurn(way) {
    const ms = this.#tuning.quarterTurnMs;
    const change = Math.max(10, Math.round((ms * TURN_NUDGE) / 10) * 10);
    this.#say(T.maps.turnDone(this.#tune('quarterTurnMs', ms + way * change)));
  }

  #say(text) {
    this.#report.textContent = text;
  }
}

/** Four quarter turns with a rest between them, as a program would make them. */
async function fullTurn(robot, signal) {
  for (let quarter = 0; quarter < 4; quarter++) {
    await robot.turn(1, signal);
    await sleep(TURN_REST_MS, signal);
  }
}
