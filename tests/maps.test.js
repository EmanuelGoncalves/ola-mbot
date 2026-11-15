import { freePlayOn, LEVELS, MAP_MISSIONS, MAP_SQUARE_CM, MAPS, missionsAt, missionsOn } from '../js/maps.js';
import { MissionBoard } from '../js/missions.js';
import { createBlock } from '../js/program/blocks.js';
import { runProgram } from '../js/program/interpreter.js';
import { Program } from '../js/program/program.js';
import { RobotHub } from '../js/robot/hub.js';
import { MBot } from '../js/robot/mbot.js';
import { wheelsPacket } from '../js/robot/protocol.js';
import { Mishap, Simulator } from '../js/robot/simulator.js';
import { correctedStepTime, DEFAULT_TUNING, squareOf } from '../js/robot/tuning.js';
import { Tutorial } from '../js/tutorial.js';
import { MapsView } from '../js/ui/maps-view.js';
import { ProgramView } from '../js/ui/program-view.js';
import { equal, ok, test } from './harness.js';

/** With no time to spend, a move ends at once. */
const INSTANT = { speed: 150, stepMs: 0, quarterTurnMs: 0 };
const noWait = async () => {};
const mission = (id) => MAP_MISSIONS.find((item) => item.id === id);
const map = (id) => MAPS.find((item) => item.id === id);

/** Builds blocks from a compact form: ['forward', 3] or ['pick']. */
function build(items) {
  return items.map(([type, value]) => {
    const block = createBlock(type, value);
    if (value !== undefined) equal(block.value, value, `"${type}" has no such choice:`);
    return block;
  });
}

/** Runs a program on a mission's map. Resolves with the robot, the blocks and what stopped the run, if anything. */
async function play(task, items) {
  const program = new Program();
  program.replace(build(items));
  const robot = new Simulator({ tuning: INSTANT, beeper: { play() {} } });
  robot.setWorld(task.world);
  let mishap = null;
  try {
    await runProgram(program.blocks, robot, { wait: noWait });
  } catch (error) {
    if (!(error instanceof Mishap)) throw error;
    mishap = error;
  }
  return { robot, mishap, solved: !mishap && task.check(program.all(), robot) };
}

test('maps: both maps are six squares by four, with one thing at most on a square and none on the start', () => {
  equal(MAPS.map((item) => [item.cols, item.rows]), [[6, 4], [6, 4]]);
  for (const { name, cols, rows, start, things } of MAPS) {
    const squares = things.map((thing) => `${thing.x},${thing.y}`);
    equal(new Set(squares).size, squares.length, `two things share a square of ${name}:`);
    ok(!squares.includes(`${start.x},${start.y}`), `something lies on the start of ${name}`);
    ok(things.every((thing) => thing.x >= 0 && thing.y >= 0 && thing.x < cols && thing.y < rows), `something lies off ${name}`);
    equal(new Set(things.map((thing) => thing.id)).size, things.length, `two things of ${name} share a name:`);
  }
});

test('maps: every map has missions at every level, each with its own id, a hint and a solution', () => {
  equal(new Set(MAP_MISSIONS.map((item) => item.id)).size, MAP_MISSIONS.length);
  for (const item of MAPS) {
    for (const level of LEVELS) ok(missionsAt(item, level).length >= 3, `${item.name} has too few ${level.name} missions`);
    for (const task of missionsOn(item)) ok(task.title && task.goal && task.hint && task.solution.length > 0, `${task.id} is incomplete`);
  }
});

test('maps: the solution of every mission solves it', async () => {
  for (const task of MAP_MISSIONS) {
    const { solved, mishap } = await play(task, task.solution);
    ok(solved, `${task.id}: its solution ${mishap ? `ends with "${mishap.message}"` : 'does not solve it'}`);
  }
});

test('maps: no mission is solved by doing nothing, or by its solution without picking anything up', async () => {
  for (const task of MAP_MISSIONS) {
    ok(!(await play(task, [['wait', 1]])).solved, `${task.id} is solved by waiting`);
    if (!task.solution.some(([type]) => type === 'pick')) continue;
    const withoutPicking = task.solution.filter(([type]) => type !== 'pick');
    ok(!(await play(task, withoutPicking)).solved, `${task.id} is solved without «Apanhar»`);
  }
});

test('maps: a thing is only carried after «Apanhar» on its square, and stays where «Largar» leaves it', async () => {
  const { robot } = await play(freePlayOn(map('kingdom')), [['pick'], ['backward', 1], ['pick'], ['forward', 2], ['drop']]);
  const sword = robot.thing('sword');
  equal([sword.held, sword.x, sword.y], [false, 2, 1], 'the sword:');
  equal(robot.holding, []);
  equal(robot.thing('frog').held, false, 'the frog, on the square where the sword was left:');
});

