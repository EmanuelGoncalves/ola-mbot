import { DOOR, Explorer, realBody } from '../js/robot/explorer.js';
import { ROOMS, VirtualRoom } from '../js/robot/room.js';
import { equal, ok, test } from './harness.js';

const noWait = async () => {};

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

/** Lets the robot explore a room; `slip` makes its moves and turns a little wrong, as on a real floor. */
async function explore(room, { slip = 0, seed = 0 } = {}) {
  const body = new VirtualRoom(room, { slip, random: seeded(seed) });
  const events = [];
  const result = await new Explorer(body, { stepCm: 20, wait: noWait, onEvent: (event) => events.push(event) }).run();
  return { result, body, events };
}

const plain = (door, start = { x: 150, y: 110, heading: 0 }) => ({ width: 300, height: 240, door, start });

for (const room of ROOMS) {
  test(`explorer: finds the way out of "${room.name}"`, async () => {
    const { result, body } = await explore(room);
    ok(result.found, `gave up: ${result.reason}`);
    ok(body.outside, 'said it was out, but is still inside');
    ok(Math.abs(result.widthCm - room.door.width) <= 6, `measured ${result.widthCm} cm for a door of ${room.door.width} cm`);
  });

  test(`explorer: finds the way out of "${room.name}" on a slippery floor`, async () => {
    for (let seed = 0; seed < 5; seed++) {
      const { result, body } = await explore(room, { slip: 0.04, seed });
      ok(result.found && body.outside, `seed ${seed}: ${result.found ? 'still inside' : result.reason}`);
    }
  });
}

test('explorer: a door is found in any wall, from any start', async () => {
  const doors = [
    { wall: 'top', at: 30, width: 80 },
    { wall: 'right', at: 120, width: 100 },
    { wall: 'bottom', at: 190, width: 90 },
    { wall: 'left', at: 20, width: 90 },
  ];
  const starts = [{ x: 60, y: 60, heading: 45 }, { x: 240, y: 180, heading: 200 }, { x: 150, y: 120, heading: 300 }];
  for (const door of doors) {
    for (const start of starts) {
      const { result, body } = await explore(plain(door, start));
      ok(result.found && body.outside, `door in the ${door.wall} wall, start ${start.x},${start.y}: ${result.reason ?? 'still inside'}`);
    }
  }
});

test('explorer: a room with no door is given up after going all round it', async () => {
  const { result, body } = await explore(plain(null));
  equal(result, { found: false, reason: 'none' });
  ok(!body.outside);
});

test('explorer: an opening too narrow or too wide for a door is not the way out', async () => {
  const narrow = await explore(plain({ wall: 'top', at: 100, width: 45 }));
  ok(!narrow.result.found, 'went through a 45 cm opening');
  const wide = await explore(plain({ wall: 'top', at: 60, width: 170 }));
  ok(!wide.result.found, 'took a 170 cm opening for a door');
  ok(wide.events.some((event) => event.type === 'gap' && !event.small), 'the wide opening was not noticed');
});

test('explorer: it goes round furniture standing against the wall', async () => {
  const room = { ...plain({ wall: 'right', at: 130, width: 90 }, { x: 80, y: 60, heading: 0 }), boxes: [[110, 190, 70, 50]] };
  const { result, body } = await explore(room);
  ok(result.found && body.outside, result.reason ?? 'still inside');
});

test('explorer: the door limits are 80 cm to 1 m', () => {
  equal(DOOR, { minCm: 80, maxCm: 100 });
});

test('explorer: the real mBot is driven in its own steps, turns and radar spins', async () => {
  const calls = [];
  const mbot = {
    readDistance: async () => 25,
    move: async (steps, signal, bend) => calls.push(['move', steps, bend]),
    turn: async (quarters) => calls.push(['turn', quarters]),
    rotate: async (direction, ms) => calls.push(['rotate', direction, ms]),
  };
  const body = realBody(mbot, { cellCm: 20, scanStepMs: 1, scanStops: 18 });
  equal(body.spinDegrees, 20);
  equal(await body.range(), 35, 'the eyes are 10 cm ahead of the middle of the robot:');
  await body.forward(30, undefined, 8);
  await body.quarter(-1);
  await body.spin(1);
  equal(calls, [['move', 1.5, 8], ['turn', -1], ['rotate', 1, 1]]);
  mbot.readDistance = async () => 400;
  equal(await body.range(), null, 'nothing in sight:');
});
