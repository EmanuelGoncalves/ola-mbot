import { JINGLES, playJingle } from '../js/jingles.js';
import { BLOCKS, createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
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

test('jingle: every tune has its own id and name, and is a choice of the music block', () => {
  equal(new Set(JINGLES.map((jingle) => jingle.id)).size, JINGLES.length);
  equal(new Set(JINGLES.map((jingle) => jingle.name)).size, JINGLES.length);
  equal(BLOCKS.music.options.map((option) => option.value), JINGLES.map((jingle) => jingle.id));
});

test('jingle: the music block plays the whole tune before the next block', async () => {
  const tune = JINGLES.find((jingle) => jingle.id === 'victory');
  const heard = [];
  const robot = { playTone: (hz) => heard.push(hz), setLights: () => heard.push('light') };
  await runProgram([createBlock('music', 'victory'), createBlock('lightsOff')], robot, { wait: noWait });
  equal(heard, [...tune.notes.map(([id]) => hzOf(id)), 'light']);
});