test('maps: the robot carries several things, and puts them all down together', async () => {
  const { robot } = await play(freePlayOn(map('kingdom')), [['backward', 1], ['pick'], ['turnLeft', 1], ['forward', 1], ['pick']]);
  equal(robot.holding.map((thing) => thing.id), ['book', 'sword'].sort());
  equal(robot.drop().map((thing) => thing.id).sort(), ['book', 'sword']);
  equal(robot.holding, []);
});

test('maps: what is too big to carry stays where it is', async () => {
  const { robot } = await play(freePlayOn(map('kingdom')), [['forward', 2], ['pick']]);
  equal(robot.holding, [], 'the well was picked up:');
  const told = [];
  robot.addEventListener('thing', (event) => told.push(event.detail.what));
  robot.pick();
  robot.drop();
  equal(told, ['heavy', 'empty']);
});

test('maps: going onto the lake, the forest or the river ends the run', async () => {
  for (const [items, where] of [[[['turnRight', 1], ['forward', 2]], 'forest'], [[['turnLeft', 1], ['forward', 1]], 'river2'], [[['forward', 1], ['turnRight', 1], ['forward', 1], ['forward', 1]], 'lake']]) {
    const { mishap, robot } = await play(freePlayOn(map('kingdom')), items);
    equal(mishap?.thing.id, where);
    equal([robot.cell.x, robot.cell.y], [robot.thing(where).x, robot.thing(where).y], 'the robot stops there:');
  }
});

test('maps: the potion does not reach the castle through the forest', async () => {
  const task = mission('map-kingdom-potion');
  const through = [['backward', 1], ['turnRight', 1], ['forward', 1], ['pick'], ['turnLeft', 1], ['forward', 3], ['turnLeft', 1], ['forward', 3], ['drop']];
  const { solved, mishap } = await play(task, through);
  equal([solved, mishap?.thing.id], [false, 'forest']);
});

test('maps: driving off a printed map ends the run; off the mat the robot only bumps', async () => {
  const off = await play(freePlayOn(map('house')), [['forward', 3]]);
  equal([off.mishap?.thing, off.robot.cell.y], [null, 0]);
  const mat = new Simulator({ tuning: INSTANT, beeper: { play() {} } });
  await mat.move(6);
  equal([mat.bumps > 0, mat.cell.y], [true, 0]);
});

test('maps: a mission that asks to keep off a square is not solved by going over it', async () => {
  const task = mission('map-house-music');
  const overTheCat = [['turnRight', 1], ['forward', 1], ['pick'], ['turnRight', 1], ['forward', 1], ['turnRight', 1], ['forward', 2], ['drop']];
  const { robot, solved } = await play(task, overTheCat);
  ok(!robot.thing('plant').held && robot.thing('plant').x === 1 && robot.thing('plant').y === 3, 'the plant did not reach the piano');
  ok(!solved, 'going over the cat counted');
});

test('maps: a mission with a limit of blocks is not solved by a longer program', async () => {
  const task = mission('map-house-fish');
  const longer = [['turnRight', 2], ['forward', 1], ['pick'], ['turnLeft', 1], ['forward', 2], ['turnLeft', 1], ['forward', 1], ['drop']];
  const { robot, solved } = await play(task, longer);
  ok(robot.thing('cat').x === 4 && robot.thing('cat').y === 2, 'the cat did not reach the aquarium');
  ok(!solved, 'eight blocks counted as six');
});

test('maps: «Ao início» puts every thing back', async () => {
  const { robot } = await play(mission('map-house-bedtime'), mission('map-house-bedtime').solution);
  robot.reset();
  const cat = robot.thing('cat');
  equal([cat.held, cat.x, cat.y, robot.cell.x, robot.cell.y], [false, 2, 3, 2, 2]);
});

test('maps: on a map a step is one of its squares, and takes the time the mat\'s step would take for that far', () => {
  equal(squareOf({ stepMs: 1260, cellCm: 20 }), { cm: 20, ms: 1260 });
  equal(squareOf({ stepMs: 1260, cellCm: 20, mapCm: 15 }), { cm: 15, ms: 950 });
  // A robot that went 5.7 squares when asked for 3 gets a step that much shorter.
  equal(Math.round(correctedStepTime(1260, 3, 5.7)), 673);
});

