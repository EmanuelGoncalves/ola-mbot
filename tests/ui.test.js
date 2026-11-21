import { MissionBoard } from '../js/missions.js';
import { BluetoothLink } from '../js/robot/bluetooth.js';
import { RobotHub } from '../js/robot/hub.js';
import { Simulator } from '../js/robot/simulator.js';
import { DEFAULT_TUNING } from '../js/robot/tuning.js';
import { exercisesOf, SUBJECTS, YEARS } from '../js/school.js';
import { Tutorial } from '../js/tutorial.js';
import { Connection } from '../js/ui/connection.js';
import { DriveView } from '../js/ui/drive-view.js';
import { LearnView } from '../js/ui/learn-view.js';
import { MapsView } from '../js/ui/maps-view.js';
import { MissionsView } from '../js/ui/missions-view.js';
import { ParentsView } from '../js/ui/parents-view.js';
import { ProgramView } from '../js/ui/program-view.js';
import { RemoteView } from '../js/ui/remote-view.js';
import { SchoolView } from '../js/ui/school-view.js';
import { equal, ok, test } from './harness.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const nothing = () => {};

/** What every tab is built from, with stars kept in memory and no robot connected. */
function parts() {
  const tuning = { ...DEFAULT_TUNING };
  const simulator = new Simulator({ tuning, beeper: { play() {} } });
  const hub = new RobotHub(simulator, tuning);
  const saved = {};
  const board = new MissionBoard({ store: { load: (key, fallback) => saved[key] ?? fallback, save: (key, value) => (saved[key] = value) } });
  return { tuning, simulator, hub, board, tutorial: new Tutorial() };
}

const buttonNamed = (element, text) => [...element.querySelectorAll('button')].find((button) => button.textContent.includes(text));

test('ui: every tab builds, with its heading', () => {
  const { tuning, simulator, hub, board, tutorial } = parts();
  const views = {
    learn: new LearnView({ tutorial, onPlay: nothing, onShowMissions: nothing }),
    program: new ProgramView({ hub, simulator, tuning, board, tutorial, onPlayLesson: nothing, onShowMissions: nothing, onShowMore: nothing }),
    drive: new DriveView({ hub, simulator, tuning, onFreePlay: nothing }),
    missions: new MissionsView({ board, onPlay: nothing }),
    school: new SchoolView({ board, onPlay: nothing }),
    maps: new MapsView({ board, hub, tuning, tune: nothing, onPlay: nothing }),
    remote: new RemoteView(),
    parents: new ParentsView({ hub, tuning, link: new BluetoothLink({ bluetooth: null }) }),
  };
  for (const [name, view] of Object.entries(views)) ok(view.element.querySelector('h2'), `the ${name} tab has no heading`);
});

