import { sleep } from '../timing.js';

/** How many times the radar measures at each stop. */
const READINGS = 7;
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
/** Two looks the same way that differ by this part of the distance, or more, saw different things. */
const ALIKE_WITHIN = 0.3;
/** A turn is looked for between these many times the spins it should take… */
const SHORTEST_TURN = 0.6;
const LONGEST_TURN = 1.5;
/** …and it is found where at least this many looks repeat the first ones this well, on average. */
const REPEAT_LOOKS = 4;
const GOOD_REPEAT = 0.35;
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

/** How unlike two looks the same way are: 0 the same, 1 as different as can be. */
function unlike(a, b) {
  if (a === null || b === null) return a === b ? 0 : 1;
  return Math.min(1, Math.abs(a - b) / (ALIKE_WITHIN * Math.max(a, b)));
}

/**
 * How unlike two rows of looks are on average, the second starting `shift` places into the first.
 * Two looks that both saw nothing prove nothing and are left out; with fewer than `surePairs`
 * pairs left, the rows count as unlike.
 */
function unlikeAt(looks, others, shift, surePairs) {
  let [total, pairs] = [0, 0];
  for (const [i, other] of others.entries()) {
    const look = looks[i + shift];
    if (look === undefined) break;
    if (look === null && other === null) continue;
    total += unlike(look, other);
    pairs += 1;
  }
  return pairs >= surePairs ? total / pairs : 1;
}

/**
 * How many spins a full turn took, from looks taken one spin apart for more than a turn: the
 * turn is over where the looks start to repeat the first ones. Among numbers that fit equally
 * well, the nearest to `expected` wins. Returns null when the looks do not tell: nothing in
 * sight, the same all round, or no repeat near `expected`.
 */
export function spinsInATurn(looks, expected) {
  const seen = looks.filter((look) => look !== null);
  const allAlike = seen.length === looks.length && Math.max(...seen) - Math.min(...seen) < ALIKE_WITHIN * Math.max(...seen);
  if (seen.length === 0 || allAlike) return null;
  let best = null;
  for (let turn = Math.ceil(expected * SHORTEST_TURN); turn + REPEAT_LOOKS <= looks.length; turn++) {
    const error = unlikeAt(looks, looks.slice(0, looks.length - turn), turn, 2);
    const nearer = best !== null && Math.abs(error - best.error) < 0.02 && Math.abs(turn - expected) < Math.abs(best.turn - expected);
    if (best === null || error < best.error - 0.02 || nearer) best = { turn, error };
  }
  return best !== null && best.error <= GOOD_REPEAT ? best.turn : null;
}

/**
 * How many spins the robot is turned past the start of a full turn of `looks`, from a few
 * `fresh` looks taken one spin apart: negative when it is short of the start. Null when they
 * fit nowhere.
 */
export function spinsPast(looks, fresh) {
  const turn = looks.length;
  const round = [...looks, ...looks, ...looks];
  let best = null;
  for (let shift = -Math.floor(turn / 3); shift <= Math.floor(turn / 3); shift++) {
    const error = unlikeAt(round, fresh, turn + shift, 1);
    if (best === null || error < best.error - 0.02 || (Math.abs(error - best.error) < 0.02 && Math.abs(shift) < Math.abs(best.shift))) best = { shift, error };
  }
  return best !== null && best.error <= GOOD_REPEAT ? best.shift : null;
}

/**
 * Turns the real robot (see RobotHub: `range` and `spinReal`) in short spins of `stepMs` for
 * more than a full turn, looking at every stop, and works out from the looks how many spins the
 * turn took: the robot cannot measure angles, but it can tell when it sees the same things again.
 * `expected` is the number of spins a turn should take; turns of up to `longest` times that are
 * found. The robot is then spun back to where it started.
 *
 * Resolves with `{ turn, found, seen }`: the spins in a full turn (`expected` when the looks did
 * not tell, and then `found` is false) and the looks of that turn as `[{ degrees, range }]`.
 */
export async function sweepUntilRepeat(robot, { expected, longest = LONGEST_TURN, stepMs, signal, onStop = () => {}, wait = sleep } = {}) {
  const most = Math.round(expected * longest) + REPEAT_LOOKS;
  const looks = [];
  for (let spin = 0; spin < most; spin++) {
    signal?.throwIfAborted();
    if (spin > 0) await robot.spinReal(stepMs, signal);
    await wait(SETTLE_MS, signal);
    looks.push(await measure(robot, { signal, wait }));
    onStop(looks.length, most);
  }
  const found = spinsInATurn(looks, expected);
  const turn = found ?? expected;
  for (let back = most - 1 - turn; back !== 0; back -= Math.sign(back)) {
    await robot.spinReal(stepMs, signal, -Math.sign(back));
    await wait(SETTLE_MS, signal);
  }
  return { turn, found: found !== null, seen: looks.slice(0, turn).map((range, spin) => ({ degrees: (spin * 360) / turn, range })) };
}

/**
 * Measures what four quarter turns of the real robot really add up to, in degrees. `seen` is a
 * full turn of looks from `sweepUntilRepeat`, taken where the robot stands: after the four
 * quarter turns it looks again a few times, and where those looks fit in the full turn tells
 * how far past the start, or short of it, the robot ended. Null when they fit nowhere.
 */
export async function measureQuarters(robot, { seen, stepMs, signal, wait = sleep } = {}) {
  for (let quarter = 0; quarter < 4; quarter++) {
    await robot.turn(1, signal);
    await wait(SETTLE_MS, signal);
  }
  const fresh = [];
  for (let spin = 0; spin < REPEAT_LOOKS; spin++) {
    if (spin > 0) await robot.spinReal(stepMs, signal);
    await wait(SETTLE_MS, signal);
    fresh.push(await measure(robot, { signal, wait }));
  }
  for (let spin = 1; spin < REPEAT_LOOKS; spin++) await robot.spinReal(stepMs, signal, -1);
  const past = spinsPast(seen.map((look) => look.range), fresh);
  return past === null ? null : 360 + (past * 360) / seen.length;
}
