/**
 * Makeblock serial protocol, as parsed by the mBot factory firmware (06.01.x):
 *   ff 55 <length> <index> <action> <device> <data...>
 * Replies to a GET come back as: ff 55 <index> <type> <value...> 0d 0a
 */
export const SERVICE_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
export const NOTIFY_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';
export const WRITE_UUID = '0000ffe3-0000-1000-8000-00805f9b34fb';

const HEADER = [0xff, 0x55];
const LINE_END = [0x0d, 0x0a];
const Action = { GET: 1, RUN: 2 };
const Device = { ULTRASONIC: 1, JOYSTICK: 5, RGB_LED: 8, LINE_FOLLOWER: 17, TONE: 34 };
const Port = { LINE_FOLLOWER: 2, ULTRASONIC: 3, RGB_LED: 7 };
const RGB_SLOT = 2;
const ALL_LEDS = 0;
const MAX_SPEED = 255;

/** Reply value types and their sizes in bytes. */
const VALUE_SIZE = { 1: 1, 2: 4, 3: 2 };

/** Sets both wheels; speeds are −255…255, positive is forwards. */
export function wheelsPacket(left, right) {
  // The left motor is mounted mirrored, so it runs backwards to go forwards.
  return packet(0, Action.RUN, Device.JOYSTICK, ...int16(-clampSpeed(left)), ...int16(clampSpeed(right)));
}

/** Sets both on-board LEDs to an [r, g, b] colour (0…255 each). */
export function lightsPacket([red, green, blue]) {
  return packet(0, Action.RUN, Device.RGB_LED, Port.RGB_LED, RGB_SLOT, ALL_LEDS, red, green, blue);
}

/** Plays a tone on the buzzer; 0 Hz silences it. */
export function tonePacket(hz, ms) {
  return packet(0, Action.RUN, Device.TONE, ...int16(hz), ...int16(ms));
}

/** Asks for the ultrasonic distance; the reply carries the same `index`. */
export function distanceRequest(index) {
  return packet(index, Action.GET, Device.ULTRASONIC, Port.ULTRASONIC);
}

/**
 * Asks what the two line sensors under the robot see. The reply is a number: 0 when both are
 * over the black line, 1 when only the left one is, 2 when only the right one is, 3 when neither.
 */
export function lineRequest(index) {
  return packet(index, Action.GET, Device.LINE_FOLLOWER, Port.LINE_FOLLOWER);
}

/** Collects notification bytes and returns the complete replies found so far. */
export class ReplyParser {
  #buffer = [];

  /** @returns {{index: number, value: number}[]} */
  push(bytes) {
    this.#buffer.push(...bytes);
    const replies = [];
    for (;;) {
      const start = findHeader(this.#buffer);
      if (start < 0) {
        // Keep a trailing ff: it may be the first half of a header.
        this.#buffer = this.#buffer.at(-1) === HEADER[0] ? [HEADER[0]] : [];
        break;
      }
      this.#buffer.splice(0, start);
      const buffer = this.#buffer;
      if (buffer.length < 4) break;
      if (buffer[2] === LINE_END[0] && buffer[3] === LINE_END[1]) {
        buffer.splice(0, 4); // "ff 55 0d 0a" only acknowledges a RUN
        continue;
      }
      const size = VALUE_SIZE[buffer[3]];
      if (size === undefined) {
        buffer.splice(0, 2); // unknown type: skip this header and resync
        continue;
      }
      if (buffer.length < 4 + size) break;
      replies.push({ index: buffer[2], value: decodeValue(buffer[3], buffer.slice(4, 4 + size)) });
      buffer.splice(0, 4 + size);
    }
    return replies;
  }
}

function packet(index, action, device, ...data) {
  const body = [index, action, device, ...data];
  return Uint8Array.of(...HEADER, body.length, ...body);
}

function int16(value) {
  const bits = Math.round(value) & 0xffff;
  return [bits & 0xff, bits >> 8];
}

function clampSpeed(speed) {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
}

function findHeader(buffer) {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === HEADER[0] && buffer[i + 1] === HEADER[1]) return i;
  }
  return -1;
}

function decodeValue(type, bytes) {
  const view = new DataView(Uint8Array.from(bytes).buffer);
  if (type === 1) return view.getUint8(0);
  if (type === 2) return view.getFloat32(0, true);
  return view.getInt16(0, true);
}
