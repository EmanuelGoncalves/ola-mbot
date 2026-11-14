import { el } from '../dom.js';
import { exercisesFor, exercisesOf, LEVELS, SUBJECTS, YEARS } from '../school.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';

/**
 * The "Escola" tab: Matemática and Português exercises by school year and level.
 * `onPlay(exercise)` opens one in the Programar tab.
 */
export class SchoolView {
  #board;
  #onPlay;
  #subject = SUBJECTS.find((subject) => subject.id === load('school-subject', null)) ?? SUBJECTS[0];
  #year = YEARS[0];

  constructor({ board, onPlay }) {
    this.#board = board;
    this.#onPlay = onPlay;
    this.element = el('div', { class: 'school-view' });
    board.addEventListener('change', () => this.#render());
    this.#render();
  }

  #render() {
    const exercises = exercisesOf(this.#subject, this.#year);
    this.element.replaceChildren(
      el(
        'header',
        { class: 'view-intro' },
        el('h2', { text: T.school.title }),
        el('p', { text: T.school.intro }),
        el(
          'div',
          { class: 'row' },
          el('div', { class: 'choice', role: 'group', 'aria-label': T.school.subjects }, SUBJECTS.map((subject) => this.#subjectButton(subject))),
          el('div', { class: 'choice' }, YEARS.map((year) => this.#yearButton(year))),
        ),
        el('p', { class: 'view-progress', text: `⭐ ${T.school.progress(this.#board.starsIn(exercises), exercises.length, this.#subject.name)}` }),
      ),
      ...LEVELS.map((level) => this.#level(level)),
    );
  }

  #subjectButton(subject) {
    const choose = () => {
      this.#subject = subject;
      save('school-subject', subject.id);
      this.#render();
    };
    return el('button', { class: 'button', type: 'button', 'aria-pressed': String(subject === this.#subject), onClick: choose }, `${subject.icon} ${subject.name}`);
  }

  #yearButton(year) {
    const choose = () => {
      this.#year = year;
      this.#render();
    };
    return el('button', { class: 'button', type: 'button', 'aria-pressed': String(year === this.#year), onClick: choose }, T.school.year(year));
  }

  #level(level) {
    const exercises = exercisesFor(this.#subject, this.#year, level);
    return el(
      'section',
      { class: 'school-level' },
      el('h3', { text: `${level.icon} ${level.name}` }),
      el('ol', { class: 'card-grid' }, exercises.map((exercise, index) => this.#card(exercise, index + 1))),
    );
  }

  #card(exercise, number) {
    const earned = this.#board.hasStar(exercise);
    return el(
      'li',
      { class: `card${earned ? ' is-done' : ''}` },
      el(
        'div',
        { class: 'card-top' },
        el('span', { 'aria-hidden': 'true', text: exercise.icon }),
        earned
          ? el('span', { role: 'img', 'aria-label': T.school.earned, text: '⭐' })
          : el('span', { class: 'card-mark-empty', 'aria-hidden': 'true', text: '☆' }),
      ),
      el('h3', { text: `${number}. ${exercise.title}` }),
      el(
        'button',
        { class: `button${earned ? '' : ' button-brand'}`, type: 'button', onClick: () => this.#onPlay(exercise) },
        earned ? T.school.replay : T.school.play,
      ),
    );
  }
}
