import { sleep } from '../timing.js';

/** What the two line sensors under the robot can see. */
export const Line = Object.freeze({ BOTH: 0, LEFT: 1, RIGHT: 2, NONE: 3 });

/** Pause between two looks at the line. */
const LOOK_EVERY_MS = 40;
/** With the line under one sensor only, the wheel on that side slows down to this part of the speed. */
const INNER_WHEEL = 0.25;
/** Off the line, the robot turns on the spot, or creeps back, at this part of the speed. */
const SEARCH = 0.6;
/** How far the memory of which side the line went can lean, either way. */
const MOST_LEAN = 10;
/** After this long off the line, or this many looks without an answer, the robot gives up. */
const LOST_AFTER_MS = 3000;
const MOST_SILENT_LOOKS = 5;

/**
 * Wheel speeds `[left, right]`, as parts of the cruising speed, for what the sensors see.
 * `lean` remembers which side the line was last seen on: negative for the left.
 * As in the mBot's own line-following mode, a robot that has lost the line turns towards
 * the side it last saw it on, and backs up if it was squarely on it.
 */
export function wheelsFor(seen, lean) {
  if (seen === Line.BOTH) return [1, 1];
  if (seen === Line.LEFT) return [INNER_WHEEL, 1];
  if (seen === Line.RIGHT) return [1, INNER_WHEEL];
  if (lean < 0) return [-SEARCH, SEARCH];
  if (lean > 0) return [SEARCH, -SEARCH];
  return [-SEARCH, -SEARCH];
}

/** The memory of where the line is, after one more look. */
export function leanAfter(seen, lean) {
  if (seen === Line.BOTH) return 0;
  if (seen === Line.LEFT) return Math.max(-MOST_LEAN, lean - 1);
  if (seen === Line.RIGHT) return Math.min(MOST_LEAN, lean + 1);
  return lean;
}

/**
 * Follows a black line with `robot` (see RobotHub: `readLine` and `drive`) at `speed`, until
 * `signal` is aborted. `onSeen(seen)` is called when what the sensors see changes.
 * Resolves with 'lost' when the line is gone for good, or 'silent' when the robot stops answering.
 */
export async function followLine(robot, { speed, signal, onSeen = () => {}, wait = sleep, now = () => performance.now() } = {}) {
  let lean = 0;
  let last = null;
  let lostAt = null;
  let silent = 0;
  for (;;) {
    signal?.throwIfAborted();
    const seen = await robot.readLine();
    if (seen === null) {
      if (++silent >= MOST_SILENT_LOOKS) return 'silent';
    } else {
      silent = 0;
      lostAt = seen !== Line.NONE ? null : (lostAt ?? now());
      if (lostAt !== null && now() - lostAt > LOST_AFTER_MS) return 'lost';
      lean = leanAfter(seen, lean);
      if (seen !== last) {
        const [left, right] = wheelsFor(seen, lean);
        await robot.drive(left * speed, right * speed);
        onSeen(seen);
        last = seen;
      }
    }
    await wait(LOOK_EVERY_MS, signal);
  }
}
