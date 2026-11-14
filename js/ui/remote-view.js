import { el } from '../dom.js';
import { REMOTE_ROWS, REMOTE_TEXT, REMOTE_TOPICS } from '../remote-guide.js';
import { createRobotPortrait } from './robot-figure.js';

const FIRST_TOPIC = 'modeA';

/** The "Comando" tab: a drawing of the remote that explains each button. */
export class RemoteView {
  #portrait = createRobotPortrait();
  #title = el('h3');
  #text = el('p');
  #keys = [];

  constructor() {
    const remote = el(
      'div',
      { class: 'remote', role: 'group', 'aria-label': REMOTE_TEXT.title },
      el('div', { class: 'remote-lamp', 'aria-hidden': 'true' }),
      REMOTE_ROWS.flat().map((key) => this.#key(key)),
    );
    const list = (items) => items.map((text) => el('li', { text }));

    this.element = el(
      'div',
      { class: 'remote-view' },
      el('header', { class: 'remote-intro' }, el('h2', { text: REMOTE_TEXT.title }), el('p', { text: REMOTE_TEXT.intro })),
      el('section', { class: 'panel remote-panel' }, remote),
      el(
        'div',
        { class: 'remote-side' },
        el(
          'section',
          { class: 'panel remote-topic', 'aria-live': 'polite' },
          el('div', { class: 'remote-robot' }, this.#portrait.element),
          el('div', { class: 'remote-topic-text' }, this.#title, this.#text),
        ),
        el('section', { class: 'panel' }, el('h3', { text: REMOTE_TEXT.startTitle }), el('ol', { class: 'steps' }, list(REMOTE_TEXT.start))),
        el(
          'section',
          { class: 'panel' },
          el('h3', { text: REMOTE_TEXT.helpTitle }),
          el('ul', { class: 'steps' }, list(REMOTE_TEXT.help)),
          el('p', { class: 'hint', text: REMOTE_TEXT.parents }),
        ),
      ),
    );
    this.#show(FIRST_TOPIC);
  }

  #key(key) {
    const button = el(
      'button',
      { class: `remote-key remote-key-${key.kind}`, type: 'button', 'aria-label': key.name, 'data-topic': key.topic, onClick: () => this.#show(key.topic, button) },
      key.face,
    );
    this.#keys.push(button);
    return button;
  }

  /** Explains a topic; every button that shares it lights up, the tapped one most. */
  #show(topicId, tapped = null) {
    const topic = REMOTE_TOPICS[topicId];
    this.#title.textContent = topic.title;
    this.#text.textContent = topic.text;
    this.#portrait.setLights(...topic.lights);
    for (const button of this.#keys) {
      button.classList.toggle('is-related', button.dataset.topic === topicId);
      button.setAttribute('aria-pressed', String(button === tapped));
    }
  }
}
