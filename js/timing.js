const FRAME_FALLBACK_MS = 60;

/** Waits `ms`; rejects with the signal's reason if aborted first. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/** Calls `onFrame(progress)` with progress from 0 to 1 over `durationMs`. */
export async function animate(durationMs, signal, onFrame) {
  const start = performance.now();
  for (;;) {
    const progress = durationMs > 0 ? Math.min(1, (performance.now() - start) / durationMs) : 1;
    onFrame(progress);
    if (progress >= 1) return;
    await nextFrame(signal);
  }
}

/** Resolves on the next animation frame, or soon after if the page is in the background. */
export function nextFrame(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(finish, FRAME_FALLBACK_MS);
    const frame = requestAnimationFrame(finish);
    function finish() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (signal?.aborted) reject(signal.reason);
      else resolve();
    }
  });
}

export function isAbort(error) {
  return error?.name === 'AbortError';
}
