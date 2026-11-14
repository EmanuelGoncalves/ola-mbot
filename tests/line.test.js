import { followLine, leanAfter, Line, wheelsFor } from '../js/robot/line-follower.js';
import { MBot } from '../js/robot/mbot.js';
import { lineRequest } from '../js/robot/protocol.js';
import { Simulator } from '../js/robot/simulator.js';
import { DEFAULT_TUNING } from '../js/robot/tuning.js';
import { equal, ok, test } from './harness.js';

const noWait = async () => {};

test('line: the question for the line sensors goes to port 2', () => {
  equal([...lineRequest(7)], [0xff, 0x55, 4, 7, 1, 17, 2]);
});

test('line: the mBot answers with what its two sensors see', async () => {
  const link = new EventTarget();
  link.send = async (bytes) => {
    const reply = new Uint8Array(10);
    reply.set([0xff, 0x55, bytes[3], 2]);
    new DataView(reply.buffer).setFloat32(4, 2, true);
    reply.set([0x0d, 0x0a], 8);
    link.dispatchEvent(new CustomEvent('data', { detail: reply }));
  };
  equal(await new MBot(link, DEFAULT_TUNING).readLine(), Line.RIGHT);
});

test('line: the wheels go straight on the line and slow down on the side the line is', () => {
  equal(wheelsFor(Line.BOTH, 0), [1, 1]);
  const [left, right] = wheelsFor(Line.LEFT, 0);
  ok(left < right, 'the line is to the left, so the left wheel is the slow one');
  equal(wheelsFor(Line.RIGHT, 0), [right, left]);
});

test('line: off the line, the robot turns to where it last saw it, or backs up', () => {
  const lean = leanAfter(Line.LEFT, leanAfter(Line.LEFT, 0));
  ok(lean < 0);
  equal(leanAfter(Line.NONE, lean), lean, 'losing the line does not change the memory:');
  const [left, right] = wheelsFor(Line.NONE, lean);
  ok(left < 0 && right > 0, 'a turn to the left on the spot');
  ok(wheelsFor(Line.NONE, 0).every((wheel) => wheel < 0), 'backing up');
  equal(leanAfter(Line.BOTH, lean), 0);
});

/** A robot whose sensors see `readings` one after the other; it writes down what its wheels are told. */
function scripted(readings) {
  const left = [...readings];
  const robot = { driven: [], readLine: async () => (left.length > 0 ? left.shift() : Line.NONE), drive: async (...wheels) => robot.driven.push(wheels) };
  return robot;
}

test('line: the wheels are only told when what the sensors see changes', async () => {
  const robot = scripted([Line.BOTH, Line.BOTH, Line.LEFT, Line.LEFT, Line.BOTH]);
  let clock = 0;
  const ended = await followLine(robot, { speed: 100, wait: noWait, now: () => (clock += 10) });
  equal(ended, 'lost', 'with the line gone for good:');
  equal(robot.driven.slice(0, 4), [[100, 100], [25, 100], [100, 100], [-60, -60]]);
});

test('line: the wheels are told again now and then, in case an order was lost', async () => {
  const robot = scripted(Array(40).fill(Line.BOTH));
  let clock = 0;
  await followLine(robot, { speed: 100, wait: noWait, now: () => (clock += 10) });
  equal(robot.driven.filter(([left, right]) => left === 100 && right === 100).length, 2, 'in 400 ms on the line:');
});

test('line: a robot that stops answering is stopped at once, and the following ends', async () => {
  const robot = scripted([Line.BOTH, null, null, null, null, null]);
  equal(await followLine(robot, { speed: 100, wait: noWait }), 'silent');
  equal(robot.driven, [[100, 100], [0, 0]]);
});

test('line: the robot on screen starts on its circuit and goes all the way round it', () => {
  const robot = new Simulator({ tuning: DEFAULT_TUNING, beeper: { play() {} } });
  equal(robot.lineSeen(), Line.NONE, 'with no circuit there is no line:');
  robot.showCircuit(true);
  equal(robot.lineSeen(), Line.BOTH);
  const { x, y, radius } = robot.circuit;
  const angle = () => Math.atan2(robot.pose.y - y, robot.pose.x - x);
  let [lean, turned, furthest, before] = [0, 0, 0, angle()];
  for (let tick = 0; tick < 700; tick++) {
    const seen = robot.lineSeen();
    lean = leanAfter(seen, lean);
    const [left, right] = wheelsFor(seen, lean);
    robot.drive(left * 110, right * 110);
    robot.advance(40);
    furthest = Math.max(furthest, Math.abs(Math.hypot(robot.pose.x - x, robot.pose.y - y) - radius));
    turned += ((angle() - before + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    before = angle();
  }
  robot.stop();
  ok(furthest < 0.2, `it strayed ${furthest.toFixed(2)} squares from the line`);
  ok(Math.abs(turned) > 2 * Math.PI, `it only went ${Math.round((Math.abs(turned) * 180) / Math.PI)}° round`);
});

test('line: the boxes of the mat are put aside while the circuit is shown', () => {
  const robot = new Simulator({ tuning: DEFAULT_TUNING, beeper: { play() {} } });
  robot.setWorld({ obstacles: [[1, 2], [3, 3]] });
  robot.showCircuit(true);
  equal(robot.boxes, []);
  robot.showCircuit(true);
  robot.showCircuit(false);
  equal(robot.boxes, [[1, 2], [3, 3]]);
  equal(robot.circuit, null);
});
