import { noteById } from './robot/palette.js';
import { sleep } from './timing.js';

const BEAT_MS = 280;
/** The part of each beat that sounds; the rest is a short gap between notes. */
const SOUNDING = 0.85;

/**
 * Short tunes for the buzzer. They use only the eight notes of the piano, so a
 * child can copy them with «Tocar a nota» blocks. Each note is [note id, beats].
 * The first three were written for this app; the others are traditional tunes.
 */
export const JINGLES = [
  {
    id: 'hello',
    icon: '👋',
    name: 'Olá, mBot!',
    notes: [['do', 1], ['mi', 1], ['sol', 1], ['do2', 2], ['sol', 1], ['do2', 3]],
  },
  {
    id: 'victory',
    icon: '🏆',
    name: 'Vitória',
    notes: [['sol', 0.5], ['sol', 0.5], ['sol', 0.5], ['do2', 2], ['la', 0.5], ['si', 0.5], ['do2', 3]],
  },
  {
    id: 'robot-dance',
    icon: '🤖',
    name: 'Dança do robô',
    notes: [
      ['do', 1], ['mi', 0.5], ['mi', 0.5], ['sol', 1], ['mi', 1],
      ['fa', 1], ['la', 0.5], ['la', 0.5], ['sol', 2],
      ['do2', 1], ['si', 0.5], ['la', 0.5], ['sol', 1], ['mi', 1],
      ['re', 1], ['sol', 1], ['do', 2],
    ],
  },
  {
    id: 'twinkle',
    icon: '⭐',
    name: 'Brilha, brilha, lá no céu',
    notes: [
      ['do', 1], ['do', 1], ['sol', 1], ['sol', 1], ['la', 1], ['la', 1], ['sol', 2],
      ['fa', 1], ['fa', 1], ['mi', 1], ['mi', 1], ['re', 1], ['re', 1], ['do', 2],
    ],
  },
  {
    id: 'ode-to-joy',
    icon: '🎼',
    name: 'Hino da Alegria',
    notes: [
      ['mi', 1], ['mi', 1], ['fa', 1], ['sol', 1], ['sol', 1], ['fa', 1], ['mi', 1], ['re', 1],
      ['do', 1], ['do', 1], ['re', 1], ['mi', 1], ['mi', 1.5], ['re', 0.5], ['re', 2],
    ],
  },
  {
    id: 'jingle-bells',
    icon: '🔔',
    name: 'Jingle Bells',
    notes: [
      ['mi', 1], ['mi', 1], ['mi', 2], ['mi', 1], ['mi', 1], ['mi', 2],
      ['mi', 1], ['sol', 1], ['do', 1.5], ['re', 0.5], ['mi', 4],
    ],
  },
];

/**
 * Plays a jingle on `robot` (see RobotHub), one note after the other.
 * `onNote(id)` is called as each note starts; abort `signal` to stop.
 */
export async function playJingle(jingle, robot, { signal, onNote = () => {}, wait = sleep } = {}) {
  for (const [id, beats] of jingle.notes) {
    signal?.throwIfAborted();
    const ms = beats * BEAT_MS;
    onNote(id);
    await robot.playTone(noteById(id).hz, ms * SOUNDING);
    await wait(ms, signal);
  }
}
