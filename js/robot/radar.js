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
/** …by going on this many looks past the longest turn; the looks must repeat this well, on average. */
const REPEAT_LOOKS = 4;
const GOOD_REPEAT = 0.35;
/** Fewer pairs of looks than this do not show that the looks repeat: a few can be alike by chance. */
const SURE_REPEATS = 6;
/** To tell where it is in a turn it has seen before, the robot looks this many times. */
const FRESH_LOOKS = 8;
/** Two fits this close are as good as each other. */
const AS_GOOD = 0.02;
/**
 * The time a spin loses getting going. On a real mBot, spins of 120, 170 and 250 ms turned 17°,
 * 26° and 41°: a straight line that meets zero at 26 ms.
 */
const SPIN_LOST_MS = 26;
/** The wall must be at least this far, in squares, to test a step towards it. */
const ROOM_FOR_A_STEP = 2;
/** The step there and the step back are taken to be the same step when they differ by less than this part. */
const STEPS_AGREE = 0.3;

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
 * Drives one step towards a wall and one step back, and returns how far a step really goes, in
 * squares. Null when the wall is too close, the eyes could not see it, or the way there and the
 * way back do not agree: then the eyes saw something else on the way.
 */
export async function measureStep(robot, { signal, wait = sleep } = {}) {
  const before = await measure(robot, { signal, wait });
  if (before === null || before < ROOM_FOR_A_STEP) return null;
  await robot.move(1, signal);
  await wait(SETTLE_MS, signal);
  const near = await measure(robot, { signal, wait });
  await robot.move(-1, signal);
  await wait(SETTLE_MS, signal);
  const after = await measure(robot, { signal, wait });
  if (near === null || after === null) return null;
  const [there, back] = [before - near, after - near];
  const agree = there > 0 && back > 0 && Math.abs(there - back) <= STEPS_AGREE * Math.max(there, back);
  return agree ? (there + back) / 2 : null;
}

/** How unlike two looks the same way are: 0 the same, 1 as different as can be. */
function unlike(a, b) {
  if (a === null || b === null) return a === b ? 0 : 1;
  return Math.min(1, Math.abs(a - b) / (ALIKE_WITHIN * Math.max(a, b)));
}

/**
 * How unlike `look` is from what was seen `at` a place in `looks`, which may fall between two
 * of them: the eyes see a wide cone, so either neighbour may show the same thing. Null when
 * all of them saw nothing, which proves nothing.
 */
function unlikeAt(look, looks, at) {
  const before = Math.floor(at);
  const part = at - before;
  const near = (part < 0.25 ? [looks[before]] : part > 0.75 ? [looks[before + 1]] : [looks[before], looks[before + 1]]).filter((other) => other !== undefined);
  if (near.length === 0 || (look === null && near.every((other) => other === null))) return null;
  return Math.min(...near.map((other) => unlike(look, other)));
}

/** The average of the `errors` that are not null, or 1 when fewer than `sure` are left. */
function average(errors, sure) {
  const told = errors.filter((error) => error !== null);
  return told.length >= sure ? told.reduce((sum, error) => sum + error, 0) / told.length : 1;
}

/** How badly `looks` repeat every `turn` spins, in every later turn they hold: 0 not at all, 1 completely. */
function unlikeEvery(looks, turn) {
  const errors = [];
  for (let shift = turn; shift < looks.length; shift += turn) {
    for (let i = 0; i + shift < looks.length; i++) errors.push(unlikeAt(looks[i], looks, i + shift));
  }
  return average(errors, SURE_REPEATS);
}

/** Of `fits` (`{ at, error }`, side by side), the middle of the run about as good as the one at `index`, around it. */
function middleOfRun(fits, index) {
  const good = (fit) => fit !== undefined && fit.error <= fits[index].error + AS_GOOD;
  let [first, last] = [index, index];
  while (good(fits[first - 1])) first--;
  while (good(fits[last + 1])) last++;
  return (fits[first].at + fits[last].at) / 2;
}

/** The best of `fits`: the first one, of several about as good. */
function bestOf(fits) {
  const least = Math.min(...fits.map((fit) => fit.error));
  return fits.find((fit) => fit.error <= least + AS_GOOD);
}

/**
 * How many spins a full turn took, from looks taken one spin apart for more than a turn: the
 * looks repeat themselves every turn. The answer need not be a whole number. Two or three turns
 * repeat as well as one, so a half or a third of the best fit wins if it fits too. Returns null
 * when the looks do not tell: nothing in sight, the same all round, or no repeat from
 * `SHORTEST_TURN` times `expected` on.
 */
export function spinsInATurn(looks, expected) {
  const seen = looks.filter((look) => look !== null);
  const allAlike = seen.length === looks.length && Math.max(...seen) - Math.min(...seen) < ALIKE_WITHIN * Math.max(...seen);
  if (seen.length === 0 || allAlike) return null;
  const fits = [];
  for (let tenths = Math.ceil(expected * SHORTEST_TURN * 10); tenths / 10 + REPEAT_LOOKS <= looks.length; tenths++) {
    fits.push({ at: tenths / 10, error: unlikeEvery(looks, tenths / 10) });
  }
  let best = bestOf(fits);
  if (!(best?.error <= GOOD_REPEAT)) return null;
  for (const part of [2, 3, 2]) {
    const shorter = bestOf(fits.filter((fit) => Math.abs(fit.at - best.at / part) <= 0.5));
    if (shorter?.error <= GOOD_REPEAT) best = shorter;
  }
  return middleOfRun(fits, fits.indexOf(best));
}

