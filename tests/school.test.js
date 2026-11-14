import { MissionBoard, MISSIONS } from '../js/missions.js';
import { BLOCKS, createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { Simulator, WORLD } from '../js/robot/simulator.js';
import { exercisesFor, exercisesOf, LEVELS, SUBJECTS, YEARS } from '../js/school.js';
import { equal, ok, test } from './harness.js';

/** With no time to spend, a move ends at once. */
const INSTANT = { speed: 150, stepMs: 0, quarterTurnMs: 0 };
const noWait = async () => {};
const EXERCISES = SUBJECTS.flatMap((subject) => YEARS.flatMap((year) => exercisesOf(subject, year)));
const SEEDS = 40;

/** A random source that gives the same numbers for the same seed. */
function seeded(seed) {
  let state = (seed + 1) * 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rounds of an exercise to test: itself, or many draws of one with new numbers every round. */
function roundsOf(exercise) {
  if (!exercise.make) return [exercise];
  return Array.from({ length: SEEDS }, (_, seed) => ({ ...exercise, ...exercise.make(seeded(seed)) }));
}

/** Builds blocks from a compact form: ['forward', 3] or ['repeat', 4, [...]]. */
function build(items) {
  return items.map(([type, value, body]) => {
    const block = createBlock(type, value);
    if (value !== undefined) equal(block.value, value, `"${type}" has no such choice:`);
    if (body) block.body = build(body);
    return block;
  });
}

function matOf(round) {
  const robot = new Simulator({ tuning: INSTANT, beeper: { play() {} } });
  robot.setWorld(round.world);
  return robot;
}

/** Runs a program on the round's mat and says whether it solves it. */
async function solves(round, items) {
  const program = new Program();
  program.replace(build(items));
  const robot = matOf(round);
  await runProgram(program.blocks, robot, { wait: noWait });
  return round.check(program.all(), robot);
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

test('school: some exercises draw new numbers, and their rounds differ', () => {
  const generated = EXERCISES.filter((exercise) => exercise.make);
  ok(generated.length >= 10, `only ${generated.length} exercises draw numbers`);
  for (const exercise of generated) {
    equal(exercise.rounds, 3, `${exercise.id} rounds:`);
    ok(new Set(roundsOf(exercise).map((round) => round.goal)).size >= 4, `${exercise.id} hardly changes`);
  }
});

for (const exercise of EXERCISES) {
  const rounds = roundsOf(exercise);

  test(`exercise "${exercise.id}": its solution solves it`, async () => {
    for (const round of rounds) ok(await solves(round, round.solution), `not solved: ${round.goal}`);
  });

  test(`exercise "${exercise.id}": doing nothing does not solve it`, async () => {
    for (const round of rounds) ok(!(await solves(round, [['wait', 1]])), `solved by nothing: ${round.goal}`);
  });

  test(`exercise "${exercise.id}": its signs fit on the mat, away from the start, and only one is right`, () => {
    for (const round of rounds) {
      const signs = round.world.signs ?? [];
      for (const [x, y, text] of signs) {
        ok(x >= 0 && y >= 0 && x < WORLD.cols && y < WORLD.rows, `"${text}" is off the mat: ${round.goal}`);
        ok(x !== WORLD.start.x || y !== WORLD.start.y, `"${text}" is on the start: ${round.goal}`);
        ok([...text].length <= 8, `"${text}" is too long for a sign`);
        const beside = signs.find(([otherX, otherY]) => otherY === y && Math.abs(otherX - x) === 1);
        ok(!beside || [...text].length <= 3, `"${text}" is a word next to another sign`);
      }
      equal(new Set(signs.map(([x, y]) => `${x},${y}`)).size, signs.length, `two signs share a square: ${round.goal}`);
      equal(new Set(signs.map(([, , text]) => text)).size, signs.length, `two signs say the same: ${round.goal}`);
      ok(round.goal && round.hint && round.title && round.icon, 'a text is missing');
      ok(!/undefined|NaN/.test(round.goal + round.hint), `a number is missing: ${round.goal} ${round.hint}`);
      ok(round.solution.every(([type]) => BLOCKS[type]), 'the solution uses an unknown block');
      if (signs.length === 0) continue;
      const robot = matOf(round);
      const right = signs.filter(([x, y]) => {
        robot.pose = { x, y, heading: 0 };
        return round.check([], robot);
      });
      equal(right.length, 1, `right signs: ${round.goal}`);
    }
  });
}

const byId = (id) => EXERCISES.find((exercise) => exercise.id === id);
const firstRound = (id) => roundsOf(byId(id))[0];

test('school: bumping into the edge of the mat does not turn a wrong count into a right one', async () => {
  ok(!(await solves(firstRound('mat-dezenas'), [['forward', 5], ['forward', 2]])), 'seven steps passed');
  ok(!(await solves(byId('pt-parque'), [['forward', 5], ['lights', 'red']])), 'five laps passed for four');
});

test('school: the rectangle may stand or lie down, but going back and forth is not one', async () => {
  const lyingDown = [['repeat', 2, [['forward', 2], ['turnRight', 1], ['forward', 3], ['turnRight', 1]]]];
  ok(await solves(byId('mat-retangulo'), lyingDown), 'a rectangle lying down was refused');
  ok(!(await solves(byId('mat-retangulo'), [['forward', 3], ['backward', 3], ['forward', 2], ['backward', 2]])), 'back and forth passed');
});

test('school: the party note needs the wait and the yellow light inside the repeat', async () => {
  const withoutWait = [['repeat', 3, [['lights', 'yellow'], ['lightsOff']]], ['note', 'do'], ['note', 'mi']];
  const blue = [['repeat', 3, [['lights', 'blue'], ['wait', 1], ['lightsOff']]], ['lights', 'yellow'], ['note', 'do'], ['note', 'mi']];
  ok(!(await solves(byId('pt-recado'), withoutWait)), 'no wait passed');
  ok(!(await solves(byId('pt-recado'), blue)), 'a blue blink passed');
});

/** A board that keeps its stars in memory, with numbers that repeat for the same seed. */
function board(saved = {}) {
  const store = { load: (key, fallback) => saved[key] ?? fallback, save: (key, value) => (saved[key] = value) };
  return new MissionBoard({ random: seeded(7), store });
}

test('board: a mission earns its star at the first right answer', () => {
  const stars = board();
  stars.start(MISSIONS[0]);
  ok(stars.active === MISSIONS[0]);
  ok(stars.award(stars.active));
  ok(stars.hasStar(MISSIONS[0]));
});

test('board: an exercise with new numbers needs three different rounds for its star', () => {
  const stars = board();
  const sums = byId('mat-soma');
  stars.start(sums);
  const first = stars.active.goal;
  ok(!stars.award(stars.active), 'a star after one round');
  ok(!stars.award(stars.active), 'the same round counted twice');
  equal(stars.roundsSolved(sums), 1);
  ok(stars.roundSolved);
  stars.nextRound();
  ok(stars.active.goal !== first, 'the next round has the same numbers');
  ok(!stars.roundSolved);
  ok(!stars.award(stars.active), 'a star after two rounds');
  stars.nextRound();
  ok(stars.award(stars.active), 'no star after three rounds');
  equal(stars.roundsSolved(sums), 3);
  ok(stars.hasStar(sums));
});

test('board: the rounds got right are kept, and an old star stays a star', () => {
  const saved = { stars: ['mat-dobro'] };
  const before = board(saved);
  before.start(byId('mat-soma'));
  before.award(before.active);
  const after = board(saved);
  equal(after.roundsSolved(byId('mat-soma')), 1);
  equal(after.roundsSolved(byId('mat-dobro')), 3);
  after.start(byId('mat-dobro'));
  ok(after.award(after.active));
});

test('board: the next round never asks the same question again', () => {
  const stars = board();
  const goals = ['2 + 2?', '2 + 2?', '2 + 2?', '3 + 1?'];
  const exercise = { id: 'test-repeat', rounds: 3, make: () => ({ goal: goals.shift() ?? 'another?' }) };
  stars.start(exercise);
  equal(stars.active.goal, '2 + 2?');
  stars.nextRound();
  equal(stars.active.goal, '3 + 1?');
});

test('board: stars saved as nothing at all do not break the board', () => {
  const stars = new MissionBoard({ store: { load: (key, fallback) => fallback, save: () => {} } });
  equal(stars.roundsSolved(byId('mat-soma')), 0);
});
