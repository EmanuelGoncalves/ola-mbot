import { MBot } from '../js/robot/mbot.js';
import { tonePacket, wheelsPacket } from '../js/robot/protocol.js';
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

test('mbot: two looks at the same time each get their own answer', async () => {
  const { link, mbot } = robot();
  const asked = [];
  link.send = async (bytes) => asked.push(bytes[3]);
  const looks = [mbot.readDistance(), mbot.readDistance()];
  await Promise.resolve();
  // Answer the second question first.
  for (const [index, cm] of [[asked[1], 30], [asked[0], 12]]) {
    const reply = new Uint8Array(10);
    reply.set([0xff, 0x55, index, 2]);
    new DataView(reply.buffer).setFloat32(4, cm, true);
    reply.set([0x0d, 0x0a], 8);
    link.dispatchEvent(new CustomEvent('data', { detail: reply }));
  }
  equal(await Promise.all(looks), [12, 30]);
});

test('mbot: a radar spin runs the wheels in opposite ways, then stops', async () => {
  const { link, mbot } = robot();
  await mbot.rotate(30, 1);
  equal(link.sent, [[...wheelsPacket(150, -150)], [...wheelsPacket(0, 0)]]);
});

test('mbot: nothing is sent while a note plays, and then only the newest of each kind', async () => {
  const { link, mbot } = robot();
  await mbot.playTone(262, 40);
  const waiting = [mbot.drive(100, 100), mbot.playTone(294, 40), mbot.drive(50, 50), mbot.playTone(330, 40)];
  equal(link.sent, [[...tonePacket(262, 40)]], 'sent during the note:');
  await Promise.all(waiting);
  equal(link.sent, [[...tonePacket(262, 40)], [...wheelsPacket(50, 50)], [...tonePacket(330, 40)]]);
});

test('mbot: a step that bends to the right runs the left wheel faster', async () => {
  const { link, mbot } = robot({ stepMs: 1 });
  await mbot.move(1, undefined, 10);
  const extra = (((10 * Math.PI) / 180) * 11.5) / (2 * 20);
  equal(link.sent, [[...wheelsPacket(150 * (1 + extra), 150 * (1 - extra))], [...wheelsPacket(0, 0)]]);
});
