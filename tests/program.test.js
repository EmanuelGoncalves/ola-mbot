import { createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { equal, ok, test } from './harness.js';

const types = (blocks) => blocks.map((block) => (block.body ? [block.type, types(block.body)] : block.type));

function sample() {
  const program = new Program();
  const [forward, repeat, note, lights] = ['forward', 'repeat', 'note', 'lights'].map((type) => createBlock(type));
  program.insert(forward);
  program.insert(repeat);
  program.insert(note, { parentId: repeat.id });
  program.insert(lights);
  return { program, forward, repeat, note, lights };
}

/** A robot that only writes down what it was asked to do. */
function fakeRobot({ obstacle = false } = {}) {
  const log = [];
  const record = (name) => (...args) => log.push([name, ...args.filter((arg) => typeof arg === 'number')]);
  return {
    log,
    move: record('move'),
    turn: record('turn'),
    moveUntilObstacle: record('moveUntilObstacle'),
    setLights: (color) => log.push(['lights', color?.id ?? null]),
    playTone: record('tone'),
    obstacleAhead: async () => obstacle,
  };
}

const noWait = async () => {};

test('program: blocks are inserted where asked', () => {
  const { program } = sample();
  equal(types(program.blocks), ['forward', ['repeat', ['note']], 'lights']);
});

test('program: moving down enters the container below', () => {
  const { program, forward } = sample();
  program.moveDown(forward.id);
  equal(types(program.blocks), [['repeat', ['forward', 'note']], 'lights']);
});

test('program: moving up from the top of a container leaves it', () => {
  const { program, note } = sample();
  program.moveUp(note.id);
  equal(types(program.blocks), ['forward', 'note', ['repeat', []], 'lights']);
});

test('program: moving up enters the container above', () => {
  const { program, lights } = sample();
  program.moveUp(lights.id);
  equal(types(program.blocks), ['forward', ['repeat', ['note', 'lights']]]);
});

test('program: removing a container removes its contents', () => {
  const { program, repeat } = sample();
  program.remove(repeat.id);
  equal(types(program.blocks), ['forward', 'lights']);
});

test('program: a block is duplicated right after itself, with its choice', () => {
  const { program, forward } = sample();
  program.setValue(forward.id, 3);
  const copy = program.duplicate(forward.id);
  equal(types(program.blocks), ['forward', 'forward', ['repeat', ['note']], 'lights']);
  equal(copy.value, 3);
  ok(copy.id !== forward.id, 'the copy has the same id');
});

test('program: a container is duplicated with a copy of everything inside', () => {
  const { program, repeat, note } = sample();
  const copy = program.duplicate(repeat.id);
  equal(types(program.blocks), ['forward', ['repeat', ['note']], ['repeat', ['note']], 'lights']);
  program.setValue(copy.body[0].id, 'sol');
  equal(note.value, 'do', 'changing the copy changed the original:');
});

test('program: a block inside a container is duplicated inside it', () => {
  const { program, note } = sample();
  program.duplicate(note.id);
  equal(types(program.blocks), ['forward', ['repeat', ['note', 'note']], 'lights']);
});

test('program: survives saving and loading', () => {
  const { program, forward } = sample();
  program.setValue(forward.id, 3);
  const revived = Program.revive(JSON.parse(JSON.stringify(program.serialize())));
  equal(types(revived), types(program.blocks));
  equal(revived[0].value, 3);
});

test('program: loading ignores unknown blocks and bad choices', () => {
  const revived = Program.revive([{ type: 'teleport' }, { type: 'forward', value: 99 }]);
  equal(types(revived), ['forward']);
  equal(revived[0].value, 1);
});

test('interpreter: runs blocks in order with their choices', async () => {
  const { program, forward } = sample();
  program.setValue(forward.id, 2);
  const robot = fakeRobot();
  await runProgram(program.blocks, robot, { wait: noWait });
  equal(robot.log.map(([name]) => name), ['move', 'tone', 'tone', 'lights']);
  equal(robot.log[0], ['move', 2]);
  equal(robot.log.at(-1), ['lights', 'red']);
});

test('interpreter: backwards and left are negative', async () => {
  const robot = fakeRobot();
  await runProgram([createBlock('backward'), createBlock('turnLeft')], robot, { wait: noWait });
  equal(robot.log, [['move', -1], ['turn', -1]]);
});

test('interpreter: "if obstacle" runs its blocks only when one is seen', async () => {
  const block = createBlock('ifObstacle');
  block.body.push(createBlock('turnRight'));
  const clear = fakeRobot({ obstacle: false });
  const blocked = fakeRobot({ obstacle: true });
  await runProgram([block], clear, { wait: noWait });
  await runProgram([block], blocked, { wait: noWait });
  equal(clear.log, []);
  equal(blocked.log, [['turn', 1]]);
});

test('interpreter: reports each block as it starts', async () => {
  const { program, forward, repeat, note, lights } = sample();
  const seen = [];
  await runProgram(program.blocks, fakeRobot(), { wait: noWait, onBlock: (id) => seen.push(id) });
  equal(seen, [forward.id, repeat.id, note.id, repeat.id, note.id, lights.id]);
});

test('interpreter: stops when aborted', async () => {
  const controller = new AbortController();
  const robot = fakeRobot();
  robot.move = () => controller.abort();
  let stopped = false;
  try {
    await runProgram([createBlock('forward'), createBlock('note')], robot, { signal: controller.signal });
  } catch (error) {
    stopped = error.name === 'AbortError';
  }
  ok(stopped, 'expected an AbortError');
  equal(robot.log, []);
});
