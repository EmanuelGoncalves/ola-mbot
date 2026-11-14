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

export function loadTuning() {
  return { ...DEFAULT_TUNING, ...load('tuning', {}) };
}

export function saveTuning(tuning) {
  const { speed, ...saved } = tuning;
  save('tuning', saved);
}
