import { el } from '../dom.js';
import { BluetoothLink, listsAllDevices } from '../robot/bluetooth.js';
import { MBot } from '../robot/mbot.js';
import { colorById, noteById } from '../robot/palette.js';
import { measureQuarters, measureStep, sweep, sweepUntilRepeat } from '../robot/radar.js';
import { saveTuning, TUNING_LIMITS } from '../robot/tuning.js';
import { load, save } from '../storage.js';
import { T } from '../texts.js';
import { isAbort, sleep } from '../timing.js';

const State = { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', REPAIRING: 'repairing', FAILED: 'failed', LOST: 'lost', BLOCKED: 'blocked' };
const CHOOSER_CLOSED = 'NotFoundError';
const NOT_ALLOWED = 'SecurityError';
const HELLO_NOTE_MS = 200;
/** A measured step shorter than this part of a square is a bad measurement. */
const SHORTEST_STEP = 0.2;
/** When the robot finds its own full turn for the tuning, it looks for turns up to this many times the expected spins. */
const WIDEST_TURN = 2.5;

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
  /**
   * The search lists every device nearby, not only mBots: where the browser cannot tell an mBot
   * from the rest (iPad), or once that was how the robot was found.
   */
  #allDevices = load('all-devices', listsAllDevices());
  /** The help for a robot missing from the list is open: a search has just come back empty-handed. */
  #missingOpen = false;
  /** The tuning sliders by name: `{ input, readout, format }`. */
  #sliders = {};
  #fitReport = el('p', { class: 'notice', 'aria-live': 'polite', hidden: true });
  #spinReport = el('p', { class: 'notice', 'aria-live': 'polite', hidden: true });
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
    // A tap on the backdrop closes the dialog; a tap on its padding does not.
    this.dialog.addEventListener('click', (event) => {
      const { left, right, top, bottom } = this.dialog.getBoundingClientRect();
      const inside = event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;
      if (event.target === this.dialog && !inside) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => this.#test?.abort());
    this.#link.addEventListener('disconnect', () => {
      this.#test?.abort();
      this.#hub.detach();
      this.#setState(State.LOST);
    });
    // The robot went away by itself: whatever it was doing stops, while the link tries to get it back.
    this.#link.addEventListener('repairing', () => {
      this.#test?.abort();
      onOpen();
      this.#setState(State.REPAIRING);
    });
    this.#link.addEventListener('repaired', () => this.#setState(State.CONNECTED));
    this.#setState(State.IDLE);
  }

  /** The Bluetooth link, for those who want to see how it is doing and what goes through it. */
  get link() {
    return this.#link;
  }

  #open(onOpen) {
    onOpen();
    this.#setState(this.#state); // brings what the dialog says up to date
    // A scan may have learnt a new number of spins for a full turn.
    for (const [name, { input, readout, format }] of Object.entries(this.#sliders)) {
      input.value = this.#tuning[name];
      readout.textContent = format(this.#tuning[name]);
    }
    this.dialog.showModal();
  }

  #setState(state) {
    this.#state = state;
    const connected = state === State.CONNECTED;
    const busy = state === State.CONNECTING || state === State.REPAIRING;
    const label = connected ? T.connection.connected : busy ? T.connection.connecting : T.connection.connect;
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
        el('p', { class: 'hint', text: T.connection.health(this.#link.health) }),
      ];
    }
    if (this.#state === State.REPAIRING) {
      return [
        el('p', { class: 'notice', text: T.connection.repairing }),
        el('div', { class: 'row' }, el('button', { class: 'button', type: 'button', onClick: () => this.#link.disconnect() }, T.connection.disconnect)),
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
        { class: 'button button-brand button-big', type: 'button', disabled: connecting, onClick: () => this.#connect({ anyDevice: this.#allDevices }) },
        connecting ? T.connection.connecting : `🔍 ${T.connection.search}`,
      ),
      this.#allDevices && el('p', { class: 'hint', text: T.connection.allDevices }),
      el(
        'details',
        { class: 'fold', open: this.#missingOpen },
        el('summary', { text: T.connection.missingTitle }),
        el('ul', { class: 'steps' }, T.connection.missing.map((text) => el('li', { text }))),
        !this.#allDevices &&
          el(
            'button',
            { class: 'button', type: 'button', disabled: connecting, onClick: () => this.#connect({ anyDevice: true }) },
            T.connection.searchAll,
          ),
      ),
    ].filter(Boolean);
  }

  async #connect({ anyDevice }) {
    this.#setState(State.CONNECTING);
    try {
      await this.#link.connect({ anyDevice });
      if (anyDevice && !this.#allDevices) {
        // The robot was only found among all the devices: next time, the search starts there.
        this.#allDevices = true;
        save('all-devices', true);
      }
      this.#missingOpen = false;
      this.#hub.attach(this.#mbot);
      this.#setState(State.CONNECTED);
      await this.#sayHello();
    } catch (error) {
      this.#failure = `${error?.name}: ${error?.message}`;
      // A search for mBots only that was closed: most likely the robot was not in the list.
      this.#missingOpen = error?.name === CHOOSER_CLOSED && !anyDevice;
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
      this.#slider('scanStepMs', T.connection.scanTime, T.connection.milliseconds),
      this.#slider('scanStops', T.connection.scanStops, String, T.connection.testScan, (signal) =>
        sweep(this.#hub, { stops: this.#tuning.scanStops, stepMs: this.#tuning.scanStepMs, signal }),
      ),
      el('p', { class: 'hint', text: T.connection.turnsIntro }),
      this.#testButton(`🧭 ${T.connection.fitTurns}`, (signal) => this.#fitTurns(signal)),
      this.#spinReport,
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

  /**
   * Lets the mBot find, with its eyes, how many radar spins make a full turn, and then what four
   * quarter turns really add up to. Both are set from what it finds.
   */
  async #fitTurns(signal) {
    const report = (text) => show(this.#spinReport, text);
    if (!this.#hub.connected) return report(T.connection.fitNeedsRobot);
    report(T.connection.turnsMeasuring);
    const stepMs = this.#tuning.scanStepMs;
    const { turn, found, seen } = await sweepUntilRepeat(this.#hub, { expected: this.#tuning.scanStops, longest: WIDEST_TURN, stepMs, signal });
    const spins = TUNING_LIMITS.scanStops;
    // If the mBot went away half-way, part of what it saw came from the robot on screen.
    if (!this.#hub.connected || !found || turn < spins.min || turn > spins.max) return report(T.connection.turnsFailed);
    this.#set('scanStops', turn);
    const degrees = await measureQuarters(this.#hub, { seen, stepMs, signal });
    if (!this.#hub.connected || degrees === null) return report(T.connection.spinsDone(turn));
    const { min, max, step } = TUNING_LIMITS.quarterTurnMs;
    const fitted = Math.round((this.#tuning.quarterTurnMs * 360) / degrees / step) * step;
    this.#set('quarterTurnMs', Math.max(min, Math.min(max, fitted)));
    report(T.connection.turnsDone(turn, Math.round(degrees), this.#tuning.quarterTurnMs));
  }

  /** Lets the mBot measure its own step with its eyes, and sets the step time from it. */
  async #fitStep(signal) {
    const report = (text) => show(this.#fitReport, text);
    if (!this.#hub.connected) return report(T.connection.fitNeedsRobot);
    const squares = await measureStep(this.#hub, { signal });
    // If the mBot went away half-way, part of the measurement came from the robot on screen.
    if (!this.#hub.connected || squares === null || squares < SHORTEST_STEP) return report(T.connection.fitFailed);
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

function show(note, text) {
  note.textContent = text;
  note.hidden = false;
}