test('maps: the real robot drives a map\'s square, and blinks when it picks something up', async () => {
  const sent = [];
  const link = Object.assign(new EventTarget(), { send: async (bytes) => sent.push([...bytes]) });
  const tuning = { ...DEFAULT_TUNING, stepMs: 60, cellCm: 20, mapCm: MAP_SQUARE_CM };
  const started = performance.now();
  await new MBot(link, tuning).move(1);
  const took = performance.now() - started;
  ok(took >= 45 && took < 60 + 40, `a 15 cm step of a robot tuned to 60 ms for 20 cm took ${Math.round(took)} ms`);
  equal(sent.at(-1), [...wheelsPacket(0, 0)]);

  const screen = new Simulator({ tuning: INSTANT, beeper: { play() {} } });
  screen.setWorld(freePlayOn(map('kingdom')).world);
  const hub = new RobotHub(screen, tuning);
  const lights = [];
  hub.attach({ focus() {}, setLights: async (color) => lights.push(color?.id ?? null), move: async () => {} });
  await hub.move(-1);
  equal((await hub.pick()).id, 'sword');
  equal(lights, ['green', null]);
  equal(await hub.pick(), null, 'a second time:');
  equal(lights.slice(2), ['red', null]);
});

/** The Programar tab and the board of a session with nothing saved. */
function programTab() {
  const tuning = { ...DEFAULT_TUNING, stepMs: 0, quarterTurnMs: 0 };
  const simulator = new Simulator({ tuning, beeper: { play() {} } });
  const hub = new RobotHub(simulator, tuning);
  const saved = {};
  const board = new MissionBoard({ store: { load: (key, fallback) => saved[key] ?? fallback, save: (key, value) => (saved[key] = value) } });
  const view = new ProgramView({ hub, simulator, tuning, board, tutorial: new Tutorial(), onPlayLesson() {}, onShowMissions() {}, onShowMore() {} });
  return { tuning, simulator, hub, board, view };
}

test('maps: opening a mission shows its map in Programar, with steps of 15 cm and the blocks for things', () => {
  const { tuning, simulator, board, view } = programTab();
  ok(!('map' in view.element.dataset) && tuning.mapCm === undefined, 'before any map is open');
  board.start(mission('map-kingdom-potion'));
  equal([simulator.world.cols, simulator.world.rows, simulator.cell.x, simulator.cell.y], [6, 4, 2, 2]);
  equal([view.element.dataset.map, tuning.mapCm], ['kingdom', MAP_SQUARE_CM]);
  equal(view.element.querySelector('.stage').getAttribute('viewBox'), '0 0 600 400');
  ok(view.element.querySelector('.block-chip[data-type="pick"]') && view.element.querySelector('.block-chip[data-type="drop"]'), 'no blocks to pick up and put down');
  board.leave();
  equal([simulator.world.cols, simulator.world.rows, simulator.things.length], [6, 6, 0]);
  ok(!('map' in view.element.dataset) && tuning.mapCm === undefined, 'after leaving the map');
});

test('maps: the Mapas tab lists the missions of the chosen map and opens them', () => {
  const { tuning, hub, board } = programTab();
  const played = [];
  const view = new MapsView({ board, hub, tuning, tune() {}, onPlay: (task) => played.push(task.id) }).element;
  [...view.querySelectorAll('.choice button')][0].click(); // whichever map was chosen last time
  equal(view.querySelectorAll('.card').length, missionsOn(map('house')).length);
  equal(view.querySelectorAll('.map-square').length, 24);
  [...view.querySelectorAll('.choice button')][1].click();
  equal(view.querySelectorAll('.card').length, missionsOn(map('kingdom')).length);
  equal(view.querySelectorAll('.map-square.is-hazard').length, 5);
  view.querySelector('.card button').click();
  [...view.querySelectorAll('.map-board button')].at(-1).click();
  equal(played, ['map-kingdom-frog', 'map-kingdom-free']);
});

test('maps: the step is put right from how many squares the robot went, and the turn a little at a time', () => {
  const { hub, board } = programTab();
  const tuning = { ...DEFAULT_TUNING };
  const tuned = [];
  const tune = (key, value) => {
    tuned.push([key, Math.round(value)]);
    return (tuning[key] = Math.round(value));
  };
  const view = new MapsView({ board, hub, tuning, tune, onPlay() {} }).element;
  const button = (text) => [...view.querySelectorAll('.map-tuner button')].find((item) => item.textContent.includes(text));
  const went = view.querySelector('#map-went');
  went.value = 5.7;
  button('Acertar o passo').click();
  equal(tuned, [['stepMs', 673]]);
  equal(Number(went.value), 3, 'the slider goes back to three squares:');
  button('Rodou de menos').click();
  button('Rodou demais').click();
  equal(tuned.slice(1), [['quarterTurnMs', 480], ['quarterTurnMs', 460]]);
  button('Andar 3 quadrados').click();
  ok(view.querySelector('.map-tuner [aria-live]').textContent.includes('Ligue primeiro'), 'with no robot connected, it says so');
});
