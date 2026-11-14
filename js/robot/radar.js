import { sleep } from '../timing.js';

/** How many times the radar measures at each stop. */
const READINGS = 7;
/** Fewer when it only needs to tell near from far. */
const QUICK_READINGS = 3;
/** Lets the robot stop wobbling before it measures. */
const SETTLE_MS = 200;
/** Lets the echo of one measurement die out before the next. */
const READING_GAP_MS = 60;
/** The eyes see the near face of a thing; its square is a little further on. */
const BOX_DEPTH = 0.3;
/** Two looks side by side that differ by less than this part of the distance saw the same thing. */
const SAME_THING = 0.08;
/** The eyes see a cone about this wide, in degrees. */
const BEAM_DEGREES = 30;
/** To count the spins of a full turn, the thing in front must be nearer than this, in squares… */
const NEAR_LIMIT = 3;
/** …and everything else at least this many times further away. */
const CLEARLY_FURTHER = 1.5;
/** Spins after which counting a full turn gives up. */
const MOST_SPINS = 60;
/** Two looks the same way that differ by more than this part saw different things. */
const SAME_SIGHT = 0.25;
/** The wall must be at least this far, in squares, to test a step towards it. */
const ROOM_FOR_A_STEP = 2;

/** The average of the middle `values`: the smallest and the largest thirds are the likeliest to be wrong. */
export function steadyAverage(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const dropped = Math.floor(sorted.length / 3);
  const kept = sorted.slice(dropped, sorted.length - dropped);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/**
 * Measures several times without moving and returns the steady average in squares,
 * or null when most of the measurements saw nothing.
 */
export async function measure(robot, { signal, wait = sleep, readings = READINGS } = {}) {
  const ranges = [];
  for (let i = 0; i < readings; i++) {
    if (i > 0) await wait(READING_GAP_MS, signal);
    const range = await robot.range();
    if (range !== null) ranges.push(range);
  }
  return ranges.length > readings / 2 ? steadyAverage(ranges) : null;
}

/**
 * Turns `robot` (see RobotHub) once around in `stops` short spins of `stepMs`, measuring at every stop.
 * Returns `[{ degrees, range }]`: the angle from where it started and the distance in squares, or null.
 */
export async function sweep(robot, { stops, stepMs, signal, onStop = () => {}, wait = sleep } = {}) {
  const step = 360 / stops;
  const seen = [];
  for (let stop = 0; stop < stops; stop++) {
    signal?.throwIfAborted();
    await wait(SETTLE_MS, signal);
    const reading = { degrees: stop * step, range: await measure(robot, { signal, wait }) };
    seen.push(reading);
    onStop(reading);
    await robot.rotate(step, stepMs, signal); // the last spin brings it back to where it started
  }
  return seen;
}

/**
 * The eyes see in a wide cone, so one thing can show up in looks side by side, at almost
 * the same distance. Of each such group this keeps the look in the middle, or, when the group
 * is too long to be one thing, the looks that saw nearer than their neighbours. Looks that
 * saw nothing are dropped. A wall is not lost: seen at a slant it is clearly further away.
 */
export function distinct(seen) {
  const step = 360 / seen.length;
  // One small thing shows up in at most this many looks side by side.
  const beamLooks = 1 + Math.round((2 * BEAM_DEGREES) / step);
  const same = (a, b) => a.range !== null && b.range !== null && Math.abs(a.range - b.range) < SAME_THING * Math.max(a.range, b.range);
  // Start at a break, so that a group going past the end of the turn is not cut in two.
  const start = seen.findIndex((reading, i) => !same(reading, seen.at(i - 1)));
  if (start < 0) return seen;
  const groups = [];
  for (let i = 0; i < seen.length; i++) {
    const reading = seen[(start + i) % seen.length];
    if (i > 0 && same(reading, groups.at(-1).at(-1))) groups.at(-1).push(reading);
    else groups.push([reading]);
  }
  const nearerThanNeighbours = (group) => group.filter((reading, i) => !(group[i - 1]?.range < reading.range) && !(group[i + 1]?.range < reading.range));
  return groups
    .filter((group) => group[0].range !== null)
    .flatMap((group) => (group.length >= 3 && group.length <= beamLooks ? [group[Math.floor(group.length / 2)]] : nearerThanNeighbours(group)));
}

/**
 * Where on the mat a reading points, for a robot that started the turn at `pose`:
 * the `spot` the eyes touched and the `cell` of the thing they saw.
 */
export function locate(pose, { degrees, range }) {
  const radians = ((pose.heading + degrees) * Math.PI) / 180;
  const at = (distance) => ({ x: pose.x + Math.sin(radians) * distance, y: pose.y - Math.cos(radians) * distance });
  const inside = at(range + BOX_DEPTH);
  return { spot: at(range), cell: [Math.round(inside.x), Math.round(inside.y)] };
}

/**
 * Drives one step towards a wall and returns how far the robot really went, in squares.
 * Null when the wall is too close, or the eyes could not see it before or after.
 */
export async function measureStep(robot, { signal, wait = sleep } = {}) {
  const before = await measure(robot, { signal, wait });
  if (before === null || before < ROOM_FOR_A_STEP) return null;
  await robot.move(1, signal);
  await wait(SETTLE_MS, signal);
  const after = await measure(robot, { signal, wait });
  return after === null ? null : before - after;
}

/** True when two looks in the same direction agree: both saw nothing, or about the same distance. */
export function sameSight(a, b) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= SAME_SIGHT * Math.max(a, b);
}

/**
 * Counts how many spins of `stepMs` make a full turn of the real robot, which cannot measure
 * angles. The robot must face one thing that is close, with everything else clearly further
 * away: it spins until it loses the thing and finds it again, and the middle of the second
 * sighting is one full turn. It then spins on to the end of a second turn, to face the way
 * it started. Returns the number of spins, or null when it could not tell.
 */
export async function countSpins(robot, { stepMs, signal, wait = sleep } = {}) {
  const look = () => measure(robot, { signal, wait, readings: QUICK_READINGS });
  const spin = async () => {
    await robot.spinReal(stepMs, signal);
    await wait(SETTLE_MS, signal);
  };
  const first = await look();
  if (first === null || first > NEAR_LIMIT) return null;
  const near = (range) => range !== null && range < first * CLEARLY_FURTHER;
  let lost = false;
  let found = null;
  for (let spins = 1; spins <= MOST_SPINS; spins++) {
    await spin();
    const seen = near(await look());
    if (!lost) lost = !seen;
    else if (found === null && seen) found = spins;
    else if (found !== null && !seen) {
      const turn = Math.round((found + spins - 1) / 2);
      for (let more = 2 * turn - spins; more > 0; more--) await spin();
      return turn;
    }
  }
  return null;
}
