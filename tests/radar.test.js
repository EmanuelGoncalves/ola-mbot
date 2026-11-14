import { correctedSpinTime, distinct, locate, measure, measureQuarters, measureStep, spinsInATurn, spinsOf, spinsPast, spinTime, steadyAverage, sweep, sweepUntilRepeat, whereInTurn } from '../js/robot/radar.js';
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

const turnOf = (robot, expected = 12, longest = 1.5) => sweepUntilRepeat(robot, { expected, longest, stepMs: 1, wait: noWait });

/** True when `value` is within `by` of `wanted`. */
const near = (value, wanted, by) => value !== null && Math.abs(value - wanted) <= by;

test('radar: a full turn ends where the looks start to repeat', () => {
  const looks = Array.from({ length: 22 }, (_, spin) => around(spin * 24));
  ok(near(spinsInATurn(looks, 12), 15, 0.6), `15 spins, not ${spinsInATurn(looks, 12)}`);
  equal(spinsInATurn(looks.map(() => null), 12), null, 'with nothing in sight:');
  equal(spinsInATurn(looks.map(() => 2), 12), null, 'with the same all round:');
  equal(spinsInATurn([1.5, ...Array(21).fill(null)], 12), null, 'with one thing seen once and nothing else:');
});

test('radar: what a real mBot saw while someone walked away from it is not taken for a turn', () => {
  // 22 looks, in cm: a pair of legs 35 cm away for five looks, gone in the middle of the sixth.
  const cm = [70, 69, 101, 95, 79, 78, 37, 34, 34.5, 35, 35, 35, null, null, 159, 225, 52, 175, 80, 17, 88.5, 87];
  equal(spinsInATurn(cm.map((look) => look && (look + 10) / 20), 12), null);
});

test('radar: two turns of looks are not taken for one long turn', () => {
  const looks = Array.from({ length: 36 }, (_, spin) => around(spin * 24));
  ok(near(spinsInATurn(looks, 12), 15, 0.3), `15 spins, not ${spinsInATurn(looks, 12)}`);
});

// What a real mBot saw in a room, one 170 ms spin apart, in squares: three turns of 13.6 spins.
const N = null;
const REAL_LOOKS = [
  2.62, N, 4.55, 4.22, 3.89, 4.87, 3.54, 1.84, 5.35, 1.93, 1.83, N, N, 2.63, 2.7, 4.7, 4.25, 3.96, 4.02, 4.88, 3.53,
  1.86, 5.34, 1.93, 1.82, N, N, 2.64, N, 4.35, 4.28, 3.95, 4.87, 3.56, 1.84, 5.37, 5.35, 1.84, 1.84, N, 2.69, 2.63,
];

test('radar: the turn of a real mBot is found in what its eyes really saw, also when it is not a whole number of spins', () => {
  ok(near(spinsInATurn(REAL_LOOKS, 12), 13.6, 0.2), `all the looks: ${spinsInATurn(REAL_LOOKS, 12)}`);
  for (const [from, count] of [[0, 22], [0, 30], [4, 26], [8, 34]]) {
    const turn = spinsInATurn(REAL_LOOKS.slice(from, from + count), 12);
    ok(near(turn, 13.6, 0.7), `${count} looks from the ${from}th: ${turn}`);
  }
});

test('radar: the real robot finds how many spins its full turn takes, and comes back', async () => {
  for (const [perSpin, spins, expected] of [[24, 15, 12], [30, 12, 12], [20, 18, 16]]) {
    const robot = turner({ perSpin });
    const { turn, found, seen } = await turnOf(robot, expected);
    ok(found && near(turn, spins, 0.6), `${perSpin}° a spin: ${turn} spins`);
    ok(seen.length - spins <= 1, `${seen.length} looks in a turn of ${spins} spins`);
    ok(near(((robot.heading + 180) % 360) - 180, 0, perSpin), `it faces ${robot.heading % 360}° from where it started`);
    ok(near(seen[1].degrees, 360 / spins, 1.5));
  }
});

