import { NOTIFY_UUID, SERVICE_UUID, WRITE_UUID } from './protocol.js';

const NAME_PREFIX = 'Makeblock';

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
      throw error;
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
    if (writer.writeValueWithoutResponse && writer.properties?.writeWithoutResponse) {
      await writer.writeValueWithoutResponse(bytes);
    } else {
      await writer.writeValue(bytes);
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
