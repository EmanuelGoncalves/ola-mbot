import { el } from '../dom.js';
import { MISSIONS } from '../missions.js';
import { T } from '../texts.js';

/** The "Missões" tab: a card per mission; `onPlay(mission)` opens one. */
export class MissionsView {
  #board;
  #onPlay;

  constructor({ board, onPlay }) {
    this.#board = board;
    this.#onPlay = onPlay;
    this.element = el('div', { class: 'missions-view' });
    board.addEventListener('change', () => this.#render());
    this.#render();
  }

  #render() {
    this.element.replaceChildren(
      el(
        'header',
        { class: 'view-intro' },
        el('h2', { text: T.mission.title }),
        el('p', { text: T.mission.intro }),
        el('p', { class: 'view-progress', text: `⭐ ${T.mission.progress(this.#board.starCount, MISSIONS.length)}` }),
      ),
      el('ol', { class: 'card-grid' }, MISSIONS.map((mission, index) => this.#card(mission, index + 1))),
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
        earned
          ? el('span', { role: 'img', 'aria-label': T.mission.earned, text: '⭐' })
          : el('span', { class: 'card-mark-empty', 'aria-hidden': 'true', text: '☆' }),
      ),
      el('h3', { text: `${number}. ${mission.title}` }),
      el('p', { text: mission.goal }),
      el(
        'button',
        { class: `button${earned ? '' : ' button-brand'}`, type: 'button', onClick: () => this.#onPlay(mission) },
        earned ? T.mission.replay : T.mission.play,
      ),
    );
  }
}
