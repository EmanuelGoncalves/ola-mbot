const tests = [];

/** Registers a test; `run` may be async and fails by throwing. */
export function test(name, run) {
  tests.push({ name, run });
}

/** Compares two values by their JSON form, which is enough for plain data. */
export function equal(actual, expected, message = '') {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`.trim());
}

export function ok(value, message = 'expected a truthy value') {
  if (!value) throw new Error(message);
}

/** Runs every registered test and returns `{ name, error }` for each. */
export async function runAll() {
  const results = [];
  for (const { name, run } of tests) {
    try {
      await run();
      results.push({ name, error: null });
    } catch (error) {
      results.push({ name, error: error.message });
    }
  }
  return results;
}