/**
 * Where the robot is in `looks`, a row of looks one spin apart that repeats every `turn` spins,
 * from a few `fresh` looks taken the same way: how many spins past the start of the row the
 * first of them was taken, from 0 up to `turn`. Null when they fit nowhere, or in two places.
 */
export function spinsPast(looks, turn, fresh) {
  const fits = [];
  for (let tenths = 0; tenths < turn * 10; tenths++) {
    const errors = fresh.map((look, i) => unlikeAt(look, looks, (tenths / 10 + i) % turn));
    fits.push({ at: tenths / 10, error: average(errors, 1) });
  }
  const best = bestOf(fits);
  if (!(best.error <= GOOD_REPEAT)) return null;
  // The row is a circle: start it where the fit is worst, so that no run of good fits is cut in two.
  const worst = fits.indexOf(fits.reduce((a, b) => (b.error > a.error ? b : a)));
  const round = [...fits.slice(worst), ...fits.slice(0, worst).map((fit) => ({ ...fit, at: fit.at + turn }))];
  const good = round.filter((fit) => fit.error <= best.error + AS_GOOD);
  const oneRun = good.at(-1).at - good[0].at < turn / 4;
  return oneRun ? ((good[0].at + good.at(-1).at) / 2) % turn : null;
}

/**
 * Looks around a little, in spins of `stepMs`, and tells where the real robot is in `looks`
 * (see `spinsPast`) once it has done so: the looking itself leaves it a few spins further on.
 * Null when what it sees fits nowhere.
 */
export async function whereInTurn(robot, { looks, turn, stepMs, signal, wait = sleep } = {}) {
  const fresh = [];
  for (let spin = 0; spin < FRESH_LOOKS; spin++) {
    if (spin > 0) await robot.spinReal(stepMs, signal);
    await wait(SETTLE_MS, signal);
    fresh.push(await measure(robot, { signal, wait }));
  }
  const first = spinsPast(looks, turn, fresh);
  return first === null ? null : (first + FRESH_LOOKS - 1) % turn;
}

/**
 * Turns the real robot (see RobotHub: `range` and `spinReal`) in short spins of `stepMs` for
 * more than a full turn, looking at every stop, and works out from the looks how many spins the
 * turn took: the robot cannot measure angles, but it can tell when it sees the same things again.
 * `expected` is the number of spins a turn should take; turns of up to `longest` times that are
 * found. The robot is then spun to where it started, the shorter way round.
 *
 * Resolves with `{ turn, found, seen, looks }`: the spins in a full turn, which need not be a
 * whole number (`expected` when the looks did not tell, and then `found` is false), the looks
 * of the first turn as `[{ degrees, range }]`, and all the looks.
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
  const past = (most - 1) % turn;
  const back = Math.round(past > turn / 2 ? past - turn : past);
  for (let spin = 0; spin < Math.abs(back); spin++) {
    await robot.spinReal(stepMs, signal, -Math.sign(back));
    await wait(SETTLE_MS, signal);
  }
  const seen = looks.slice(0, Math.ceil(turn)).map((range, spin) => ({ degrees: (spin * 360) / turn, range }));
  return { turn, found: found !== null, seen, looks };
}

/**
 * Measures what four quarter turns of the real robot really add up to. `looks`, `turn` and
 * `stepMs` come from `sweepUntilRepeat`, done where the robot stands, and `from` is where it is
 * among those looks (see `whereInTurn`). Resolves with `{ degrees, at }`, where it is afterwards,
 * or null when what it then sees fits nowhere.
 */
export async function measureQuarters(robot, { looks, turn, stepMs, from, signal, wait = sleep } = {}) {
  for (let quarter = 0; quarter < 4; quarter++) {
    await robot.turn(1, signal);
    await wait(SETTLE_MS, signal);
  }
  const at = await whereInTurn(robot, { looks, turn, stepMs, signal, wait });
  if (at === null) return null;
  // It looked on the way: the first look was taken where the quarter turns ended.
  const ended = at - (FRESH_LOOKS - 1);
  const over = ((((ended - from) % turn) + turn * 1.5) % turn) - turn / 2; // within half a turn either way
  return { degrees: 360 + (over * 360) / turn, at };
}

/**
 * How long a spin of `degrees` takes a robot whose spins of `stepMs` make a full turn in `turn`
 * spins: every spin loses a little time getting going, whatever its length.
 */
export function spinTime({ stepMs, turn }, degrees) {
  const perMs = 360 / turn / (stepMs - SPIN_LOST_MS);
  return degrees / perMs + SPIN_LOST_MS;
}

/** How many spins of `otherMs` make the full turn that takes `turn` spins of `stepMs`. */
export function spinsOf({ stepMs, turn }, otherMs) {
  return (turn * (stepMs - SPIN_LOST_MS)) / (otherMs - SPIN_LOST_MS);
}

/** A spin time `ms` that turned the robot `turned` degrees, corrected to turn it `wanted` degrees. */
export function correctedSpinTime(ms, turned, wanted) {
  return ((ms - SPIN_LOST_MS) * wanted) / turned + SPIN_LOST_MS;
}
