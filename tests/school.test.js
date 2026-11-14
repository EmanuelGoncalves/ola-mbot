import { MISSIONS } from '../js/missions.js';
import { BLOCKS, createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { Simulator, WORLD } from '../js/robot/simulator.js';
import { exercisesFor, exercisesOf, LEVELS, SUBJECTS, YEARS } from '../js/school.js';
import { equal, ok, test } from './harness.js';

const FAST = { speed: 150, stepMs: 1, quarterTurnMs: 1 };
const noWait = async () => {};
const EXERCISES = SUBJECTS.flatMap((subject) => YEARS.flatMap((year) => exercisesOf(subject, year)));

/** Builds blocks from a compact form: ['forward', 3] or ['repeat', 4, [...]]. */
function build(items) {
  return items.map(([type, value, body]) => {
    const block = createBlock(type, value);
    if (value !== undefined) equal(block.value, value, `"${type}" has no such choice:`);
    if (body) block.body = build(body);
    return block;
  });
}

/** Runs a program on the exercise's mat and says whether it solves the exercise. */
async function solves(exercise, items) {
  const program = new Program();
  program.replace(build(items));
  const robot = new Simulator({ tuning: FAST, beeper: { play() {} } });
  robot.setWorld(exercise.world);
  await runProgram(program.blocks, robot, { wait: noWait });
  return exercise.check(program.all(), robot);
}

test('school: every subject, year and level has several exercises', () => {
  for (const subject of SUBJECTS) {
    for (const year of YEARS) {
      for (const level of LEVELS) {
        ok(exercisesFor(subject, year, level).length >= 3, `${subject.id} ${year} ${level.id} has too few`);
      }
    }
  }
});

test('school: no two exercises or missions share an id', () => {
  const ids = [...MISSIONS, ...EXERCISES].map((mission) => mission.id);
  equal(new Set(ids).size, ids.length);
});

test('school: an exercise is the same object every time it is listed', () => {
  ok(exercisesOf(SUBJECTS[0], YEARS[0])[0] === exercisesOf(SUBJECTS[0], YEARS[0])[0]);
});

for (const exercise of EXERCISES) {
  test(`exercise "${exercise.id}": its solution solves it`, async () => {
    ok(await solves(exercise, exercise.solution));
  });

  test(`exercise "${exercise.id}": doing nothing does not solve it`, async () => {
    ok(!(await solves(exercise, [['wait', 1]])));
  });

  test(`exercise "${exercise.id}": its signs fit on the mat, away from the start`, () => {
    const signs = exercise.world.signs ?? [];
    for (const [x, y, text] of signs) {
      ok(x >= 0 && y >= 0 && x < WORLD.cols && y < WORLD.rows, `"${text}" is off the mat`);
      ok(x !== WORLD.start.x || y !== WORLD.start.y, `"${text}" is on the start`);
      ok([...text].length <= 8, `"${text}" is too long for a sign`);
      const beside = signs.find(([otherX, otherY]) => otherY === y && Math.abs(otherX - x) === 1);
      ok(!beside || [...text].length <= 3, `"${text}" is a word next to another sign`);
    }
    equal(new Set(signs.map(([x, y]) => `${x},${y}`)).size, signs.length, 'two signs share a square:');
    ok(exercise.goal && exercise.hint && exercise.title && exercise.icon, 'a text is missing');
    ok(exercise.solution.every(([type]) => BLOCKS[type]), 'the solution uses an unknown block');
  });
}

for (const exercise of EXERCISES.filter((item) => item.world.signs)) {
  test(`exercise "${exercise.id}": only one sign is the right answer`, () => {
    const robot = new Simulator({ tuning: FAST, beeper: { play() {} } });
    robot.setWorld(exercise.world);
    const right = exercise.world.signs.filter(([x, y]) => {
      robot.pose = { x, y, heading: 0 };
      return exercise.check([], robot);
    });
    equal(right.length, 1);
  });
}
