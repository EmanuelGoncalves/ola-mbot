import { distinct, locate, measure, measureQuarters, measureStep, spinsInATurn, spinsPast, steadyAverage, sweep, sweepUntilRepeat } from '../js/robot/radar.js';
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
  const seen = await sweep(robot, { stops: 12, stepMs: 1, wait: noWait });
  equal(seen.map((reading) => reading.degrees), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  equal(Math.round(robot.pose.heading) % 360, 0);
});

test('radar: a turn finds the boxes around the robot', async () => {
  const boxes = [[1, 2], [3, 4], [0, 4]];
  const robot = simulator({ obstacles: boxes });
  const pose = { ...robot.pose };
  const seen = await sweep(robot, { stops: 12, stepMs: 1, wait: noWait });
  const cells = seen.map((reading) => locate(pose, reading).cell.join());
  for (const box of boxes) ok(cells.includes(box.join()), `box ${box} was not seen`);
});

/** A turn of looks, one for each range, with nothing seen where none is given. */
function looks(ranges, stops = 12) {
  return Array.from({ length: stops }, (_, i) => ({ degrees: (i * 360) / stops, range: ranges[i] ?? null }));
}
const kept = (ranges, stops) => distinct(looks(ranges, stops)).map((reading) => reading.degrees);

test('radar: a box seen by three looks side by side counts once, in the middle; a wall counts every time', () => {
  equal(kept([1.58, 1.5, 1.52, null, null, 3]), [30, 150]);
  equal(kept([2.3, 2, 2.3]), [0, 30, 60]);
  equal(kept([1.5, 1.55, null, null, null, null, null, null, null, null, null, 1.52]), [0], 'a group that goes past the end of the turn:');
  equal(kept([]), []);
  equal(kept([1.5, 1.6, 1.6, 1.55, 1.6, 1.6, 1.55, 0.75]), [0, 90, 180, 210], 'a long run of alike looks:');
});

test('radar: with finer spins, a box seen by five looks still counts once', () => {
  equal(kept([null, null, 1.52, 1.5, 1.5, 1.51, 1.53], 24), [60]);
});

/** What a robot standing still sees each way: a box close ahead, a wall to its right, a chair behind, nothing elsewhere. */
function around(heading) {
  const at = ((heading % 360) + 360) % 360;
  if (at <= 20 || at >= 340) return 1.5;
  if (at >= 70 && at <= 130) return 3;
  if (at >= 200 && at <= 230) return 2.2;
  return null;
}

/**
 * A real robot that only turns on the spot: `perSpin` degrees at each short spin and
 * `perQuarter` at each quarter turn, whatever it is meant to turn. `view` is what it sees.
 */
function turner({ perSpin, perQuarter = 90, view = around }) {
  const robot = {
    heading: 0,
    range: async () => view(robot.heading),
    spinReal: async (ms, signal, direction = 1) => (robot.heading += direction * perSpin),
    turn: async (quarters) => (robot.heading += quarters * perQuarter),
  };
  return robot;
}

const turnOf = (robot, expected = 12) => sweepUntilRepeat(robot, { expected, stepMs: 1, wait: noWait });

test('radar: a full turn ends where the looks start to repeat', () => {
  const looks = Array.from({ length: 22 }, (_, spin) => around(spin * 24));
  equal(spinsInATurn(looks, 12), 15);
  equal(spinsInATurn(looks.map(() => null), 12), null, 'with nothing in sight:');
  equal(spinsInATurn(looks.map(() => 2), 12), null, 'with the same all round:');
});

test('radar: the real robot finds how many spins its full turn takes, and comes back', async () => {
  for (const [perSpin, spins] of [[24, 15], [30, 12], [20, 18]]) {
    const robot = turner({ perSpin });
    const { turn, found, seen } = await turnOf(robot);
    equal([turn, found, seen.length], [spins, true, spins], `${perSpin}° a spin:`);
    equal(robot.heading % 360, 0, 'it does not face the way it started:');
    equal(seen[1].degrees, 360 / spins);
  }
});

test('radar: with nothing to recognise, the turn is taken to be what it should be', async () => {
  const { turn, found } = await turnOf(turner({ perSpin: 24, view: () => null }));
  equal([turn, found], [12, false]);
});

test('radar: a few looks tell how far past the start of the turn the robot is', () => {
  const turn = Array.from({ length: 15 }, (_, spin) => around(spin * 24));
  const from = (spin) => [0, 1, 2, 3].map((more) => around((spin + more) * 24));
  equal(spinsPast(turn, from(0)), 0);
  equal(spinsPast(turn, from(2)), 2);
  equal(spinsPast(turn, from(-3)), -3);
  equal(spinsPast(turn, [7, 7, 7, 7]), null, 'looks that fit nowhere:');
});

test('radar: four quarter turns are measured against the full turn', async () => {
  for (const [perQuarter, degrees] of [[90, 360], [84, 336], [102, 408]]) {
    const robot = turner({ perSpin: 24, perQuarter });
    const { seen } = await turnOf(robot);
    equal(await measureQuarters(robot, { seen, stepMs: 1, wait: noWait }), degrees, `${perQuarter}° a quarter turn:`);
  }
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
  const seven = (range) => Array(7).fill(range);
  equal(await measureStep(eyes([...seven(3), ...seven(2.25)]), { wait: noWait }), 0.75);
  equal(await measureStep(eyes(seven(1)), { wait: noWait }), null, 'too close to the wall:');
});
