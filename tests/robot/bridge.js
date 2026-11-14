import { NOTIFY_UUID } from '../../js/robot/protocol.js';

/**
 * A stand-in for `navigator.bluetooth` that reaches the real mBot through tools/mbot-bridge
 * running on this computer, for browsers without Web Bluetooth. Pass it to a `BluetoothLink`.
 */
export function bridgeBluetooth(url = 'ws://127.0.0.1:8766') {
  return { requestDevice: async () => new BridgeDevice(url) };
}

/** Looks like a Web Bluetooth device with the mBot's one service and two characteristics. */
class BridgeDevice extends EventTarget {
  name = 'mBot';
  gatt = {
    connected: false,
    connect: () => this.#connect(),
    disconnect: () => this.#socket?.close(),
  };
  #url;
  #socket = null;
  #reader = Object.assign(new EventTarget(), { value: null, startNotifications: async () => {} });
  #writer = {
    properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: async (bytes) => this.#write(bytes),
    writeValue: async (bytes) => this.#write(bytes),
  };

  constructor(url) {
    super();
    this.#url = url;
  }

  #connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.#url);
      socket.binaryType = 'arraybuffer';
      // A moment first: a bridge that is still letting go of the robot, for the page before this one, gets to finish.
      socket.onopen = () => setTimeout(() => socket.send('find'), 800);
      socket.onerror = () => reject(new DOMException('The bridge is not running', 'NetworkError'));
      socket.onmessage = ({ data }) => {
        if (typeof data !== 'string') {
          this.#reader.value = new DataView(data);
          this.#reader.dispatchEvent(new Event('characteristicvaluechanged'));
          return;
        }
        const message = JSON.parse(data);
        if (message.state === 'ready') {
          this.name = message.name || this.name;
          this.#writer.properties.writeWithoutResponse = message.quick;
          this.#socket = socket;
          this.gatt.connected = true;
          resolve({ getPrimaryService: async () => ({ getCharacteristic: async (uuid) => (uuid === NOTIFY_UUID ? this.#reader : this.#writer) }) });
        } else if (message.state === 'no-bluetooth') {
          reject(new DOMException('Bluetooth is off or not allowed on this computer', 'NotFoundError'));
          socket.close();
        }
      };
      socket.onclose = () => {
        reject(new DOMException('The robot was not found', 'NetworkError'));
        if (!this.gatt.connected) return;
        this.gatt.connected = false;
        this.#socket = null;
        this.dispatchEvent(new Event('gattserverdisconnected'));
      };
    });
  }

  #write(bytes) {
    if (!this.gatt.connected) throw new DOMException('The robot went away', 'NetworkError');
    this.#socket.send(bytes);
  }
}
