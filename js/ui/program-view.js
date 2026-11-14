import { el } from '../dom.js';
import { runProgram } from '../program/interpreter.js';
import { Program } from '../program/program.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';
import { isAbort } from '../timing.js';
import { celebrate } from './celebrate.js';
import { Coach } from './coach.js';
import { createPalette, ProgramEditor } from './program-editor.js';
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
      if (!tutorial.active) save(`program:${this.#slot}`, this.#program.serialize());
      this.#messageAction.replaceChildren(); // an offer to undo is only good until the next change
    });
    simulator.addEventListener('world', () => {
      if (this.#slot === FREE_PLAY) save('boxes', simulator.boxes);
    });
    simulator.addEventListener('bump', () => this.#say(T.program.bump));
    board.addEventListener('change', () => this.#showActivity(onShowMore));
    tutorial.addEventListener('change', () => this.#showActivity(onShowMore));
    this.showScale();
  }

  /** Says how big a square of the mat is on the floor. */
  showScale() {
    this.#matHint.textContent = `${T.program.matHint} ${T.program.scale(this.#tuning.cellCm)}`;
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
      if (!isAbort(error)) throw error;
      if (slot === this.#slot) this.#say(T.program.stopped); // otherwise something else was opened, with its own message
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

  /** The lesson or mission being played, or null in free play. */
  get #activity() {
    return this.#tutorial.active ?? this.#board.active;
  }

  /** Tells the child how the run went; a finished mission earns a star. */
  #finish() {
    this.#coach.runFinished();
    const mission = this.#board.active;
    if (!mission) {
      this.#say(`${T.program.done} 🎉`);
    } else if (mission.check(this.#program.all(), this.#simulator)) {
      this.#board.award(mission);
      this.#say(`${wordsFor(mission).done} ⭐`);
      celebrate();
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
    const saved = lesson ? lesson.program : load(`program:${this.#slot}`, []);
    this.#program.replace(Program.revive(saved));
    this.#editor.moveCursorToEnd();
    this.#simulator.setWorld(this.#activity ? this.#activity.world : { obstacles: savedBoxes() });
  }

  /** Follows the lesson or mission being played. */
  #showActivity(onShowMore) {
    const lesson = this.#tutorial.active;
    const mission = this.#board.active;
    const slot = lesson ? `lesson:${lesson.id}` : (mission?.id ?? FREE_PLAY);
    if (slot !== this.#slot) {
      this.stop();
      this.#slot = slot;
      this.#load();
      this.#say(lesson ? T.learn.ready : mission?.subject ? T.school.ready : mission ? mission.goal : T.program.welcome);
    }
    this.element.dataset.mode = lesson ? 'lesson' : mission ? 'mission' : FREE_PLAY;
    this.#stage.editable = !this.running && !this.#activity;
    this.#matHint.hidden = Boolean(this.#activity);
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
        el('p', { class: 'mission-banner-label', text: `${mission.icon} ${mission.label ?? T.mission.label}${earned ? ' ⭐' : ''}` }),
        el('h3', { text: mission.title }),
        el('div', { class: 'mission-ask' }, mission.text && el('p', { class: 'mission-story', text: mission.text }), el('p', { text: mission.goal })),
      ),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'button', type: 'button', onClick: () => this.#say(mission.hint) }, '💡 ', T.mission.hint),
        earned && el('button', { class: 'button', type: 'button', onClick: () => onShowMore(mission) }, words.more),
        el('button', { class: 'button', type: 'button', onClick: () => this.#board.leave() }, '✕ ', words.leave),
      ),
    );
  }
}

/** A school exercise has its own words for what a mission says. */
function wordsFor(mission) {
  return mission.subject ? T.school : T.mission;
}

/** The boxes the child left on the free-play mat. */
function savedBoxes() {
  const boxes = load('boxes', []);
  return Array.isArray(boxes) ? boxes.filter((box) => Array.isArray(box) && box.length === 2) : [];
}
