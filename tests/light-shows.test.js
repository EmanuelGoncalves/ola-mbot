import { MY_SHOW_ID, MyShow, OFF, playShow, showById, SHOWS } from '../js/light-shows.js';
import { BLOCKS, createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { colorById, COLORS } from '../js/robot/palette.js';
import { equal, ok, test } from './harness.js';

const noWait = async () => {};

/** A robot that writes down the colours its lights are set to; null is off. */
function lamp() {
  const robot = { colors: [], setLights: async (color) => robot.colors.push(color?.id ?? null) };
  return robot;
}

/** A show of the child's own that keeps itself in memory. */
function memoryShow(saved = {}) {
  return new MyShow({ load: (key, fallback) => saved[key] ?? fallback, save: (key, value) => (saved[key] = value) });
}

for (const show of SHOWS) {
  test(`light show "${show.id}": uses only the robot's colours`, () => {
    ok(show.steps.length >= 3, 'too short to be a show');
    for (const [color, beats] of show.steps) {
      ok(color === OFF || COLORS.some((item) => item.id === color), `unknown colour ${color}`);
      ok(beats > 0, `colour ${color} has no length`);
    }
  });
}

test('light show: every show has its own id and name, and is a choice of the block', () => {
  equal(new Set(SHOWS.map((show) => show.id)).size, SHOWS.length);
  equal(new Set(SHOWS.map((show) => show.name)).size, SHOWS.length);
  equal(BLOCKS.lightShow.options.map((option) => option.value), [...SHOWS.map((show) => show.id), MY_SHOW_ID]);
});

test('light show: plays its colours in order and ends with the lights off', async () => {
  const robot = lamp();
  const seen = [];
  await playShow({ steps: [['red', 1], [OFF, 1], ['blue', 2]] }, robot, { wait: noWait, onStep: (index) => seen.push(index) });
  equal(robot.colors, ['red', null, 'blue', null]);
  equal(seen, [0, 1, 2]);
});

test('light show: stopped half-way, the lights still go off', async () => {
  const stop = new AbortController();
  const robot = lamp();
  let stopped = false;
  try {
    await playShow(SHOWS[0], robot, { signal: stop.signal, wait: async () => stop.abort() });
  } catch (error) {
    stopped = error.name === 'AbortError';
  }
  ok(stopped, 'expected an AbortError');
  equal(robot.colors, [SHOWS[0].steps[0][0], null]);
});

test('light show: the block plays the whole show before the next block', async () => {
  const robot = { ...lamp(), playTone: () => robot.colors.push('note') };
  await runProgram([createBlock('lightShow', 'police'), createBlock('note')], robot, { wait: noWait });
  equal(robot.colors, [...showById('police').steps.map(([color]) => color), null, 'note']);
});

test('my show: colours are added at the end, taken out by place, and kept', () => {
  const saved = {};
  const show = memoryShow(saved);
  let changes = 0;
  show.addEventListener('change', () => (changes += 1));
  show.clear();
  for (const color of ['red', OFF, 'blue', 'green']) show.add(color);
  show.removeAt(2);
  equal(show.colors, ['red', OFF, 'green']);
  equal(changes, 6);
  equal(memoryShow(saved).colors, ['red', OFF, 'green'], 'after opening the app again:');
  equal(show.show.steps, [['red', 1], [OFF, 1], ['green', 1]]);
});

test('my show: it starts with a few colours and has room for sixteen', () => {
  const show = memoryShow();
  ok(show.colors.length > 0, 'a new show starts with a few colours');
  show.clear();
  for (let i = 0; i < 20; i++) show.add('pink');
  equal(show.colors.length, 16);
  ok(show.full);
  ok(colorById(show.colors[0]), 'a colour of the robot');
});

test('my show: saved colours this app does not know are left out', () => {
  equal(memoryShow({ 'my-show': { colors: ['red', 'beige', OFF], speed: 'fast' } }).colors, ['red', OFF]);
  ok(memoryShow({ 'my-show': { colors: ['red'], speed: 'fast' } }).speed.beatMs < memoryShow().speed.beatMs, 'the saved speed is kept');
});
