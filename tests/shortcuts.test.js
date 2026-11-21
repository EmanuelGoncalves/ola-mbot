import { MAP_MISSIONS } from '../js/maps.js';
import { MissionBoard } from '../js/missions.js';
import { BLOCKS } from '../js/program/blocks.js';
import { RobotHub } from '../js/robot/hub.js';
import { Simulator } from '../js/robot/simulator.js';
import { DEFAULT_TUNING } from '../js/robot/tuning.js';
import { BLOCK_KEYS, GLOBAL_KEYS, PROGRAM_KEYS } from '../js/shortcuts.js';
import { Tutorial } from '../js/tutorial.js';
import { ProgramView } from '../js/ui/program-view.js';
import { Shortcuts } from '../js/ui/shortcuts-view.js';
import { equal, ok, test } from './harness.js';

const press = (key, more = {}) => ({ key, target: document.body, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...more });

/** The Programar tab of a session with nothing saved, and what its program shows. */
function programTab() {
  const tuning = { ...DEFAULT_TUNING, stepMs: 0, quarterTurnMs: 0 };
  const simulator = new Simulator({ tuning, beeper: { play() {} } });
  const saved = {};
  const board = new MissionBoard({ store: { load: (key, fallback) => saved[key] ?? fallback, save: (key, value) => (saved[key] = value) } });
  const view = new ProgramView({ hub: new RobotHub(simulator, tuning), simulator, tuning, board, tutorial: new Tutorial(), onPlayLesson() {}, onShowMissions() {}, onShowMore() {} });
  // A mission of its own, with no program saved: free play would open whatever this browser has kept.
  for (const id of ['keys', MAP_MISSIONS[0].id]) localStorage.removeItem(`ola-mbot:program:${id}`);
  board.start({ id: 'keys', icon: '⌨️', title: 'Teclas', goal: '', hint: '', world: {}, check: () => false });
  const blocks = () => [...view.element.querySelectorAll('.editor .block')].map((block) => [block.querySelector('.block-label').textContent, block.querySelector('.block-value')?.textContent ?? ''].join(' ').trim());
  return { view, board, simulator, blocks, type: (...keys) => keys.map((key) => view.onKey(press(key))) };
}

test('shortcuts: every key has its own block, and no key does two things', () => {
  for (const { block, cap } of BLOCK_KEYS) ok(BLOCKS[block], `${cap} adds "${block}", which is not a block`);
  const keys = [...BLOCK_KEYS.map((item) => item.key), ...Object.values(GLOBAL_KEYS), PROGRAM_KEYS.run, ...PROGRAM_KEYS.remove, PROGRAM_KEYS.home];
  equal(new Set(keys).size, keys.length);
  ok(keys.every((key) => !/^[0-9]$/.test(key)), 'the digits are for the tabs');
});

test('shortcuts: the arrows write a program, and the same arrow again makes its block one larger', () => {
  const { blocks, type } = programTab();
  equal(type('ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'), Array(8).fill(true));
  equal(blocks(), ['Andar em frente 3 passos', 'Virar à direita um quarto de volta', 'Andar em frente 1 passo', 'Virar à esquerda meia volta', 'Virar à esquerda um quarto de volta']);
});

test('shortcuts: a move that cannot take more steps is followed by a new block', () => {
  const { blocks, type } = programTab();
  type(...Array(6).fill('ArrowDown'));
  equal(blocks(), ['Andar para trás 5 passos', 'Andar para trás 1 passo']);
});

test('shortcuts: letters add the other blocks, in either case, and Backspace takes the last one away', () => {
  const { blocks, type } = programTab();
  type('c', 'N', 'e', 'e', 'x');
  equal(blocks(), ['Acender as luzes vermelho', 'Tocar a nota Dó', 'Esperar 2 segundos', 'Apagar as luzes']);
  equal(type('Backspace', 'Delete'), [true, true]);
  equal(blocks(), ['Acender as luzes vermelho', 'Tocar a nota Dó']);
  type('Backspace', 'Backspace');
  equal(type('Backspace'), [false], 'with nothing left to take away:');
});

test('shortcuts: a block typed after «Repetir» goes inside it', () => {
  const { view, type } = programTab();
  type('r', 'ArrowUp', 'ArrowUp');
  const inside = view.element.querySelector('.editor .block .block-list .block');
  equal(inside?.querySelector('.block-value').textContent, '2 passos');
});

