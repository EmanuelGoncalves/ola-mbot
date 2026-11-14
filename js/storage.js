const PREFIX = 'ola-mbot:';

/** Reads a saved value; storage can be missing or blocked, so every call is guarded. */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return (raw === null ? null : JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Nothing to do: the app works without saved state.
  }
}
