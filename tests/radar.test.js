import { distinct, locate, measure, measureStep, SCAN, steadyAverage, sweep } from '../js/robot/radar.js';
import { Simulator } from '../js/robot/simulator.js';
import { equal, ok, test } from './harness.js';

const FAST = { speed: 150, stepMs: 1, quarterTurnMs: 1 };
const noWait = async () => {};
const close = (a, b) => Math.abs(a - b) < 0.11;

function simulator(world) {
  const robot = new Simulator({ tuning: FAST, beeper: { play() {} } });
  robot.range = async () => robot.rangeAhead();
  if (world) robot.setWorld(world);
  return robot;
}

/** A robot that does not move and whose eyes answer `ranges`, one after the other. */
function eyes(ranges) {
  const left = [...ranges];
  return { range: async () => left.shift(), move: async () => {}, rotate: async () => {} };
}

test('radar: the steady average leaves out the smallest and the largest readings', () => {
  equal(steadyAverage([2, 2.1, 9, 1.9, 0.2]), 2);
  equal(steadyAverage([1, 2, 30]), 2);
  equal(steadyAverage([1, 3]), 2);
});

test('radar: two wild readings do not move the measurement', async () => {
  equal(await measure(eyes([3, 3, 12, 3, 0.4, 3, 3]), { wait: noWait }), 3);
});

test('radar: sees nothing when most readings see nothing', async () => {
  equal(await measure(eyes([null, 2, null, null, 2, null, 2]), { wait: noWait }), null);
  equal(await measure(eyes([2, 2, null, null, 2, 2, null]), { wait: noWait }), 2);
});

test('radar: the robot on screen measures the way to a box and to the edge of the mat', () => {
  const robot = simulator({ obstacles: [[1, 1]] });
  ok(close(robot.rangeAhead(), 2.5), `box at ${robot.rangeAhead()}`);
  robot.pose.heading = 90;
  ok(close(robot.rangeAhead(), 4.5), `edge at ${robot.rangeAhead()}`);
});

test('radar: a turn stops twelve times and ends facing the way it started', async () => {
  const robot = simulator();
  const seen = await sweep(robot, { stepMs: 1, wait: noWait });
  equal(seen.map((reading) => reading.degrees), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  equal(seen.length, SCAN.stops);
  equal(Math.round(robot.pose.heading) % 360, 0);
});

test('radar: a turn finds the boxes around the robot', async () => {
  const boxes = [[1, 2], [3, 4], [0, 4]];
  const robot = simulator({ obstacles: boxes });
  const pose = { ...robot.pose };
  const seen = await sweep(robot, { stepMs: 1, wait: noWait });
  const cells = seen.map((reading) => locate(pose, reading).cell.join());
  for (const box of boxes) ok(cells.includes(box.join()), `box ${box} was not seen`);
});

test('radar: a box seen by three looks side by side counts once, in the middle; a wall counts every time', () => {
  const looks = (ranges) => ranges.map((range, i) => ({ degrees: i * 30, range }));
  const kept = (ranges) => distinct(looks(ranges)).map((reading) => reading.degrees);
  equal(kept([1.58, 1.5, 1.52, null, null, 3]), [30, 150]);
  equal(kept([2.3, 2, 2.3, null]), [0, 30, 60]);
  equal(kept([1.5, 1.55, null, null, 1.52]), [0], 'a group that goes past the end of the turn:');
  equal(kept([1.5, 1.6, 1.6, 1.55, 1.6, 1.6, 1.55, 0.75]), [0, 90, 180, 210], 'a long run of alike looks:');
  equal(kept([null, null, null]), []);
});

test('radar: a reading becomes a spot and a square on the mat', () => {
  const { spot, cell } = locate({ x: 1, y: 4, heading: 0 }, { degrees: 90, range: 1.5 });
  ok(close(spot.x, 2.5) && close(spot.y, 4), JSON.stringify(spot));
  equal(cell, [3, 4]);
});

test('radar: the scanned boxes replace the old ones and never trap the robot', () => {
  const robot = simulator({ obstacles: [[5, 5]] });
  robot.setBoxes([[3, 3], [3, 3], [1, 4], [9, 9]]);
  equal(robot.boxes, [[3, 3]]);
});

test('radar: a step towards a wall is measured by the eyes', async () => {
  const seven = (range) => Array(SCAN.readings).fill(range);
  equal(await measureStep(eyes([...seven(3), ...seven(2.25)]), { wait: noWait }), 0.75);
  equal(await measureStep(eyes(seven(1)), { wait: noWait }), null, 'too close to the wall:');
});
