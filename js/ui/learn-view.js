import { el } from '../dom.js';
import { T } from '../texts.js';
import { LESSONS } from '../tutorial.js';

/** The "Aprender" tab: the tutorial's lessons in order; `onPlay(lesson)` opens one. */
export class LearnView {
  #tutorial;
  #onPlay;
  #onShowMissions;

  constructor({ tutorial, onPlay, onShowMissions }) {
    this.#tutorial = tutorial;
    this.#onPlay = onPlay;
    this.#onShowMissions = onShowMissions;
    this.element = el('div', { class: 'learn-view' });
    tutorial.addEventListener('change', () => this.#render());
    this.#render();
  }

  #render() {
    const finished = this.#tutorial.finishedCount;
    const diploma = finished === LESSONS.length ? [this.#diploma()] : [];
    this.element.replaceChildren(
      el(
        'header',
        { class: 'view-intro' },
        el('h2', { text: T.learn.title }),
        el('p', { text: T.learn.intro }),
        el('p', { class: 'view-progress', text: `🎓 ${T.learn.progress(finished, LESSONS.length)}` }),
      ),
      ...diploma,
      el('ol', { class: 'card-grid' }, LESSONS.map((lesson, index) => this.#card(lesson, index + 1))),
      el(
        'section',
        { class: 'panel' },
        el('h3', { text: T.learn.afterTitle }),
        el('ul', { class: 'steps' }, T.learn.after.map((text) => el('li', { text }))),
      ),
    );
  }

  #diploma() {
    return el(
      'section',
      { class: 'panel diploma' },
      el('h3', { text: `🏅 ${T.learn.diplomaTitle}` }),
      el('p', { text: T.learn.diploma }),
      el('div', { class: 'row' }, el('button', { class: 'button button-brand', type: 'button', onClick: this.#onShowMissions }, '⭐ ', T.learn.missions)),
    );
  }

  #card(lesson, number) {
    const finished = this.#tutorial.isFinished(lesson);
    const inProgress = this.#tutorial.active === lesson && !finished;
    const label = inProgress ? T.learn.resume : finished ? T.learn.again : T.learn.start;
    const suggested = inProgress || lesson === this.#tutorial.next;
    return el(
      'li',
      { class: `card${finished ? ' is-done' : ''}` },
      el(
        'div',
        { class: 'card-top' },
        el('span', { 'aria-hidden': 'true', text: lesson.icon }),
        finished && el('span', { role: 'img', 'aria-label': T.learn.finished, text: '✅' }),
      ),
      el('h3', { text: `${number}. ${lesson.title}` }),
      el('p', { text: lesson.about }),
      el('button', { class: `button${suggested ? ' button-brand' : ''}`, type: 'button', onClick: () => this.#onPlay(lesson) }, label),
    );
  }
}
