import { load, save } from '../storage.js';

/**
 * The mBot has no wheel sensors, so a step and a turn are timed motor runs.
 * These times are shared by the real robot and the one on screen.
 * `cellCm` is the size of one square of the mat on the real floor.
 * `scanStepMs` is the short spin between two looks of the radar, and `scanStops` how many of them make a full turn.
 * `flipDrive` and `flipTurn` put right a real robot whose motors were plugged in the other way round.
 * The times are what a real mBot took when they were measured with its own eyes; batteries and
 * the floor change them, which is what the tuning in "Ligar ao robô" is for.
 */
export const DEFAULT_TUNING = Object.freeze({
  speed: 150,
  stepMs: 1260,
  quarterTurnMs: 460,
  cellCm: 20,
  scanStepMs: 190,
  scanStops: 12,
  flipDrive: false,
  flipTurn: false,
});

export const TUNING_LIMITS = Object.freeze({
  stepMs: { min: 300, max: 1500, step: 20 },
  quarterTurnMs: { min: 200, max: 1200, step: 10 },
  cellCm: { min: 15, max: 40, step: 1 },
  scanStepMs: { min: 60, max: 400, step: 5 },
  scanStops: { min: 6, max: 40, step: 1 },
});

/** The time a step loses getting going, whatever its length. */
const STEP_LOST_MS = 20;

/**
 * The square the robot moves on: `cm` wide and crossed in `ms`. It is the mat's square, or the
 * square of a printed map while one is open: `mapCm`, which is set by whoever opens the map and
 * is not saved. Its time follows from the time tuned for the mat's square.
 */
export function squareOf({ stepMs, cellCm, mapCm }) {
  if (!mapCm || !cellCm) return { cm: cellCm, ms: stepMs };
  return { cm: mapCm, ms: Math.min(stepMs, STEP_LOST_MS) + (Math.max(0, stepMs - STEP_LOST_MS) * mapCm) / cellCm };
}

/** How long the wheels run to cross `squares` of the current square in one go: the time lost getting going counts once, however far. */
export function driveTime(tuning, squares) {
  const { ms } = squareOf(tuning);
  const lost = Math.min(ms, STEP_LOST_MS);
  return squares > 0 ? lost + squares * (ms - lost) : 0;
}

/** The step time that makes the robot go `wanted` squares, when a move meant to go that far went `went`. */
export function correctedStepTime(stepMs, wanted, went) {
  return STEP_LOST_MS + ((stepMs - STEP_LOST_MS) * wanted) / went;
}

export function loadTuning() {
  return { ...DEFAULT_TUNING, ...load('tuning', {}) };
}

export function saveTuning(tuning) {
  const { speed, mapCm, ...saved } = tuning;
  save('tuning', saved);
}
