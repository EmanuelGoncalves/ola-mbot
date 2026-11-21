import { el } from '../dom.js';
import { MAP_SQUARE_CM } from '../maps.js';
import { runProgram } from '../program/interpreter.js';
import { Program } from '../program/program.js';
import { Mishap } from '../robot/simulator.js';
import { squareOf } from '../robot/tuning.js';
import { BLOCK_KEYS, keyOf, PROGRAM_KEYS } from '../shortcuts.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';
import { isAbort } from '../timing.js';
import { celebrate } from './celebrate.js';
import { Coach } from './coach.js';
import { createPalette, ProgramEditor } from './program-editor.js';
import { roundDots } from './round-dots.js';
import { StageView } from './stage-view.js';

const FREE_PLAY = 'free';

/** The "Programar" tab: the lesson coach or the mission on top, then blocks, the program, the mat and the run buttons. */
export class ProgramView {
  #program = new Program();
  #editor = new ProgramEditor(this.#program);
  #hub;
  #simulator;
  #tuning;
  #board;
  #tutorial;
  #stage;
  #coach;
  #abort = null;
  /** What is open: free play, a mission id or a lesson. Each has its own program and mat. */
  #slot = FREE_PLAY;

  #message = el('p', { text: T.program.welcome });
  #messageAction = el('span');
  #missionBanner = el('div', { class: 'mission-banner', hidden: true });
  #runButton = el('button', { class: 'button button-go button-big', type: 'button', onClick: () => this.run() }, '▶ ', T.program.run);
  #stopButton = el('button', { class: 'button button-stop button-big', type: 'button', hidden: true, onClick: () => this.stop() }, '■ ', T.program.stop);
  #homeButton = el('button', { class: 'button', type: 'button', onClick: () => this.#simulator.reset() }, '🏠 ', T.program.home);
  #matHint = el('p', { class: 'hint' });
  #stagePanel;
  #editPanels;

