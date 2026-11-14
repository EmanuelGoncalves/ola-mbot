import { JINGLES, playJingle } from '../jingles.js';
import { colorById, noteById } from '../robot/palette.js';
import { sleep } from '../timing.js';

/** Pause after instant blocks (lights, moves) so each one can be seen. */
export const BEAT_MS = 250;
export const NOTE_MS = 350;

/**
 * Runs blocks in order on `robot` (see RobotHub for the commands).
 * `onBlock(id)` is called as each block starts; abort `signal` to stop.
 */
export async function runProgram(blocks, robot, { signal, onBlock = () => {}, wait = sleep } = {}) {
  const context = { robot, signal, onBlock, wait };
  for (const block of blocks) {
    signal?.throwIfAborted();
    onBlock(block.id);
    await EXECUTE[block.type](block, context);
  }
}

const EXECUTE = {
  forward: (block, context) => movement(context, (robot, signal) => robot.move(block.value, signal)),
  backward: (block, context) => movement(context, (robot, signal) => robot.move(-block.value, signal)),
  turnLeft: (block, context) => movement(context, (robot, signal) => robot.turn(-block.value, signal)),
  turnRight: (block, context) => movement(context, (robot, signal) => robot.turn(block.value, signal)),
  untilObstacle: (block, context) => movement(context, (robot, signal) => robot.moveUntilObstacle(signal)),

  async lights(block, { robot, signal, wait }) {
    await robot.setLights(colorById(block.value));
    await wait(BEAT_MS, signal);
  },

  async lightsOff(block, { robot, signal, wait }) {
    await robot.setLights(null);
    await wait(BEAT_MS, signal);
  },

  async note(block, { robot, signal, wait }) {
    await robot.playTone(noteById(block.value).hz, NOTE_MS);
    await wait(NOTE_MS + BEAT_MS / 2, signal);
  },

  /** A whole tune, note by note; the program goes on when it ends. */
  async music(block, { robot, signal, wait }) {
    const jingle = JINGLES.find((item) => item.id === block.value) ?? JINGLES[0];
    await playJingle(jingle, robot, { signal, wait });
    await wait(BEAT_MS, signal);
  },

  wait: (block, { signal, wait }) => wait(block.value * 1000, signal),

  async repeat(block, context) {
    for (let round = 0; round < block.value; round++) {
      if (round > 0) context.onBlock(block.id); // show the loop going round again
      await runProgram(block.body, context.robot, context);
    }
  },

  async ifObstacle(block, context) {
    if (await context.robot.obstacleAhead()) {
      await runProgram(block.body, context.robot, context);
    }
  },
};

/** A move followed by a short rest, which keeps the real robot's steps tidy. */
async function movement({ robot, signal, wait }, command) {
  await command(robot, signal);
  await wait(BEAT_MS, signal);
}
