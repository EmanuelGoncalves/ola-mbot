import { load, save } from '../storage.js';

/**
 * The mBot has no wheel sensors, so a step and a turn are timed motor runs.
 * These times are shared by the real robot and the one on screen.
 */
export const DEFAULT_TUNING = Object.freeze({ speed: 150, stepMs: 600, quarterTurnMs: 420 });

export const TUNING_LIMITS = Object.freeze({
  stepMs: { min: 300, max: 1500, step: 20 },
  quarterTurnMs: { min: 200, max: 1200, step: 10 },
});

export function loadTuning() {
  return { ...DEFAULT_TUNING, ...load('tuning', {}) };
}

export function saveTuning(tuning) {
  save('tuning', { stepMs: tuning.stepMs, quarterTurnMs: tuning.quarterTurnMs });
}
