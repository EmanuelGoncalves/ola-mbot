import { sleep } from '../timing.js';
import { NOTIFY_UUID, SERVICE_UUID, WRITE_UUID } from './protocol.js';

/** How the mBot's name may start, in the list of devices. */
const NAME_PREFIXES = ['Makeblock', 'makeblock', 'MakeBlock', 'mBot'];
/** A write that takes longer than this is given up, so that the ones waiting behind it can go. */
const WRITE_LIMIT_MS = 1500;
/** Connecting to a robot that does not answer is given up after this long. */
const OPEN_LIMIT_MS = 12000;
/** A short rest between two writes, so that the robot's small buffer keeps up. */
const WRITE_GAP_MS = 10;
/** After this many writes in a row given up, the link is taken for stuck and started again. */
const STUCK_AFTER = 2;
/** How long to wait before each try at getting back a robot that went away. */
const REPAIR_WAITS_MS = [300, 1000, 2500];

/**
 * True on an iPad or iPhone. The browsers with Bluetooth there do not find the mBot by its name
 * or its service, so the list has to show every device nearby.
 */
export function listsAllDevices({ userAgent = '', platform = '', maxTouchPoints = 0 } = globalThis.navigator ?? {}) {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/**
 * Bluetooth Low Energy link to the mBot.
 * Events: `data` (detail: Uint8Array received), `sent` (detail: the bytes written), `repairing`
 * and `repaired` (the robot went away without being asked to, and came back), and `disconnect`.
 */
export class BluetoothLink extends EventTarget {
  /** How the link is doing, for a grown-up to read: packets sent and failed, the slowest write, links started again. */
  health = { sent: 0, failed: 0, slowestMs: 0, repairs: 0 };

  #bluetooth;
  #writeLimitMs;
  #openLimitMs;
  #wait;
  #device = null;
  #writer = null;
  /** Packets waiting to be written: `{ bytes, kind, done }`. */
  #outbox = [];
  #sending = false;
  /** The user connected and has not disconnected: a robot that goes away is fetched back. */
  #wanted = false;
  #repairing = false;
  #stuck = 0;

  /** `bluetooth`, the two time limits and `wait` can be replaced in tests. */
  constructor({ bluetooth = globalThis.navigator?.bluetooth, writeLimitMs = WRITE_LIMIT_MS, openLimitMs = OPEN_LIMIT_MS, wait = sleep } = {}) {
    super();
    this.#bluetooth = bluetooth;
    this.#writeLimitMs = writeLimitMs;
    this.#openLimitMs = openLimitMs;
    this.#wait = wait;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  get connected() {
    return Boolean(this.#writer && this.#device?.gatt?.connected);
  }

  /**
   * Opens the browser's device chooser and connects to the chosen robot.
   * The chooser lists only mBots, or every device nearby with `anyDevice`.
   */
  async connect({ anyDevice = false } = {}) {
    const filters = [...NAME_PREFIXES.map((namePrefix) => ({ namePrefix })), { services: [SERVICE_UUID] }];
    const which = anyDevice ? { acceptAllDevices: true } : { filters };
    const device = await this.#bluetooth.requestDevice({ ...which, optionalServices: [SERVICE_UUID] });
    try {
      await this.#open(device);
    } catch (error) {
      device.gatt.disconnect(); // do not leave a half-open connection behind
      // Not the error's own name: a missing service is a NotFoundError, like a closed chooser.
      throw new Error(`${error.name}: ${error.message}`, { cause: error });
    }
    this.#device = device;
    this.#wanted = true;
    this.health = { sent: 0, failed: 0, slowestMs: 0, repairs: 0 };
    device.addEventListener('gattserverdisconnected', this.#onDisconnect);
  }

  /**
   * Queues a packet: the browser allows one Bluetooth write at a time. Of the packets of one
   * `kind` that are still waiting, only the newest is written, so a slow link does not fall
   * behind. Resolves when the packet was written, replaced or dropped.
   */
  send(bytes, kind = null) {
    return new Promise((done) => {
      const waiting = kind !== null && this.#outbox.find((packet) => packet.kind === kind);
      if (waiting) {
        waiting.bytes = bytes;
        waiting.done.push(done);
        return;
      }
      this.#outbox.push({ bytes, kind, done: [done] });
      this.#pump();
    });
  }

  /** Forgets the packets that are still waiting to be written. */
  clear() {
    for (const packet of this.#outbox.splice(0)) {
      for (const done of packet.done) done();
    }
  }

  disconnect() {
    this.#wanted = false;
    this.#device?.gatt?.disconnect();
  }

  /** Connects and finds the two characteristics; gives up, and lets go of the robot, if that takes too long. */
  async #open(device) {
    const opening = (async () => {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const reader = await service.getCharacteristic(NOTIFY_UUID);
      reader.addEventListener('characteristicvaluechanged', this.#onData);
      await reader.startNotifications();
      return service.getCharacteristic(WRITE_UUID);
    })();
    try {
      this.#writer = await withLimit(opening, this.#openLimitMs, 'The mBot did not answer in time');
    } catch (error) {
      opening.catch(() => {}); // it may still fail later, with nobody waiting
      device.gatt.disconnect();
      throw error;
    }
  }

  /** Writes the waiting packets one after the other. */
  async #pump() {
    if (this.#sending) return;
    this.#sending = true;
    while (this.#outbox.length > 0) {
      const packet = this.#outbox.shift();
      await this.#write(packet.bytes);
      for (const done of packet.done) done();
      if (this.#outbox.length > 0) await this.#wait(WRITE_GAP_MS);
    }
    this.#sending = false;
  }

  async #write(bytes) {
    if (!this.connected) return;
    const writer = this.#writer;
    const quick = writer.writeValueWithoutResponse && writer.properties?.writeWithoutResponse;
    const started = performance.now();
    try {
      await withLimit(quick ? writer.writeValueWithoutResponse(bytes) : writer.writeValue(bytes), this.#writeLimitMs, 'The mBot did not take the command in time');
      this.health.sent += 1;
      this.dispatchEvent(new CustomEvent('sent', { detail: bytes }));
      this.health.slowestMs = Math.max(this.health.slowestMs, Math.round(performance.now() - started));
      this.#stuck = 0;
    } catch (error) {
      this.health.failed += 1;
      console.warn('mBot write failed', error);
      // A link that takes nothing any more is dropped; the repair below starts it again.
      if (++this.#stuck >= STUCK_AFTER) this.#device.gatt.disconnect();
    }
  }

  /** The robot went away without being asked to: tries to get it back a few times before giving up. */
  async #repair() {
    if (this.#repairing) return;
    this.#repairing = true;
    this.dispatchEvent(new Event('repairing'));
    for (const pause of REPAIR_WAITS_MS) {
      await this.#wait(pause);
      if (!this.#wanted) break;
      try {
        await this.#open(this.#device);
        this.health.repairs += 1;
        this.#repairing = false;
        this.dispatchEvent(new Event('repaired'));
        return;
      } catch {
        // Not back yet: the next try waits longer.
      }
    }
    this.#repairing = false;
    this.#wanted = false;
    if (this.#device.gatt.connected) this.#device.gatt.disconnect();
    else this.dispatchEvent(new Event('disconnect'));
  }

  #onData = (event) => {
    const { buffer, byteOffset, byteLength } = event.target.value;
    this.dispatchEvent(new CustomEvent('data', { detail: new Uint8Array(buffer, byteOffset, byteLength) }));
  };

  #onDisconnect = () => {
    this.#writer = null;
    this.#stuck = 0;
    if (this.#repairing) return; // a try that failed half-way: the repair goes on
    if (this.#wanted) this.#repair();
    else this.dispatchEvent(new Event('disconnect'));
  };
}

/** Resolves like `promise`, or rejects with `message` if it takes longer than `ms`. */
function withLimit(promise, ms, message) {
  let timer;
  const tooLong = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, tooLong]).finally(() => clearTimeout(timer));
}
