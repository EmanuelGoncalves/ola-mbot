import { MBot } from '../js/robot/mbot.js';
import { wheelsPacket } from '../js/robot/protocol.js';
import { DEFAULT_TUNING } from '../js/robot/tuning.js';
import { equal, test } from './harness.js';

/** A link that only writes down the packets it is asked to send. */
function fakeLink() {
  const link = new EventTarget();
  link.sent = [];
  link.send = async (bytes) => link.sent.push([...bytes]);
  return link;
}

function robot(tuning = {}) {
  const link = fakeLink();
  return { link, mbot: new MBot(link, { ...DEFAULT_TUNING, ...tuning }) };
}

test('mbot: driving sends the wheel speeds as they are', async () => {
  const { link, mbot } = robot();
  await mbot.drive(100, 100);
  await mbot.drive(70, -70);
  equal(link.sent, [[...wheelsPacket(100, 100)], [...wheelsPacket(70, -70)]]);
});

test('mbot: "flipDrive" swaps forwards and backwards but not the turns', async () => {
  const { link, mbot } = robot({ flipDrive: true });
  await mbot.drive(100, 100);
  await mbot.drive(70, -70);
  equal(link.sent, [[...wheelsPacket(-100, -100)], [...wheelsPacket(70, -70)]]);
});

test('mbot: "flipTurn" swaps left and right but not forwards', async () => {
  const { link, mbot } = robot({ flipTurn: true });
  await mbot.drive(100, 100);
  await mbot.drive(70, -70);
  equal(link.sent, [[...wheelsPacket(100, 100)], [...wheelsPacket(-70, 70)]]);
});

test('mbot: the eyes report the distance and whether it is close', async () => {
  const { link, mbot } = robot();
  // Answer every distance request with 9.5 cm: ff 55 <index> 02 <float32> 0d 0a.
  link.send = async (bytes) => {
    const reply = new Uint8Array(10);
    reply.set([0xff, 0x55, bytes[3], 2]);
    new DataView(reply.buffer).setFloat32(4, 9.5, true);
    reply.set([0x0d, 0x0a], 8);
    link.dispatchEvent(new CustomEvent('data', { detail: reply }));
  };
  equal(await mbot.look(), { blocked: true, cm: 9.5 });
});