  constructor({ hub, simulator, tuning, board, tutorial, onPlayLesson, onShowMissions, onShowMore }) {
    this.#hub = hub;
    this.#simulator = simulator;
    this.#tuning = tuning;
    this.#board = board;
    this.#tutorial = tutorial;
    this.#stage = new StageView(simulator, T.tabs.program);

    const palettePanel = el(
      'section',
      { class: 'panel palette-panel' },
      el('h2', { text: T.program.paletteTitle }),
      el('p', { class: 'hint', text: T.program.paletteHint }),
      createPalette((type) => this.#editor.add(type)),
    );
    const editorPanel = el(
      'section',
      { class: 'panel editor-panel' },
      el(
        'div',
        { class: 'panel-title' },
        el('h2', { text: T.program.editorTitle }),
        el('button', { class: 'button', type: 'button', onClick: () => this.#clear() }, '🧽 ', T.program.clear),
      ),
      this.#editor.element,
    );
    this.#stagePanel = el(
      'section',
      { class: 'panel stage-panel' },
      this.#stage.element,
      el('div', { class: 'bubble', 'aria-live': 'polite' }, this.#message, this.#messageAction),
      el('div', { class: 'row' }, this.#runButton, this.#stopButton, this.#homeButton),
      this.#matHint,
    );
    this.#editPanels = [palettePanel, editorPanel];
    this.element = el(
      'div',
      { class: 'program-view', 'data-mode': FREE_PLAY },
      el('div', { class: 'program-grid' }, palettePanel, editorPanel, this.#stagePanel),
    );
    this.#coach = new Coach({
      tutorial,
      program: this.#program,
      editor: this.#editor,
      simulator,
      scope: this.element,
      onPlay: onPlayLesson,
      onShowMissions,
    });
    this.element.prepend(this.#coach.element, this.#missionBanner);

    this.#load();
    this.#program.addEventListener('change', () => {
      if (!tutorial.active && !board.active?.make) save(`program:${this.#slot}`, this.#program.serialize());
      this.#messageAction.replaceChildren(); // an offer to undo is only good until the next change
    });
    simulator.addEventListener('world', () => {
      if (this.#slot === FREE_PLAY) save('boxes', simulator.boxes);
    });
    simulator.addEventListener('bump', () => this.#say(T.program.bump));
    simulator.addEventListener('thing', ({ detail: { what, thing } }) => this.#say(thing ? T.maps[what](thing.the) : T.maps[what]));
    board.addEventListener('change', () => this.#showActivity(onShowMore));
    tutorial.addEventListener('change', () => this.#showActivity(onShowMore));
    this.showScale();
  }

  /** Says how big a square of the mat is on the floor. */
  showScale() {
    const { cm } = squareOf(this.#tuning);
    this.#matHint.textContent = this.#activity?.map ? T.maps.place(cm) : `${T.program.matHint} ${T.program.scale(cm)}`;
  }

  get running() {
    return this.#abort !== null;
  }

  async run() {
    if (this.running) return;
    if (this.#program.blocks.length === 0) {
      this.#say(T.program.empty);
      return;
    }
    const slot = this.#slot;
    this.#abort = new AbortController();
    this.#setRunning(true);
    this.#simulator.reset();
    this.#say(T.program.running);
    this.#stagePanel.scrollIntoView({ block: 'nearest' });
    try {
      await runProgram(this.#program.blocks, this.#hub, {
        signal: this.#abort.signal,
        onBlock: (id) => this.#editor.highlight(id),
      });
      this.#finish();
    } catch (error) {
      if (error instanceof Mishap) {
        this.#abort.abort(); // the real robot may still be in the middle of its move
        this.#say(`${error.thing?.mishap ?? T.maps.offMap} ${T.maps.again}`);
      } else if (!isAbort(error)) throw error;
      else if (slot === this.#slot) this.#say(T.program.stopped); // otherwise something else was opened, with its own message
    } finally {
      this.#abort = null;
      this.#editor.highlight(null);
      this.#setRunning(false);
      await this.#hub.stop();
    }
  }

  stop() {
    this.#abort?.abort();
  }

  /**
   * The keyboard: arrows and letters add blocks, Enter starts the program, Backspace takes the
   * last block away and I puts the robot back at the start. Returns true when the key was used.
   */
  onKey(event) {
    const key = keyOf(event);
    if (key === PROGRAM_KEYS.run) {
      if (!this.running) this.run();
      return true;
    }
    if (this.running) return false;
    if (PROGRAM_KEYS.remove.includes(key)) return this.#editor.removeLast();
    if (key === PROGRAM_KEYS.home) {
      this.#simulator.reset();
      return true;
    }
    const found = BLOCK_KEYS.find((item) => item.key === key);
    if (!found || (found.onMap && !this.#activity?.map)) return false;
    this.#editor.addOrGrow(found.block);
    return true;
  }

  /** The lesson or mission being played, or null in free play. */
  get #activity() {
    return this.#tutorial.active ?? this.#board.active;
  }

  /** Tells the child how the run went; a finished mission earns a star. */
  #finish() {
    this.#coach.runFinished();
    const mission = this.#board.active;
    if (!mission || mission.sandbox) {
      this.#say(`${T.program.done} 🎉`);
    } else if (mission.check(this.#program.all(), this.#simulator)) {
      const starred = this.#board.award(mission);
      this.#say(starred ? `${wordsFor(mission).done} ⭐` : T.school.roundDone(this.#board.roundsSolved(mission), mission.rounds));
      if (starred) celebrate();
    } else {
      this.#say(wordsFor(mission).retry);
    }
  }

  #setRunning(running) {
    this.#runButton.hidden = running;
    this.#stopButton.hidden = !running;
    this.#homeButton.disabled = running;
    for (const panel of this.#editPanels) panel.inert = running;
    this.#stage.editable = !running && !this.#activity;
  }

  /** Shows a message from the robot, optionally with one button. */
  #say(text, action = null) {
    this.#message.textContent = text;
    this.#messageAction.replaceChildren(
      ...(action ? [el('button', { class: 'button', type: 'button', onClick: action.run }, action.label)] : []),
    );
  }

  #clear() {
    if (this.#program.blocks.length === 0) return;
    const backup = this.#program.blocks;
    this.#program.clear();
    this.#editor.moveCursorToEnd();
    this.#say(T.program.cleared, {
      label: T.program.undo,
      run: () => {
        this.#program.replace(backup);
        this.#editor.moveCursorToEnd();
        this.#say(T.program.welcome);
      },
    });
  }

  /** Opens the program and the mat of the current slot. */
  #load() {
    const lesson = this.#tutorial.active;
    // An exercise with new numbers every round starts from an empty program.
    const saved = lesson ? lesson.program : this.#board.active?.make ? [] : load(`program:${this.#slot}`, []);
    this.#program.replace(Program.revive(saved));
    this.#editor.moveCursorToEnd();
    this.#simulator.setWorld(this.#activity ? this.#activity.world : { obstacles: savedBoxes() });
    // On a printed map a step is one of its squares, not one of the mat's.
    if (this.#activity?.map) this.#tuning.mapCm = MAP_SQUARE_CM;
    else delete this.#tuning.mapCm;
    this.showScale();
  }

  /** Follows the lesson or mission being played. */
  #showActivity(onShowMore) {
    const lesson = this.#tutorial.active;
    const mission = this.#board.active;
    const slot = lesson ? `lesson:${lesson.id}` : mission?.round ? `${mission.id}:${mission.round}` : (mission?.id ?? FREE_PLAY);
    if (slot !== this.#slot) {
      this.stop();
      this.#slot = slot;
      this.#load();
      this.#say(lesson ? T.learn.ready : mission?.subject ? T.school.ready : mission ? mission.goal : T.program.welcome);
    }
    this.element.dataset.mode = lesson ? 'lesson' : mission ? 'mission' : FREE_PLAY;
    if (this.#activity?.map) this.element.dataset.map = this.#activity.map;
    else delete this.element.dataset.map;
    this.#stage.editable = !this.running && !this.#activity;
    this.#matHint.hidden = Boolean(this.#activity) && !this.#activity.map;
    this.#missionBanner.hidden = !mission || Boolean(lesson);
    if (mission) this.#drawMissionBanner(mission, onShowMore);
  }

  #drawMissionBanner(mission, onShowMore) {
    const earned = this.#board.hasStar(mission);
    const words = wordsFor(mission);
    this.#missionBanner.replaceChildren(
      el(
        'div',
        { class: 'mission-banner-text' },
        el(
          'p',
          { class: 'mission-banner-label' },
          `${mission.icon} ${mission.label ?? T.mission.label}${earned ? ' ⭐' : ''} `,
          mission.rounds && roundDots(this.#board.roundsSolved(mission), mission.rounds),
        ),
        el('h3', { text: mission.title }),
        el('div', { class: 'mission-ask' }, mission.text && el('p', { class: 'mission-story', text: mission.text }), el('p', { text: mission.goal })),
      ),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'button', type: 'button', onClick: () => this.#say(mission.hint) }, '💡 ', T.mission.hint),
        mission.make &&
          this.#board.roundSolved &&
          el('button', { class: 'button button-brand', type: 'button', onClick: () => this.#board.nextRound() }, '🎲 ', earned ? T.school.another : T.school.nextRound),
        earned && el('button', { class: 'button', type: 'button', onClick: () => onShowMore(mission) }, words.more),
        el('button', { class: 'button', type: 'button', onClick: () => this.#board.leave() }, '✕ ', words.leave),
      ),
    );
  }
}

/** A school exercise and a mission on a printed map have their own words for what a mission says. */
function wordsFor(mission) {
  return mission.subject ? T.school : mission.map ? T.maps : T.mission;
}

/** The boxes the child left on the free-play mat. */
function savedBoxes() {
  const boxes = load('boxes', []);
  return Array.isArray(boxes) ? boxes.filter((box) => Array.isArray(box) && box.length === 2) : [];
}
