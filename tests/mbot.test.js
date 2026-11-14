import { MBot } from '../js/robot/mbot.js';
import { RobotHub } from '../js/robot/hub.js';
import { lightsPacket, resetPacket, tonePacket, wheelsPacket } from '../js/robot/protocol.js';
import { DEFAULT_TUNING } from '../js/robot/tuning.js';
import { equal, test } from './harness.js';

/** A link that only writes down the packets it is asked to send. */
function fakeLink() {
  const link = new EventTarget();
  link.sent = [];
  link.send = async (bytes) => link.sent.push([...bytes]);
  return link;
}

/** The packet for a note: it sounds a little shorter than asked, to be over when the next one is due. */
const note = (hz, ms) => tonePacket(hz, Math.max(30, ms - 40));

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
  equal(link.sent, [[...note(262, 40)]], 'sent during the note:');
  await Promise.all(waiting);
  equal(link.sent, [[...note(262, 40)], [...wheelsPacket(50, 50)], [...note(330, 40)]]);
});

test('mbot: a step that bends to the right runs the left wheel faster', async () => {
  const { link, mbot } = robot({ stepMs: 1 });
  await mbot.move(1, undefined, 10);
  const extra = (((10 * Math.PI) / 180) * 11.5) / (2 * 20);
  equal(link.sent, [[...wheelsPacket(150 * (1 + extra), 150 * (1 - extra))], [...wheelsPacket(0, 0)]]);
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RED = { rgb: [150, 0, 0] };
const BLUE = { rgb: [0, 0, 150] };

test('mbot: nothing is sent right after a colour change, when the robot cannot hear', async () => {
  const { link, mbot } = robot();
  await mbot.setLights(RED);
  const driving = mbot.drive(100, 100);
  await pause(20);
  equal(link.sent, [[...lightsPacket(RED.rgb)]], 'sent 20 ms after the colour change:');
  await driving;
  equal(link.sent, [[...lightsPacket(RED.rgb)], [...wheelsPacket(100, 100)]]);
});

test('mbot: a job with its full attention silences the buzzer and slows the lights', async () => {
  const { link, mbot } = robot();
  mbot.focus(true);
  await mbot.playTone(262, 40);
  equal(link.sent, [], 'a note was sent:');
  await mbot.setLights(RED);
  const second = mbot.setLights(BLUE);
  await pause(150);
  equal(link.sent, [[...lightsPacket(RED.rgb)]], 'a second colour 150 ms after the first:');
  await second;
  equal(link.sent, [[...lightsPacket(RED.rgb)], [...lightsPacket(BLUE.rgb)]]);
  mbot.focus(false);
  await mbot.playTone(262, 1);
  equal(link.sent.length, 3, 'the buzzer is back:');
});

test('hub: a job asks for the real robot\'s full attention, also one connected later', () => {
  const asked = [];
  const real = { focus: (on) => asked.push(on) };
  const hub = new RobotHub({}, {});
  hub.focus(true);
  hub.attach(real);
  hub.focus(false);
  equal(asked, [true, false]);
});

test('mbot: the reset packet is the firmware\'s own, with no device', () => {
  equal([...resetPacket()], [0xff, 0x55, 2, 0, 4]);
});

test('mbot: a reset forgets what was waiting, stops the robot three times over and puts the lights out', async () => {
  const { link, mbot } = robot();
  await mbot.playTone(262, 300);
  const waiting = [mbot.drive(100, 100), mbot.setLights(RED), mbot.playTone(294, 500)];
  await mbot.reset();
  await Promise.all(waiting);
  equal(link.sent, [[...note(262, 300)], [...resetPacket()], [...resetPacket()], [...resetPacket()], [...lightsPacket([0, 0, 0])]]);
});

test('hub: a reset stops the robot on screen, puts its lights out and resets the real one', async () => {
  const done = [];
  const screen = { stop: () => done.push('stop'), setLights: (color) => done.push(color) };
  const hub = new RobotHub(screen, {});
  hub.attach({ focus() {}, reset: async () => done.push('real') });
  await hub.reset();
  equal(done, ['stop', null, 'real']);
});

test('hub: a real-only spin goes either way and leaves the robot on screen alone', async () => {
  const spins = [];
  const hub = new RobotHub({ rotate: () => spins.push('screen') }, {});
  hub.attach({ focus() {}, rotate: async (direction, ms) => spins.push([direction, ms]) });
  await hub.spinReal(170);
  await hub.spinReal(170, undefined, -1);
  equal(spins, [[1, 170], [-1, 170]]);
});

test('mbot: a note sounds a little shorter than asked, and never too short to hear', async () => {
  const { link, mbot } = robot();
  await mbot.playTone(440, 238);
  equal(link.sent, [[...tonePacket(440, 198)]]);
  equal([...note(440, 10)], [...tonePacket(440, 30)]);
});

test('mbot: the robot is deaf from when the packet really went, not from when it was handed over', async () => {
  const { link, mbot } = robot();
  // A link that takes 100 ms to write, as when other packets are ahead in its queue.
  link.send = async (bytes) => {
    await pause(100);
    link.sent.push([...bytes]);
  };
  await mbot.setLights(RED);
  const driving = mbot.drive(100, 100);
  await pause(40);
  equal(link.sent.length, 1, '40 ms after the colour change went out:');
  await driving;
  equal(link.sent.length, 2);
});