test('shortcuts: «Apanhar» and «Largar» have keys on a printed map only', () => {
  const { blocks, board, type } = programTab();
  equal(type('a', 'l'), [false, false]);
  board.start(MAP_MISSIONS[0]);
  equal(type('a', 'l'), [true, true]);
  equal(blocks(), ['Apanhar', 'Largar']);
});

test('shortcuts: Enter starts the program, and I puts the robot back at the start', async () => {
  const { view, simulator, type } = programTab();
  type('ArrowUp', 'ArrowUp');
  equal(type('Enter'), [true]);
  for (let i = 0; i < 100 && view.running; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  equal([simulator.cell.x, simulator.cell.y], [1, 2], 'the robot went two steps up:');
  type('i');
  equal([simulator.cell.x, simulator.cell.y], [1, 4]);
});

/** The shortcuts of an app with three tabs, and what its keys were asked to do. */
function shortcuts(currentTab = 'programar') {
  const done = [];
  const tabs = [{ id: 'aprender', label: 'Aprender' }, { id: 'programar', label: 'Programar' }, { id: 'conduzir', label: 'Conduzir' }];
  const actions = {
    showTab: (id) => done.push(`tab ${id}`),
    currentTab: () => currentTab,
    stopAll: () => done.push('stop'),
    toggleSound: () => done.push('sound'),
    connect: () => done.push('connect'),
    programKey: (event) => Boolean(done.push(`program ${event.key}`)),
  };
  return { keys: new Shortcuts({ tabs, actions }), done };
}

test('shortcuts: digits open the tabs, Esc stops everything, S and B are the sound and the robot', () => {
  const { keys, done } = shortcuts();
  equal(['2', '3', 'Escape', 's', 'B', '9'].map((key) => keys.handle(press(key))), [true, true, true, true, true, true]);
  equal(done, ['tab programar', 'tab conduzir', 'stop', 'sound', 'connect', 'program 9']);
});

test('shortcuts: the keys of Programar only work on that tab', () => {
  const elsewhere = shortcuts('conduzir');
  equal(elsewhere.keys.handle(press('ArrowUp')), false);
  equal(elsewhere.done, []);
  const there = shortcuts('programar');
  equal(there.keys.handle(press('ArrowUp')), true);
  equal(there.done, ['program ArrowUp']);
});

test('shortcuts: a key typed in a box, held down, or pressed with Ctrl or ⌘ is not a shortcut', () => {
  const { keys, done } = shortcuts();
  const box = document.createElement('input');
  equal(keys.handle(press('2', { target: box })), false);
  equal(keys.handle(press('s', { metaKey: true })), false);
  equal(keys.handle(press('s', { ctrlKey: true })), false);
  equal(keys.handle(press('ArrowUp', { repeat: true })), false);
  equal(done, []);
});

test('shortcuts: Enter on a button that has the keyboard is left to that button', () => {
  const { keys, done } = shortcuts();
  equal(keys.handle(press('Enter', { target: document.createElement('button') })), false);
  equal(keys.handle(press('Enter')), true);
  equal(done, ['program Enter']);
});

test('shortcuts: ? opens and closes the list, which names every key; behind it the other keys rest', () => {
  const { keys, done } = shortcuts();
  document.body.append(keys.dialog);
  try {
    equal(keys.handle(press('?')), true);
    ok(keys.dialog.open, 'the list did not open');
    equal(keys.handle(press('2')), false);
    equal(done, []);
    const shown = [...keys.dialog.querySelectorAll('kbd')].map((cap) => cap.textContent);
    for (const { cap } of BLOCK_KEYS) ok(shown.includes(cap), `${cap} is not in the list`);
    for (const cap of ['?', 'Esc', 'S', 'B', 'Enter', '⌫', 'I', '1 … 3']) ok(shown.includes(cap), `${cap} is not in the list`);
    ok(keys.dialog.textContent.includes('1 Aprender, 2 Programar, 3 Conduzir'), 'the tabs are not named');
    keys.handle(press('?'));
    ok(!keys.dialog.open, 'the list did not close');
  } finally {
    keys.dialog.remove();
  }
});
