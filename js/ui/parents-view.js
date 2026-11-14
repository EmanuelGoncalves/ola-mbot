import { el } from '../dom.js';
import { PARENTS_GUIDE } from '../parents-guide.js';
import { COMMANDS, hex, runCommand } from '../robot/console.js';
import { T } from '../texts.js';

const MOST_LINES = 200;

/**
 * The "Pais" tab, for grown-ups: what the robot is, what the app can and cannot do with it,
 * what its sensors read right now, and a command line.
 */
export class ParentsView {
  #hub;
  #tuning;
  #link;
  #readings = el('dl', { class: 'readings' });
  #log = el('pre', { class: 'console-log', role: 'log', 'aria-label': T.parents.consoleLog, tabindex: '0' });
  #input = el('input', { class: 'console-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': T.parents.consoleInput, placeholder: T.parents.consolePlaceholder });
  #monitor = el('input', { type: 'checkbox', id: 'console-monitor' });
  /** Lines typed before, newest last, and the place in them while going back with the arrow keys. */
  #history = [];
  #recalled = 0;

  /** `link` is the Bluetooth link, for its health and for showing the bytes that go and come. */
  constructor({ hub, tuning, link }) {
    this.#hub = hub;
    this.#tuning = tuning;
    this.#link = link;
    this.element = el(
      'div',
      { class: 'parents-view' },
      el('header', { class: 'view-intro' }, el('h2', { text: T.parents.title }), el('p', { text: T.parents.intro })),
      el(
        'section',
        { class: 'panel' },
        el('h3', { text: `📟 ${T.parents.readingsTitle}` }),
        el('p', { class: 'hint', text: T.parents.readingsHint }),
        el('div', { class: 'row' }, el('button', { class: 'button button-brand', type: 'button', onClick: () => this.#read() }, T.parents.read)),
        this.#readings,
      ),
      el(
        'section',
        { class: 'panel' },
        el('h3', { text: `⌨️ ${T.parents.consoleTitle}` }),
        el('p', { class: 'hint', text: T.parents.consoleHint }),
        this.#log,
        el(
          'form',
          { class: 'console-form', onSubmit: (event) => this.#submit(event) },
          this.#input,
          el('button', { class: 'button button-brand', type: 'submit' }, T.parents.send),
        ),
        el('label', { class: 'tuning-check', for: 'console-monitor' }, this.#monitor, T.parents.monitor),
      ),
      PARENTS_GUIDE.map((section) =>
        el(
          'section',
          { class: 'panel' },
          el('h3', { text: `${section.icon} ${section.title}` }),
          section.paragraphs.map((text) => el('p', { text })),
          section.list && el('ul', { class: 'steps' }, section.list.map((text) => el('li', { text }))),
        ),
      ),
    );
    this.#input.addEventListener('keydown', (event) => this.#recall(event));
    link.addEventListener('sent', (event) => this.#monitor.checked && this.#print(`→ ${hex(event.detail)}`));
    link.addEventListener('data', (event) => this.#monitor.checked && this.#print(`← ${hex(event.detail)}`));
    this.#print(T.parents.consoleWelcome(COMMANDS.length));
    this.#showReadings([]);
  }

  /** Asks the robot for everything it can tell about itself, one question after the other. */
  async #read() {
    const hub = this.#hub;
    const answer = (text) => runCommand(text, { hub, tuning: this.#tuning, health: () => this.#link.health });
    const rows = [];
    for (const [label, command] of T.parents.readings) {
      rows.push([label, await answer(command)]);
      this.#showReadings(rows);
    }
  }

  #showReadings(rows) {
    this.#readings.replaceChildren(
      ...(rows.length > 0 ? rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })]) : [el('dd', { class: 'hint', text: T.parents.noReadings })]),
    );
  }

  async #submit(event) {
    event.preventDefault();
    const line = this.#input.value.trim();
    if (!line) return;
    this.#history.push(line);
    this.#recalled = this.#history.length;
    this.#input.value = '';
    this.#print(`> ${line}`);
    this.#print(await runCommand(line, { hub: this.#hub, tuning: this.#tuning, health: () => this.#link.health }));
  }

  /** The up and down arrows bring back the lines typed before. */
  #recall(event) {
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step || this.#history.length === 0) return;
    event.preventDefault();
    this.#recalled = Math.max(0, Math.min(this.#history.length, this.#recalled + step));
    this.#input.value = this.#history[this.#recalled] ?? '';
  }

  #print(text) {
    const lines = `${this.#log.textContent}${text}\n`.split('\n');
    this.#log.textContent = lines.slice(-MOST_LINES).join('\n');
    this.#log.scrollTop = this.#log.scrollHeight;
  }
}