test('ui: Conduzir shows one of its four parts at a time', () => {
  const { tuning, simulator, hub } = parts();
  const view = new DriveView({ hub, simulator, tuning, onFreePlay: nothing }).element;
  const shown = () => [...view.querySelectorAll('.drive-part')].filter((part) => !part.hidden).map((part) => part.dataset.part);
  const modes = [...view.querySelectorAll('.drive-modes button')];
  equal(modes.length, 4);
  equal(shown(), ['drive']);
  modes[1].click();
  equal(shown(), ['fun']);
  modes[2].click();
  equal(shown(), ['alone']);
  modes[3].click();
  equal(shown(), [], 'exploring has its own panels:');
  ok(view.querySelector('.drive-mat').hidden && !view.querySelector('.explore-map-panel').hidden);
  modes[0].click();
  equal(shown(), ['drive']);
  equal(modes.map((mode) => mode.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);
});

test('ui: a light show goes on between the parts of Conduzir, and ends with exploring', async () => {
  const { tuning, simulator, hub } = parts();
  const drive = new DriveView({ hub, simulator, tuning, onFreePlay: nothing });
  const modes = [...drive.element.querySelectorAll('.drive-modes button')];
  const show = buttonNamed(drive.element, 'Arco-íris');
  show.click();
  await tick(20);
  equal(show.getAttribute('aria-pressed'), 'true');
  modes[0].click();
  equal(show.getAttribute('aria-pressed'), 'true', 'back at the arrows:');
  modes[3].click();
  await tick(20);
  equal(show.getAttribute('aria-pressed'), 'false', 'while exploring:');
  equal(simulator.lights, null);
});

test('ui: the arrow keys drive from every tab; where they write a program, with Shift', async () => {
  const { tuning, simulator, hub } = parts();
  let writing = false;
  const drive = new DriveView({ hub, simulator, tuning, onFreePlay: nothing, arrowsWrite: () => writing });
  const tab = document.createElement('div');
  tab.hidden = true; // another tab is showing
  tab.append(drive.element);
  document.body.append(tab);
  const key = (type, name, more = {}) => document.dispatchEvent(new KeyboardEvent(type, { key: name, ...more }));
  /** Holds an arrow for a moment and tells whether the robot on screen moved. */
  const moves = async (more) => {
    const before = { ...simulator.pose };
    key('keydown', 'ArrowUp', more);
    await tick(80);
    key('keyup', 'ArrowUp');
    return simulator.pose.x !== before.x || simulator.pose.y !== before.y;
  };
  try {
    equal(await moves(), true, 'on another tab:');
    equal(await moves({ metaKey: true }), false, 'with ⌘, which belongs to the browser:');
    writing = true;
    equal(await moves(), false, 'where the arrows write a program:');
    equal(await moves({ shiftKey: true }), true, 'there, with Shift:');
    const before = { ...simulator.pose };
    await tick(80);
    equal(simulator.pose, before, 'the arrow let go, the robot stands still:');
  } finally {
    drive.stop();
    tab.remove();
  }
});

test('ui: the Escola tab lists every exercise of the chosen subject', () => {
  const { board } = parts();
  const view = new SchoolView({ board, onPlay: nothing }).element;
  for (const subject of SUBJECTS) {
    buttonNamed(view, subject.name).click();
    equal(view.querySelectorAll('.card').length, exercisesOf(subject, YEARS[0]).length, `${subject.name}:`);
  }
  buttonNamed(view, SUBJECTS[0].name).click(); // the choice is remembered: leave it on the first
});

test('ui: the Pais tab shows the sensors live and answers the command line', async () => {
  const { tuning, hub } = parts();
  const parents = new ParentsView({ hub, tuning, link: new BluetoothLink({ bluetooth: null }) });
  const view = parents.element;
  equal([...view.children].map((child) => child.tagName), ['HEADER', 'SECTION', 'SECTION', 'DETAILS'], 'two panels, and the reading folded away:');
  const values = () => [...view.querySelectorAll('.metric-value')].map((value) => value.textContent);
  equal(values(), Array(6).fill('—').with(1, ''), 'before the first reading:');
  buttonNamed(view, 'Ler ao vivo').click();
  await tick(30);
  ok(values()[0].endsWith(' cm'), `the robot on screen sees the edge of the mat: ${values()[0]}`);
  ok(view.querySelector('.metric-note').textContent.includes('porta 3'));
  ok(view.textContent.includes('valores do robô do ecrã'));
  buttonNamed(view, 'Pausar').click();
  await tick(10);
  ok(buttonNamed(view, 'Ler ao vivo') && view.textContent.includes('Em pausa.'), 'the reading did not pause');
  view.querySelector('.console-input').value = 'luz azul';
  view.querySelector('.console-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await tick(120);
  const log = view.querySelector('.console-log').textContent;
  ok(log.includes('> luz azul') && log.includes('Luzes em azul.'), log);
});

const SOURCES = [
  'main.js',
  ...['celebrate', 'coach', 'connection', 'drive-view', 'explore-view', 'layout', 'learn-view', 'maps-view', 'missions-view', 'parents-view', 'program-editor'].map((name) => `ui/${name}.js`),
  ...['program-view', 'remote-view', 'robot-figure', 'round-dots', 'school-view', 'shortcuts-view', 'show-editor', 'stage-view'].map((name) => `ui/${name}.js`),
];

test('ui: every interface text that is used exists', async () => {
  const { T } = await import('../js/texts.js');
  let used = 0;
  for (const source of SOURCES) {
    const response = await fetch(`../js/${source}`);
    ok(response.ok, `${source} is missing`);
    for (const [, group, key] of (await response.text()).matchAll(/\bT\.([a-zA-Z]+)\.([a-zA-Z]+)/g)) {
      ok(T[group]?.[key] !== undefined, `${source} uses T.${group}.${key}, which does not exist`);
      used += 1;
    }
  }
  ok(used > 150, `only ${used} texts were found in use`);
});

test('ui: taking every colour out of a show can be undone', () => {
  const { tuning, simulator, hub } = parts();
  const view = new DriveView({ hub, simulator, tuning, onFreePlay: nothing }).element;
  const row = () => view.querySelectorAll('.show-row .show-dot').length;
  const before = row();
  ok(before > 0, 'the show starts with some colours');
  buttonNamed(view, 'Tirar todas').click();
  equal(row(), 0);
  buttonNamed(view, 'Voltar atrás').click();
  equal(row(), before);
  ok(buttonNamed(view, 'Tirar todas'), 'the button is back to taking colours out');
});

test('ui: the tuning can be put back to the values measured on a real mBot', () => {
  const { hub } = parts();
  const tuning = { ...DEFAULT_TUNING, stepMs: 700, quarterTurnMs: 900, scanStops: 20, flipTurn: true };
  const { dialog } = new Connection({ hub, tuning, onOpen: nothing });
  buttonNamed(dialog, 'Repor os valores de origem').click();
  equal([tuning.stepMs, tuning.quarterTurnMs, tuning.scanStops], [DEFAULT_TUNING.stepMs, DEFAULT_TUNING.quarterTurnMs, DEFAULT_TUNING.scanStops]);
  equal(tuning.flipTurn, true, 'the switch for motors plugged the other way round:');
  equal(Number(dialog.querySelector('#tuning-stepMs').value), DEFAULT_TUNING.stepMs, 'the slider follows:');
});

