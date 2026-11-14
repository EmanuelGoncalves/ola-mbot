import { el } from '../dom.js';
import { T } from '../texts.js';
import { LESSONS } from '../tutorial.js';
import { celebrate } from './celebrate.js';
import { createRobotPortrait } from './robot-figure.js';

/** Where each kind of lesson target is found inside the Programar tab. */
const SELECTORS = {
  chip: (type) => `.block-chip[data-type="${type}"]`,
  block: (id) => `.block[data-id="${id}"] > .block-head`,
  option: (value) => `.option[data-value="${value}"]`,
  tool: (name) => `.tool[data-tool="${name}"]`,
  slot: (id) => `.block[data-id="${id}"] > .block-list > li > .slot`,
  run: () => '.button-go',
};
const TARGET_CLASS = 'is-coach-target';

/**
 * The robot teacher of the Programar tab. While a lesson is open it says what
 * to do next, points at the thing to tap, and moves on when the step is done.
 */
export class Coach {
  #tutorial;
  #program;
  #editor;
  #simulator;
  #scope;
  #onPlay;
  #onShowMissions;

  #lesson = null;
  /** The open lesson has been finished and shows its closing words. */
  #ended = false;
  /** The program ran to its end since it was last changed. */
  #ran = false;
  #refreshQueued = false;

  #label = el('p', { class: 'coach-label' });
  #text = el('p', { class: 'coach-text', 'aria-live': 'polite' });
  #steps = el('ol', { class: 'coach-steps', role: 'img' });
  #actions = el('div', { class: 'coach-actions' });

  /** `scope` is the element that holds the blocks, the program and the run button. */
  constructor({ tutorial, program, editor, simulator, scope, onPlay, onShowMissions }) {
    this.#tutorial = tutorial;
    this.#program = program;
    this.#editor = editor;
    this.#simulator = simulator;
    this.#scope = scope;
    this.#onPlay = onPlay;
    this.#onShowMissions = onShowMissions;
    this.element = el(
      'section',
      { class: 'coach', hidden: true, 'aria-label': T.learn.title },
      el('div', { class: 'coach-robot' }, createRobotPortrait().element),
      el('div', { class: 'coach-body' }, this.#label, this.#text, this.#steps),
      this.#actions,
    );

    tutorial.addEventListener('change', () => {
      if (tutorial.active !== this.#lesson) this.#open(tutorial.active);
      this.#queueRefresh();
    });
    program.addEventListener('change', () => {
      this.#ran = false;
      this.#queueRefresh();
    });
    editor.addEventListener('render', () => this.#queueRefresh());
  }

  /** Tells the coach that the program ran to its end. */
  runFinished() {
    if (!this.#lesson) return;
    this.#ran = true;
    this.#refresh();
  }

  #open(lesson) {
    this.#lesson = lesson;
    this.#ended = false;
    this.#ran = false;
  }

  /** Several things change in one tap; look at the result once they have all settled. */
  #queueRefresh() {
    if (this.#refreshQueued) return;
    this.#refreshQueued = true;
    queueMicrotask(() => {
      this.#refreshQueued = false;
      this.#refresh();
    });
  }

  #refresh() {
    const lesson = this.#lesson;
    this.element.hidden = !lesson;
    if (!lesson) {
      this.#pointAt(null);
      return;
    }
    const state = this.#state();
    const index = this.#ended ? -1 : lesson.steps.findIndex((step) => !step.done(state));
    if (index === -1 && !this.#ended) {
      this.#ended = true;
      this.#tutorial.finish(lesson);
      celebrate();
    }
    this.#draw(lesson, index, state);
  }

  /** What the lesson steps look at; see tutorial.js. */
  #state() {
    return {
      blocks: this.#program.all(),
      top: this.#program.blocks,
      selected: this.#editor.selected,
      cursor: this.#editor.cursor,
      ran: this.#ran,
      robot: this.#simulator,
    };
  }

  #draw(lesson, index, state) {
    const step = lesson.steps[index] ?? null;
    const number = LESSONS.indexOf(lesson) + 1;
    const text = step ? (state.ran && step.retry) || step.text : lesson.end;
    this.#label.textContent = `${lesson.icon} ${T.learn.lesson(number)} · ${lesson.title}`;
    if (this.#text.textContent !== text) this.#text.textContent = text;
    this.#steps.setAttribute('aria-label', step ? T.learn.step(index + 1, lesson.steps.length) : T.learn.finished);
    this.#steps.replaceChildren(
      ...lesson.steps.map((_, i) => el('li', { class: !step || i < index ? 'is-done' : i === index ? 'is-current' : '' })),
    );
    this.#actions.replaceChildren(...this.#buttons(lesson, step));
    const target = typeof step?.target === 'function' ? step.target(state) : step?.target;
    this.#pointAt(target ? SELECTORS[target[0]](target[1]) : null);
  }

  #buttons(lesson, step) {
    const leave = el('button', { class: 'button', type: 'button', onClick: () => this.#tutorial.leave() }, '✕ ', T.learn.leave);
    if (step) return [leave];
    const next = LESSONS[LESSONS.indexOf(lesson) + 1];
    const onward = next
      ? el('button', { class: 'button button-brand', type: 'button', onClick: () => this.#onPlay(next) }, '▶ ', T.learn.next)
      : el('button', { class: 'button button-brand', type: 'button', onClick: this.#onShowMissions }, '⭐ ', T.learn.missions);
    return [onward, leave];
  }

  /** Marks the thing to tap and brings it into view. */
  #pointAt(selector) {
    const element = selector ? this.#scope.querySelector(selector) : null;
    for (const marked of this.#scope.querySelectorAll(`.${TARGET_CLASS}`)) {
      if (marked !== element) marked.classList.remove(TARGET_CLASS);
    }
    element?.classList.add(TARGET_CLASS);
    element?.scrollIntoView({ block: 'nearest' });
  }
}
