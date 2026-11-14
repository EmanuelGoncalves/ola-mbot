import { JINGLES, playJingle } from '../js/jingles.js';
import { NOTES } from '../js/robot/palette.js';
import { equal, ok, test } from './harness.js';

const noWait = async () => {};
const hzOf = (id) => NOTES.find((note) => note.id === id).hz;

for (const jingle of JINGLES) {
  test(`jingle "${jingle.id}": uses only the piano's notes`, () => {
    for (const [id, beats] of jingle.notes) {
      ok(NOTES.some((note) => note.id === id), `unknown note ${id}`);
      ok(beats > 0, `note ${id} has no length`);
    }
  });
}

test('jingle: plays its notes in order', async () => {
  const [jingle] = JINGLES;
  const tones = [];
  const seen = [];
  await playJingle(jingle, { playTone: (hz) => tones.push(hz) }, { wait: noWait, onNote: (id) => seen.push(id) });
  equal(seen, jingle.notes.map(([id]) => id));
  equal(tones, jingle.notes.map(([id]) => hzOf(id)));
});

test('jingle: stops when aborted', async () => {
  const controller = new AbortController();
  const tones = [];
  const robot = {
    playTone(hz) {
      tones.push(hz);
      controller.abort();
    },
  };
  let stopped = false;
  try {
    await playJingle(JINGLES[0], robot, { signal: controller.signal });
  } catch (error) {
    stopped = error.name === 'AbortError';
  }
  ok(stopped, 'expected an AbortError');
  equal(tones.length, 1);
});
