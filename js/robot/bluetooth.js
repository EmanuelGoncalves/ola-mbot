import { NOTIFY_UUID, SERVICE_UUID, WRITE_UUID } from './protocol.js';

const NAME_PREFIX = 'Makeblock';
/** A write that takes longer than this is given up, so that the ones waiting behind it can go. */
const WRITE_LIMIT_MS = 1500;

/**
 * Bluetooth Low Energy link to the mBot.
 * Events: `data` (detail: Uint8Array received) and `disconnect`.
 */
export class BluetoothLink extends EventTarget {
  #device = null;
  #writer = null;
  #queue = Promise.resolve();

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
    const which = anyDevice ? { acceptAllDevices: true } : { filters: [{ namePrefix: NAME_PREFIX }, { services: [SERVICE_UUID] }] };
    const device = await navigator.bluetooth.requestDevice({ ...which, optionalServices: [SERVICE_UUID] });
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const reader = await service.getCharacteristic(NOTIFY_UUID);
      reader.addEventListener('characteristicvaluechanged', this.#onData);
      await reader.startNotifications();
      this.#writer = await service.getCharacteristic(WRITE_UUID);
    } catch (error) {
      device.gatt.disconnect(); // do not leave a half-open connection behind
      // Not the error's own name: a missing service is a NotFoundError, like a closed chooser.
      throw new Error(`${error.name}: ${error.message}`, { cause: error });
    }
    this.#device = device;
    device.addEventListener('gattserverdisconnected', this.#onDisconnect);
  }

  /** Queues a packet: the browser allows one Bluetooth write at a time. */
  send(bytes) {
    const write = this.#queue.then(() => this.#write(bytes));
    this.#queue = write.catch(() => {});
    return write;
  }

  disconnect() {
    this.#device?.gatt?.disconnect();
  }

  async #write(bytes) {
    if (!this.connected) return;
    const writer = this.#writer;
    const quick = writer.writeValueWithoutResponse && writer.properties?.writeWithoutResponse;
    const written = quick ? writer.writeValueWithoutResponse(bytes) : writer.writeValue(bytes);
    let timer;
    const tooLong = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The mBot did not take the command in time')), WRITE_LIMIT_MS);
    });
    try {
      await Promise.race([written, tooLong]);
    } finally {
      clearTimeout(timer);
    }
  }

  #onData = (event) => {
    const { buffer, byteOffset, byteLength } = event.target.value;
    this.dispatchEvent(new CustomEvent('data', { detail: new Uint8Array(buffer, byteOffset, byteLength) }));
  };

  #onDisconnect = () => {
    this.#writer = null;
    this.dispatchEvent(new Event('disconnect'));
  };
}
