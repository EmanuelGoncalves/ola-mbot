import { MISSIONS } from '../js/missions.js';
import { createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { Simulator } from '../js/robot/simulator.js';
import { equal, ok, test } from './harness.js';

const FAST = { speed: 150, stepMs: 1, quarterTurnMs: 1 };
const noWait = async () => {};

function simulator(world) {
  const robot = new Simulator({ tuning: FAST, beeper: { play() {} } });
  if (world) robot.setWorld(world);
  return robot;
}

/** Builds blocks from a compact form: ['forward', 3] or ['repeat', 4, [...]]. */
function build(items) {
  return items.map(([type, value, body]) => {
    const block = createBlock(type, value);
    if (body) block.body = build(body);
    return block;
  });
}

test('simulator: starts on (1, 4) facing up and walks forwards', async () => {
  const robot = simulator();
  await robot.move(3);
  equal(robot.cell, { x: 1, y: 1 });
  equal(robot.stepsMoved, 3);
});

test('simulator: a quarter turn right faces east', async () => {
  const robot = simulator();
  await robot.turn(1);
  await robot.move(2);
  equal(robot.cell, { x: 3, y: 4 });
});

test('simulator: the edge of the mat is a gentle bump', async () => {
  const robot = simulator();
  await robot.move(-3);
  equal(robot.cell, { x: 1, y: 5 });
  equal(robot.bumps, 2);
});

test('simulator: stops in front of a box', async () => {
  const robot = simulator({ obstacles: [[1, 1]] });
  await robot.moveUntilObstacle();
  equal(robot.cell, { x: 1, y: 2 });
  ok(robot.obstacleAhead());
  equal(robot.bumps, 0);
});

test('simulator: reset returns to the start', async () => {
  const robot = simulator();
  await robot.move(2);
  robot.setLights({ hex: '#ff0000' });
  robot.reset();
  ok(robot.atStart());
  equal(robot.lights, null);
  equal(robot.trail.length, 1);
});

test('simulator: a box cannot be put where the robot stands', async () => {
  const robot = simulator();
  await robot.move(1);
  robot.toggleObstacle(1, 3);
  robot.toggleObstacle(1, 4); // the start cell stays free too
  robot.toggleObstacle(3, 3);
  equal(robot.boxes, [[3, 3]]);
});

test('simulator: driving slides along the edge of the mat', async () => {
  const robot = new Simulator({ tuning: { speed: 150, stepMs: 200, quarterTurnMs: 1 }, beeper: { play() {} } });
  await robot.turn(0.25); // facing up and a little to the right
  robot.drive(150, 150);
  await new Promise((resolve) => setTimeout(resolve, 1300));
  robot.stop();
  equal(robot.cell.y, 0);
  ok(robot.pose.x > 3.1, `the robot stopped at the edge instead of sliding (x = ${robot.pose.x})`);
});

/** One solution per mission, following the mission's own hint. */
const SOLUTIONS = {
  'first-steps': [['forward', 3]],
  corner: [['forward', 2], ['turnRight', 1], ['forward', 3]],
  'traffic-light': [['lights', 'red'], ['wait', 1], ['lights', 'yellow'], ['wait', 1], ['lights', 'green']],
  square: [['repeat', 4, [['forward', 2], ['turnRight', 1]]]],
  musician: [['note', 'do'], ['note', 're'], ['note', 'mi'], ['note', 'fa'], ['note', 'sol']],
  box: [['untilObstacle'], ['turnRight', 1], ['forward', 3]],
  maze: [['forward', 3], ['turnRight', 1], ['forward', 2], ['turnRight', 1], ['forward', 3]],
  dance: [['repeat', 2, [['lights', 'blue'], ['note', 'mi'], ['turnLeft', 1]]]],
};

for (const mission of MISSIONS) {
  test(`mission "${mission.id}": the hinted solution earns the star`, async () => {
    const program = new Program();
    program.replace(build(SOLUTIONS[mission.id]));
    const robot = simulator(mission.world);
    await runProgram(program.blocks, robot, { wait: noWait });
    ok(mission.check(program.all(), robot), 'the check did not pass');
  });

  test(`mission "${mission.id}": an empty program does not earn the star`, () => {
    const robot = simulator(mission.world);
    ok(!mission.check([], robot), 'the check passed with no blocks');
  });
}
