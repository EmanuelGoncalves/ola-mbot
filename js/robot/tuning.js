import { load, save } from '../storage.js';

/**
 * The mBot has no wheel sensors, so a step and a turn are timed motor runs.
 * These times are shared by the real robot and the one on screen.
 * `flipDrive` and `flipTurn` put right a real robot whose motors were plugged in the other way round.
 */
export const DEFAULT_TUNING = Object.freeze({ speed: 150, stepMs: 600, quarterTurnMs: 420, flipDrive: false, flipTurn: false });

export const TUNING_LIMITS = Object.freeze({
  stepMs: { min: 300, max: 1500, step: 20 },
  quarterTurnMs: { min: 200, max: 1200, step: 10 },
});

export function loadTuning() {
  return { ...DEFAULT_TUNING, ...load('tuning', {}) };
}

export function saveTuning(tuning) {
  const { stepMs, quarterTurnMs, flipDrive, flipTurn } = tuning;
  save('tuning', { stepMs, quarterTurnMs, flipDrive, flipTurn });
}