test('radar: with nothing to recognise, the turn is taken to be what it should be', async () => {
  const { turn, found } = await turnOf(turner({ perSpin: 24, view: () => null }));
  equal([turn, found], [12, false]);
});

test('radar: a few looks tell where in the turn the robot is', () => {
  const looks = Array.from({ length: 19 }, (_, spin) => around(spin * 24));
  const from = (spin) => Array.from({ length: 8 }, (_, more) => around((spin + more) * 24));
  for (const [past, at] of [[0, 0], [2, 2], [-3, 12], [7, 7]]) {
    const found = spinsPast(looks, 15, from(past));
    ok(found !== null && Math.abs(((found - at + 22.5) % 15) - 7.5) <= 0.5, `${past} spins past the start: ${found}`);
  }
  equal(spinsPast(looks, 15, Array(8).fill(7)), null, 'looks that fit nowhere:');
});

test('radar: looks that fit in two places do not tell where the robot is', () => {
  // The same box ahead and behind, and nothing else.
  const twice = (heading) => (heading % 180 <= 20 || heading % 180 >= 160 ? 1.5 : null);
  const looks = Array.from({ length: 19 }, (_, spin) => twice(spin * 24));
  equal(spinsPast(looks, 15, Array.from({ length: 8 }, (_, more) => twice(more * 24))), null);
});

test('radar: four quarter turns are measured against the full turn, from wherever the robot is in it', async () => {
  for (const [perQuarter, start] of [[90, 0], [84, 0], [102, 0], [93, 5]]) {
    const robot = turner({ perSpin: 24, perQuarter });
    const { looks, turn } = await turnOf(robot, 12, 2);
    for (let spin = 0; spin < start; spin++) await robot.spinReal();
    const from = await whereInTurn(robot, { looks, turn, stepMs: 1, wait: noWait });
    const measured = await measureQuarters(robot, { looks, turn, from, stepMs: 1, wait: noWait });
    ok(near(measured?.degrees, perQuarter * 4, 13), `four quarter turns of ${perQuarter}°: ${measured?.degrees}°`);
    const off = (((measured.at - robot.heading / 24) % 15) + 22.5) % 15 - 7.5;
    ok(Math.abs(off) <= 1, `it says it is ${off} spins from where it is`);
  }
});

test('radar: the time of a quarter turn follows from the spins in a full turn, less the time a spin loses getting going', () => {
  // 13.6 spins of 170 ms a turn: 26.5° in the 144 ms the robot really turns.
  ok(near(spinTime({ stepMs: 170, turn: 13.6 }, 90), 516, 2), `${spinTime({ stepMs: 170, turn: 13.6 }, 90)} ms`);
  ok(near(spinTime({ stepMs: 170, turn: 13.6 }, 30), 189, 2));
  // Shorter spins: more of them in a turn.
  ok(near(spinsOf({ stepMs: 170, turn: 13.6 }, 120), 20.8, 0.1), `${spinsOf({ stepMs: 170, turn: 13.6 }, 120)} spins`);
  // Eight quarter turns of 540 ms that made 808° instead of 720°.
  ok(near(correctedSpinTime(540, 808, 720), 484, 1), `${correctedSpinTime(540, 808, 720)} ms`);
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

test('radar: a step towards a wall and back is measured by the eyes', async () => {
  const seven = (range) => Array(7).fill(range);
  equal(await measureStep(eyes([...seven(3), ...seven(2.25), ...seven(3)]), { wait: noWait }), 0.75);
  ok(close(await measureStep(eyes([...seven(3), ...seven(2.3), ...seven(2.9)]), { wait: noWait }), 0.65), 'a step back a little shorter:');
  equal(await measureStep(eyes(seven(1)), { wait: noWait }), null, 'too close to the wall:');
  equal(await measureStep(eyes([...seven(6.7), ...seven(4.5), ...seven(5)]), { wait: noWait }), null, 'the eyes saw something else on the way:');
});
