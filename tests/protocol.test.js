import { distanceRequest, lightsPacket, ReplyParser, tonePacket, wheelsPacket } from '../js/robot/protocol.js';
import { equal, test } from './harness.js';

const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');

test('wheels: the left motor is mirrored', () => {
  equal(hex(wheelsPacket(100, 100)), 'ff 55 07 00 02 05 9c ff 64 00');
});

test('wheels: speeds are clamped to ±255', () => {
  equal(hex(wheelsPacket(-999, 999)), 'ff 55 07 00 02 05 ff 00 ff 00');
});

test('lights: port 7, slot 2, both LEDs', () => {
  equal(hex(lightsPacket([1, 2, 3])), 'ff 55 09 00 02 08 07 02 00 01 02 03');
});

test('tone: frequency and duration are little-endian', () => {
  equal(hex(tonePacket(262, 350)), 'ff 55 07 00 02 22 06 01 5e 01');
});

test('distance request: ultrasonic sensor on port 3', () => {
  equal(hex(distanceRequest(1)), 'ff 55 04 01 01 01 03');
});

test('parser: reads a float reply', () => {
  // 12.5 as a little-endian float32 is 00 00 48 41
  const replies = new ReplyParser().push([0xff, 0x55, 0x01, 0x02, 0x00, 0x00, 0x48, 0x41, 0x0d, 0x0a]);
  equal(replies, [{ index: 1, value: 12.5 }]);
});

test('parser: joins a reply split across notifications', () => {
  const parser = new ReplyParser();
  equal(parser.push([0xff]), []);
  equal(parser.push([0x55, 0x01, 0x02, 0x00]), []);
  equal(parser.push([0x00, 0x48, 0x41, 0x0d, 0x0a]), [{ index: 1, value: 12.5 }]);
});

test('parser: skips acknowledgements and noise', () => {
  const parser = new ReplyParser();
  const bytes = [0x07, 0xff, 0x55, 0x0d, 0x0a, 0xff, 0x55, 0x02, 0x01, 0x01, 0x0d, 0x0a];
  equal(parser.push(bytes), [{ index: 2, value: 1 }]);
});
