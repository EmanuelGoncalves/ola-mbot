import { el } from '../dom.js';
import { BluetoothLink } from '../robot/bluetooth.js';
import { MBot } from '../robot/mbot.js';
import { colorById, noteById } from '../robot/palette.js';
import { measureStep, sweep } from '../robot/radar.js';
import { saveTuning, TUNING_LIMITS } from '../robot/tuning.js';
import { T } from '../texts.js';
import { isAbort, sleep } from '../timing.js';

const State = { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', FAILED: 'failed', LOST: 'lost', BLOCKED: 'blocked' };
const CHOOSER_CLOSED = 'NotFoundError';
const NOT_ALLOWED = 'SecurityError';
const HELLO_NOTE_MS = 200;
/** A measured step shorter than this part of a square is a bad measurement. */
const SHORTEST_STEP = 0.2;

/** Closing the chooser is not a failure; a page that may not use Bluetooth gets the simulator note. */
const FAILURE_STATE = { [CHOOSER_CLOSED]: State.IDLE, [NOT_ALLOWED]: State.BLOCKED };

/** The "Ligar ao robô" button and its dialog: Bluetooth connection and tuning. */
export class Connection {
  #hub;
  #tuning;
  #link = new BluetoothLink();
  #mbot;
  #state = State.IDLE;
  /** The tuning test move in progress, if any. */
  #test = null;
  /** Why the last connection failed, for a grown-up to read. */
  #failure = '';
  /** The tuning sliders by name: `{ input, readout, format }`. */
  #sliders = {};
  #fitReport = el('p', { class: 'notice', 'aria-live': 'polite', hidden: true });
  #body = el('div', { class: 'dialog-body' });

  constructor({ hub, tuning, onOpen }) {
    this.#hub = hub;
    this.#tuning = tuning;
    this.#mbot = new MBot(this.#link, tuning);
    this.button = el('button', { class: 'button connect-button', type: 'button', onClick: () => this.#open(onOpen) });
    this.dialog = el(
      'dialog',
      { class: 'dialog', 'aria-labelledby': 'connection-title' },
      el('h2', { id: 'connection-title', text: T.connection.title }),
      this.#body,
      this.#tuningSection(),
      el('button', { class: 'button', type: 'button', onClick: () => this.dialog.close() }, T.connection.close),
    );
    // A tap on the backdrop closes the dialog.
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => this.#test?.abort());
    this.#link.addEventListener('disconnect', () => {
      this.#hub.detach();
      this.#setState(State.LOST);
    });
    this.#setState(State.IDLE);
  }

  #open(onOpen) {
    onOpen();
    this.dialog.showModal();
  }

  #setState(state) {
    this.#state = state;
    const connected = state === State.CONNECTED;
    const label = connected ? T.connection.connected : state === State.CONNECTING ? T.connection.connecting : T.connection.connect;
    this.button.replaceChildren(el('span', { 'aria-hidden': 'true', text: connected ? '✅' : '🔌' }), label);
    this.button.classList.toggle('is-connected', connected);
    this.#body.replaceChildren(...this.#bodyContent());
  }

  #bodyContent() {
    const paragraphs = (texts) => texts.map((text) => el('p', { text }));
    if (!BluetoothLink.supported || this.#state === State.BLOCKED) {
      return [el('h3', { text: T.connection.unsupportedTitle }), ...paragraphs(T.connection.unsupported)];
    }
    if (this.#state === State.CONNECTED) {
      return [
        el('p', { text: T.connection.ready }),
        el(
          'div',
          { class: 'row' },
          el('button', { class: 'button button-brand', type: 'button', onClick: () => this.#sayHello() }, '✨ ', T.connection.test),
          el('button', { class: 'button', type: 'button', onClick: () => this.#link.disconnect() }, T.connection.disconnect),
        ),
      ];
    }
    const connecting = this.#state === State.CONNECTING;
    return [
      this.#state === State.FAILED && el('p', { class: 'notice', text: T.connection.failed }),
      this.#state === State.FAILED && el('p', { class: 'hint', text: T.connection.failure(this.#failure) }),
      this.#state === State.LOST && el('p', { class: 'notice', text: T.connection.lost }),
      el('ol', { class: 'steps' }, T.connection.steps.map((text) => el('li', { text }))),
      el(
        'button',
        { class: 'button button-brand button-big', type: 'button', disabled: connecting, onClick: () => this.#connect() },
        connecting ? T.connection.connecting : `🔍 ${T.connection.search}`,
      ),
      el(
        'details',
        { class: 'fold' },
        el('summary', { text: T.connection.missingTitle }),
        el('ul', { class: 'steps' }, T.connection.missing.map((text) => el('li', { text }))),
        el(
          'button',
          { class: 'button', type: 'button', disabled: connecting, onClick: () => this.#connect({ anyDevice: true }) },
          T.connection.searchAll,
        ),
      ),
    ].filter(Boolean);
  }

  async #connect(options) {
    this.#setState(State.CONNECTING);
    try {
      await this.#link.connect(options);
      this.#hub.attach(this.#mbot);
      this.#setState(State.CONNECTED);
      await this.#sayHello();
    } catch (error) {
      this.#failure = `${error?.name}: ${error?.message}`;
      this.#setState(FAILURE_STATE[error?.name] ?? State.FAILED);
      if (error?.name !== CHOOSER_CLOSED) console.warn('mBot connection failed', error);
    }
  }

  /** A green blink and two notes, so the child sees which robot answered. */
  async #sayHello() {
    await this.#hub.setLights(colorById('green'));
    await this.#hub.playTone(noteById('do').hz, HELLO_NOTE_MS);
    await sleep(HELLO_NOTE_MS + 50);
    await this.#hub.playTone(noteById('sol').hz, HELLO_NOTE_MS);
    await sleep(HELLO_NOTE_MS * 2);
    await this.#hub.setLights(null);
  }

  #tuningSection() {
    return el(
      'details',
      { class: 'fold' },
      el('summary', { text: T.connection.tuningTitle }),
      el('p', { class: 'hint', text: T.connection.tuningIntro }),
      this.#slider('cellCm', T.connection.cellSize, T.connection.centimetres),
      this.#slider('stepMs', T.connection.stepTime, T.connection.milliseconds, T.connection.testStep, (signal) => this.#hub.move(1, signal)),
      el('p', { class: 'hint', text: T.connection.fitIntro }),
      this.#testButton(`📏 ${T.connection.fitStep}`, (signal) => this.#fitStep(signal)),
      this.#fitReport,
      this.#slider('quarterTurnMs', T.connection.turnTime, T.connection.milliseconds, T.connection.testTurn, (signal) => this.#hub.turn(1, signal)),
      el('p', { class: 'hint', text: T.connection.scanIntro }),
      this.#slider('scanStepMs', T.connection.scanTime, T.connection.milliseconds, T.connection.testScan, (signal) =>
        sweep(this.#hub, { stepMs: this.#tuning.scanStepMs, signal }),
      ),
      el('p', { class: 'hint', text: T.connection.flipIntro }),
      this.#flip('flipDrive', T.connection.flipDrive),
      this.#flip('flipTurn', T.connection.flipTurn),
    );
  }

  /** A switch for a real robot that goes the wrong way. */
  #flip(name, label) {
    const id = `tuning-${name}`;
    const input = el('input', {
      id,
      type: 'checkbox',
      checked: this.#tuning[name],
      onChange: () => {
        this.#tuning[name] = input.checked;
        saveTuning(this.#tuning);
      },
    });
    return el('label', { class: 'tuning-check', for: id }, input, label);
  }

  /** A slider for one tuning value, shown with `format`, and a button to try it out if there is a `test`. */
  #slider(name, label, format, testLabel, test) {
    const id = `tuning-${name}`;
    const readout = el('output', { for: id, text: format(this.#tuning[name]) });
    const input = el('input', {
      id,
      type: 'range',
      ...TUNING_LIMITS[name],
      value: this.#tuning[name],
      onInput: () => this.#set(name, Number(input.value)),
    });
    this.#sliders[name] = { input, readout, format };
    return el('div', { class: 'tuning-row' }, el('label', { for: id }, label, ' ', readout), input, test && this.#testButton(testLabel, test));
  }

  #testButton(label, test) {
    return el('button', { class: 'button', type: 'button', onClick: () => this.#runTest(test) }, label);
  }

  /** Changes a tuning value, saves it and shows it on its slider. */
  #set(name, value) {
    const { input, readout, format } = this.#sliders[name];
    this.#tuning[name] = value;
    input.value = value;
    readout.textContent = format(value);
    saveTuning(this.#tuning);
  }

  /** Lets the mBot measure its own step with its eyes, and sets the step time from it. */
  async #fitStep(signal) {
    const report = (text) => {
      this.#fitReport.textContent = text;
      this.#fitReport.hidden = false;
    };
    if (!this.#hub.connected) return report(T.connection.fitNeedsRobot);
    const squares = await measureStep(this.#hub, { signal });
    if (squares === null || squares < SHORTEST_STEP) return report(T.connection.fitFailed);
    const { min, max, step } = TUNING_LIMITS.stepMs;
    const fitted = Math.round(this.#tuning.stepMs / squares / step) * step;
    this.#set('stepMs', Math.max(min, Math.min(max, fitted)));
    report(T.connection.fitDone(Math.round(squares * this.#tuning.cellCm), this.#tuning.stepMs));
  }

  /** Runs one test move at a time; closing the dialog stops it. */
  async #runTest(test) {
    if (this.#test) return;
    this.#test = new AbortController();
    try {
      await test(this.#test.signal);
    } catch (error) {
      if (!isAbort(error)) throw error;
    } finally {
      this.#test = null;
    }
  }
}
