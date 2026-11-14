import { createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { Simulator } from '../js/robot/simulator.js';
import { LESSONS } from '../js/tutorial.js';
import { equal, ok, test } from './harness.js';

const FAST = { speed: 150, stepMs: 1, quarterTurnMs: 1 };
const noWait = async () => {};

/** Builds blocks from a compact form: ['forward', 3] or ['repeat', 4, [...]]. */
function build(items) {
  return items.map(([type, value, body]) => {
    const block = createBlock(type, value);
    if (body) block.body = build(body);
    return block;
  });
}

/** What a lesson step sees, for a program with no block open. */
function stateOf(lesson, blocks, { ran }) {
  const program = new Program();
  program.replace(blocks);
  const robot = new Simulator({ tuning: FAST, beeper: { play() {} } });
  robot.setWorld(lesson.world);
  return { program, state: { blocks: program.all(), top: program.blocks, selected: null, cursor: { parentId: null, index: blocks.length }, ran, robot } };
}

/** The program each lesson leads to. */
const SOLUTIONS = {
  'first-program': [['forward', 1]],
  steps: [['forward', 3]],
  turn: [['forward', 2], ['turnRight', 1], ['forward', 2]],
  'lights-sound': [['lights', 'green'], ['note', 'mi'], ['note', 'do'], ['note', 'do']],
  fix: [['forward', 1], ['turnRight', 1], ['forward', 1]],
  repeat: [['repeat', 4, [['forward', 1], ['turnRight', 1]]]],
  eyes: [['untilObstacle'], ['turnRight', 1], ['forward', 2]],
};

for (const lesson of LESSONS) {
  test(`lesson "${lesson.id}": starts on its first step`, () => {
    const { state } = stateOf(lesson, Program.revive(lesson.program), { ran: false });
    ok(!lesson.steps[0].done(state), 'the first step is already done');
  });

  test(`lesson "${lesson.id}": its program finishes every step`, async () => {
    const { program, state } = stateOf(lesson, build(SOLUTIONS[lesson.id]), { ran: true });
    await runProgram(program.blocks, state.robot, { wait: noWait });
    const open = lesson.steps.findIndex((step) => !step.done(state));
    equal(open, -1, 'a step is still open:');
  });

  test(`lesson "${lesson.id}": the last step waits for the program to run`, () => {
    const { state } = stateOf(lesson, build(SOLUTIONS[lesson.id]), { ran: false });
    equal(lesson.steps.findIndex((step) => !step.done(state)), lesson.steps.length - 1);
  });

  test(`lesson "${lesson.id}": every step points at something`, () => {
    const { state } = stateOf(lesson, Program.revive(lesson.program), { ran: false });
    const open = lesson.steps.find((step) => !step.done(state));
    const target = typeof open.target === 'function' ? open.target(state) : open.target;
    ok(Array.isArray(target), 'the first step has no target');
  });
}
