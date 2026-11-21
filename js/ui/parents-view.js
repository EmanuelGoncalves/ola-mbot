import { el } from '../dom.js';
import { PARENTS_GUIDE } from '../parents-guide.js';
import { COMMANDS, describeHealth, hex, runCommand } from '../robot/console.js';
import { OUT_OF_SIGHT_CM } from '../robot/mbot.js';
import { squareOf } from '../robot/tuning.js';
import { T } from '../texts.js';
import { isAbort, sleep } from '../timing.js';

const MOST_LINES = 200;
/** How often the sensors are read while they are being watched. */
const READ_EVERY_MS = 400;
const NOTHING = '—';
const SENSORS = ['distance', 'line', 'light', 'button', 'firmware', 'link'];

/**
 * The "Pais" tab, for grown-ups: what the sensors read, live, and a command line. What the robot
 * is and what the app can do with it stays folded away at the bottom.
 */
export class ParentsView {
  #hub;
  #tuning;
  #link;
  /** The value and the note of each sensor, by its id. */
  #metrics = {};
  #eyes = [el('span', { class: 'floor-eye' }), el('span', { class: 'floor-eye' })];
  #status = el('p', { class: 'hint', 'aria-live': 'polite' });
  #liveButton = el('button', { class: 'button', type: 'button', onClick: () => (this.#live ? this.stop() : this.start()) });
  /** The watching of the sensors, while it is on. */
  #live = null;
  /** The firmware version, and the robot that gave it: asked once for each robot. */
  #version = null;
  #versionOf = null;
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
      el('header', { class: 'view-intro' }, el('h2', { text: T.parents.title })),
      el(
        'section',
        { class: 'panel' },
        el('div', { class: 'panel-head' }, el('h3', { text: `📟 ${T.parents.sensorsTitle}` }), this.#liveButton),
        el('dl', { class: 'metrics' }, SENSORS.map((id) => this.#metric(id))),
        this.#status,
      ),
      el(
        'section',
        { class: 'panel' },
        el('h3', { text: `⌨️ ${T.parents.consoleTitle}` }),
        this.#log,
        el(
          'form',
          { class: 'console-form', onSubmit: (event) => this.#submit(event) },
          this.#input,
          el('button', { class: 'button button-brand', type: 'submit' }, T.parents.send),
        ),
        el('label', { class: 'tuning-check', for: 'console-monitor' }, this.#monitor, T.parents.monitor),
      ),
      el(
        'details',
        { class: 'fold parents-guide' },
        el('summary', { text: `📖 ${T.parents.guide}` }),
        PARENTS_GUIDE.map((section) =>
          el(
            'section',
            {},
            el('h3', { text: `${section.icon} ${section.title}` }),
            section.paragraphs.map((text) => el('p', { text })),
            section.list && el('ul', { class: 'steps' }, section.list.map((text) => el('li', { text }))),
          ),
        ),
      ),
    );
    this.#metrics.line.value.replaceChildren(...this.#eyes);
    this.#input.addEventListener('keydown', (event) => this.#recall(event));
    // The sensors asked all the time would bury the bytes of a single order.
    this.#monitor.addEventListener('change', () => this.#monitor.checked && this.stop());
    link.addEventListener('sent', (event) => this.#monitor.checked && this.#print(`→ ${hex(event.detail)}`));
    link.addEventListener('data', (event) => this.#monitor.checked && this.#print(`← ${hex(event.detail)}`));
    this.#print(T.parents.consoleWelcome(COMMANDS.length));
    this.#drawLive();
  }

  /** Reads the sensors a few times a second, until `stop()` or until the tab is left. */
  async start() {
    if (this.#live) return;
    const live = (this.#live = new AbortController());
    this.#drawLive();
    try {
      while (!this.element.closest('[hidden]')) {
        // A dialog may be tuning the robot: it needs the sensors to itself.
        if (!document.hidden && !document.querySelector('dialog[open]')) await this.#read();
        await sleep(READ_EVERY_MS, live.signal);
      }
    } catch (error) {
      if (!isAbort(error)) throw error;
    } finally {
      this.#live = null;
      this.#drawLive();
    }
  }

  stop() {
    this.#live?.abort();
  }

  #metric(id) {
    const { name, note } = T.parents.sensors[id];
    const value = el('dd', { class: 'metric-value', text: NOTHING });
    this.#metrics[id] = { value, note: el('dd', { class: 'metric-note', text: note }) };
    return el('div', { class: 'metric' }, el('dt', { text: name }), value, this.#metrics[id].note);
  }

  #drawLive() {
    this.#liveButton.textContent = this.#live ? `⏸ ${T.parents.pause}` : `▶ ${T.parents.resume}`;
    this.#status.textContent = !this.#live ? T.parents.paused : this.#hub.real ? T.parents.fromRobot : T.parents.fromScreen;
  }

  /** Asks every sensor once: the real robot's when one is connected, else what the robot on screen knows. */
  async #read() {
    const real = this.#hub.real;
    const ask = (question) => (real ? question(real).catch(() => null) : null);
    const started = performance.now();
    const range = real ? null : await this.#hub.range();
    const cm = real ? await ask((robot) => robot.readDistance()) : range === null ? 0 : range * squareOf(this.#tuning).cm;
    const answeredIn = Math.round(performance.now() - started);
    const seen = await this.#hub.readLine();
    const light = await ask((robot) => robot.readLight());
    const pressed = await ask((robot) => robot.readButton());
    if (real !== this.#versionOf) {
      this.#version = await ask((robot) => robot.readVersion());
      if (this.#version || !real) this.#versionOf = real;
    }
    const show = (id, text) => (this.#metrics[id].value.textContent = text ?? NOTHING);
    show('distance', cm === null ? null : cm > 0 && cm < OUT_OF_SIGHT_CM ? T.parents.cm(cm) : T.parents.nothingInSight);
    // The sensors answer 0 with both over something dark, 1 with only the left one, 2 with only the right one, 3 with neither.
    this.#eyes[0].classList.toggle('is-dark', seen === 0 || seen === 1);
    this.#eyes[1].classList.toggle('is-dark', seen === 0 || seen === 2);
    this.#metrics.line.note.textContent = T.parents.lineSeen[seen] ?? T.parents.sensors.line.note;
    show('light', light === null ? null : String(Math.round(light)));
    show('button', pressed === null ? null : pressed ? T.parents.pressed : T.parents.released);
    show('firmware', this.#version);
    show('link', real ? T.parents.answeredIn(answeredIn) : null);
    this.#metrics.link.note.textContent = real ? describeHealth(this.#link.health) : T.parents.sensors.link.note;
    this.#drawLive();
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
