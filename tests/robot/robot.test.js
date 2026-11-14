import { BluetoothLink } from '../../js/robot/bluetooth.js';
import { RobotHub } from '../../js/robot/hub.js';
import { MBot } from '../../js/robot/mbot.js';
import { distanceRequest, lightsPacket, ReplyParser, tonePacket } from '../../js/robot/protocol.js';
import { measureQuarters, measureStep, spinsOf, sweepUntilRepeat, whereInTurn } from '../../js/robot/radar.js';
import { loadTuning } from '../../js/robot/tuning.js';
import { sleep } from '../../js/timing.js';

/**
 * Tests of the app's own code on a real mBot. `still` tests leave the robot where it is and
 * silent; `sound` tests play notes; `moving` tests turn it on the spot and drive it one step,
 * and stop at once if the line sensors under its nose see nothing: an edge, or a robot lifted
 * off the floor.
 */
export const still = [];
export const sound = [];
export const moving = [];

/** Thrown by a test that cannot run here; `why` says what it needs. */
export class Skip extends Error {}

const check = (truth, message) => {
  if (!truth) throw new Error(message);
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Everything a test needs: the link, the robot, the hub the app drives it through, and its tuning. */
export function robotOn(bluetooth) {
  const tuning = loadTuning();
  const link = new BluetoothLink({ bluetooth });
  const bot = new MBot(link, tuning);
  const hub = new RobotHub({ rotate() {}, move() {}, turn() {}, stop() {}, setLights() {} }, tuning);
  // Answers by the number of their question and when they came, for timing without the robot's own queue.
  const parser = new ReplyParser();
  const answered = new Map();
  link.addEventListener('data', ({ detail }) => parser.push(detail).forEach(({ index }) => answered.set(index, performance.now())));
  let index = 200;
  /** Sends `first` (if any) and a question right behind it; resolves with the ms until the answer, or null. */
  const answerAfter = async (first, limit = 3000) => {
    index = index >= 250 ? 200 : index + 1;
    answered.delete(index);
    const sent = performance.now();
    await link.send(first ? Uint8Array.from([...first, ...distanceRequest(index)]) : distanceRequest(index));
    while (!answered.has(index) && performance.now() - sent < limit) await sleep(4);
    return answered.has(index) ? answered.get(index) - sent : null;
  };
  /** Runs `job(signal)` while watching the floor: aborts it, and stops the robot, at an edge. */
  const guarded = async (job) => {
    const run = new AbortController();
    let watching = true;
    const watch = (async () => {
      for (let dark = 0; watching; await sleep(120)) {
        dark = (await bot.readLine()) === 0 ? dark + 1 : 0;
        if (dark >= 2) run.abort(new Error('the floor ended under the robot: it was stopped'));
      }
    })();
    try {
      return await job(run.signal);
    } finally {
      watching = false;
      await watch;
      await bot.stop();
    }
  };
  return { tuning, link, bot, hub, answerAfter, guarded, connect: () => link.connect().then(() => hub.attach(bot)) };
}

still.push(['the firmware says its version', async ({ bot }) => {
  const version = await bot.readVersion();
  check(/^\d\d\.\d\d\.\d{3}$/.test(version), `it said ${version}`);
  return version;
}]);

still.push(['thirty questions in a row are all answered, quickly', async ({ answerAfter }) => {
  const times = [];
  for (let i = 0; i < 30; i++) times.push(await answerAfter());
  check(!times.includes(null), `${times.filter((ms) => ms === null).length} went unanswered`);
  check(median(times) < 150, `half took more than ${Math.round(median(times))} ms`);
  return `half within ${Math.round(median(times))} ms, the slowest ${Math.round(Math.max(...times))} ms`;
}]);

still.push(['the eyes, the line sensors, the light sensor and the button answer', async ({ bot }) => {
  const [cm, line, light, button] = [await bot.readDistance(), await bot.readLine(), await bot.readLight(), await bot.readButton()];
  check(cm !== null && cm >= 0 && cm <= 400, `distance ${cm}`);
  check([0, 1, 2, 3].includes(line), `line ${line}`);
  check(light !== null && light >= 0 && light <= 1023, `light ${light}`);
  check(button === false, `button ${button}: is somebody pressing it?`);
  return `${Math.round(cm)} cm ahead, line sensors ${line}, light ${Math.round(light)}`;
}]);

still.push(['a colour change does not make the robot miss the packet right behind it', async ({ answerAfter, bot }) => {
  let answers = 0;
  for (let i = 0; i < 20; i++) answers += (await answerAfter(lightsPacket(i % 2 ? [40, 0, 0] : [0, 0, 40]), 400)) !== null;
  await bot.setLights(null);
  check(answers >= 19, `only ${answers} of 20 questions sent in the same write as a colour change were answered`);
  return `${answers} of 20`;
}]);

sound.push(['the robot holds a note about 1.28 times as long as asked: the app counts on it', async ({ answerAfter }) => {
  const idle = [];
  for (let i = 0; i < 7; i++) idle.push(await answerAfter());
  const held = [];
  for (const ms of [300, 600]) {
    await sleep(250);
    held.push(((await answerAfter(tonePacket(440, ms), 4000)) - median(idle)) / ms);
  }
  check(held.every((ratio) => ratio > 1.18 && ratio < 1.38), `it held them ${held.map((ratio) => ratio.toFixed(2)).join(' and ')} times as long`);
  return held.map((ratio) => ratio.toFixed(2)).join(' and ');
}]);

sound.push(['after a tune of twelve notes, with the lights changing, the robot answers at once', async ({ bot, answerAfter }) => {
  for (let note = 0; note < 12; note++) {
    bot.setLights({ rgb: note % 2 ? [30, 0, 30] : [0, 30, 30] });
    await bot.playTone(392 + 30 * note, 300);
  }
  await sleep(320); // the last note
  const ms = await answerAfter();
  await bot.setLights(null);
  check(ms !== null && ms < 200, `the answer took ${ms === null ? 'for ever' : `${Math.round(ms)} ms`}: the notes piled up`);
  return `${Math.round(ms)} ms`;
}]);

still.push(['a reset leaves the robot answering', async ({ bot, link }) => {
  await bot.reset();
  const cm = await bot.readDistance();
  check(cm !== null, 'no answer after the reset');
  check(link.health.failed === 0, `${link.health.failed} writes failed`);
  return `${link.health.sent} packets sent in all, none failed`;
}]);

moving.push(['the robot finds its own full turn with its eyes', async ({ hub, tuning, guarded }) => {
  const sweep = await guarded((signal) => sweepUntilRepeat(hub, { expected: tuning.scanStops, longest: 1.8, stepMs: tuning.scanStepMs, signal }));
  check(sweep.found, 'the looks did not repeat: it needs things at different distances around it, and nobody walking by');
  check(Math.abs(sweep.turn - tuning.scanStops) <= tuning.scanStops / 4, `a turn took ${sweep.turn.toFixed(1)} spins, not ${tuning.scanStops}: run "Afinar as voltas sozinho"`);
  return `${sweep.turn.toFixed(1)} spins of ${tuning.scanStepMs} ms (tuned for ${tuning.scanStops})`;
}]);

moving.push(['four quarter turns bring it back to where it was facing', async ({ hub, tuning, guarded }) => {
  // Spins shorter than the radar's, as in the app's own tuning: more looks in a turn tell better where the robot is.
  const stepMs = Math.round(tuning.scanStepMs * 0.65);
  const expected = Math.round(spinsOf({ stepMs: tuning.scanStepMs, turn: tuning.scanStops }, stepMs));
  const measured = await guarded(async (signal) => {
    const { found, looks, turn } = await sweepUntilRepeat(hub, { expected, longest: 1.8, stepMs, signal });
    if (!found) return null;
    const from = await whereInTurn(hub, { looks, turn, stepMs, signal });
    return from === null ? null : measureQuarters(hub, { looks, turn, stepMs, from, signal });
  });
  if (measured === null) throw new Skip('it could not tell where it was facing');
  check(Math.abs(measured.degrees - 360) <= 25, `they made ${Math.round(measured.degrees)}°: run "Afinar as voltas sozinho"`);
  return `${Math.round(measured.degrees)}° with quarter turns of ${tuning.quarterTurnMs} ms`;
}]);

moving.push(['a step is one square long', async ({ hub, tuning, guarded }) => {
  const squares = await guarded((signal) => measureStep(hub, { signal }));
  if (squares === null || squares < 0.4 || squares > 2.5) throw new Skip('it needs a flat wall about a metre ahead: the eyes saw something else');
  check(squares > 0.7 && squares < 1.3, `it went ${Math.round(squares * tuning.cellCm)} cm: run "Afinar o passo sozinho"`);
  return `${Math.round(squares * tuning.cellCm)} cm with steps of ${tuning.stepMs} ms`;
}]);
