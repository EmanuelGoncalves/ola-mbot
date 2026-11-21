import { noteById } from './robot/palette.js';
import { sleep } from './timing.js';

const BEAT_MS = 280;
/** The part of each beat that sounds; the rest is a short gap between notes. */
const SOUNDING = 0.85;

/**
 * Short tunes for the buzzer. They use only the eight notes of the piano, so a
 * child can copy them with «Tocar a nota» blocks. Each note is [note id, beats].
 * Those marked "original" were written for this app; the others are the opening
 * lines of traditional tunes, old enough to be free for everyone to play. A siren
 * is not a tune at all: two notes, over and over.
 * They are also the choices of the «Tocar a música» block.
 */
export const JINGLES = [
  {
    id: 'hello', // original
    icon: '👋',
    name: 'Olá, mBot!',
    notes: [['do', 1], ['mi', 1], ['sol', 1], ['do2', 2], ['sol', 1], ['do2', 3]],
  },
  {
    id: 'victory', // original
    icon: '🏆',
    name: 'Vitória',
    notes: [['sol', 0.5], ['sol', 0.5], ['sol', 0.5], ['do2', 2], ['la', 0.5], ['si', 0.5], ['do2', 3]],
  },
  {
    id: 'robot-dance', // original
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
    id: 'space', // original
    icon: '🚀',
    name: 'Aventura no espaço',
    notes: [
      ['do', 1], ['sol', 1], ['mi', 1], ['sol', 1], ['do2', 2], ['la', 1], ['sol', 1],
      ['fa', 1], ['la', 1], ['sol', 1], ['mi', 1], ['re', 1], ['sol', 1], ['do2', 3],
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
  {
    id: 'birthday',
    icon: '🎂',
    name: 'Parabéns a você',
    notes: [
      ['do', 0.75], ['do', 0.25], ['re', 1], ['do', 1], ['fa', 1], ['mi', 2],
      ['do', 0.75], ['do', 0.25], ['re', 1], ['do', 1], ['sol', 1], ['fa', 2],
    ],
  },
  {
    id: 'frere-jacques',
    icon: '🛎️',
    name: 'Frère Jacques',
    notes: [
      ['do', 1], ['re', 1], ['mi', 1], ['do', 1], ['do', 1], ['re', 1], ['mi', 1], ['do', 1],
      ['mi', 1], ['fa', 1], ['sol', 2], ['mi', 1], ['fa', 1], ['sol', 2],
      ['sol', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 1], ['do', 1],
      ['sol', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 1], ['do', 2],
    ],
  },
  {
    id: 'can-can',
    icon: '💃',
    name: 'Cancã',
    notes: [
      ['do', 1], ['re', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['sol', 1], ['sol', 1],
      ['sol', 0.5], ['la', 0.5], ['mi', 0.5], ['fa', 0.5], ['re', 1], ['re', 1],
      ['re', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['do', 0.5], ['do2', 0.5], ['si', 0.5], ['la', 0.5],
      ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['do', 2],
    ],
  },
  {
    id: 'cucaracha',
    icon: '🌵',
    name: 'La Cucaracha',
    notes: [
      ['do', 0.5], ['do', 0.5], ['do', 0.5], ['fa', 1.5], ['la', 1],
      ['do', 0.5], ['do', 0.5], ['do', 0.5], ['fa', 1.5], ['la', 1],
      ['fa', 1], ['fa', 0.5], ['mi', 0.5], ['mi', 0.5], ['re', 0.5], ['re', 0.5], ['do', 2],
    ],
  },
  {
    id: 'susanna',
    icon: '🪕',
    name: 'Oh! Susana',
    notes: [
      ['do', 0.5], ['re', 0.5], ['mi', 1], ['sol', 1], ['sol', 1.5], ['la', 0.5], ['sol', 1], ['mi', 1], ['do', 1.5], ['re', 0.5],
      ['mi', 1], ['mi', 1], ['re', 1], ['do', 1], ['re', 3],
      ['do', 0.5], ['re', 0.5], ['mi', 1], ['sol', 1], ['sol', 1.5], ['la', 0.5], ['sol', 1], ['mi', 1], ['do', 1.5], ['re', 0.5],
      ['mi', 1], ['mi', 1], ['re', 1], ['re', 1], ['do', 3],
    ],
  },
  {
    id: 'robot-march', // original
    icon: '🦾',
    name: 'Marcha dos robôs',
    notes: [
      ['do', 1], ['do', 0.5], ['do', 0.5], ['sol', 1], ['sol', 1], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 2],
      ['re', 1], ['re', 0.5], ['re', 0.5], ['la', 1], ['la', 1], ['si', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 2],
      ['do2', 1], ['sol', 1], ['mi', 1], ['sol', 1], ['do', 3],
    ],
  },
  {
    id: 'up-and-down', // original
    icon: '🎢',
    name: 'Sobe e desce',
    notes: [
      ['do', 0.5], ['re', 0.5], ['mi', 0.5], ['fa', 0.5], ['sol', 0.5], ['la', 0.5], ['si', 0.5], ['do2', 1.5],
      ['si', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['do', 1.5],
      ['mi', 0.5], ['sol', 0.5], ['do2', 2],
    ],
  },
  {
    id: 'clumsy-march', // original
    icon: '🤡',
    name: 'Marcha trapalhona',
    notes: [
      ['do', 0.5], ['sol', 0.5], ['mi', 0.5], ['sol', 0.5], ['do', 0.5], ['sol', 0.5], ['mi', 1],
      ['re', 0.5], ['sol', 0.5], ['fa', 0.5], ['sol', 0.5], ['re', 0.5], ['sol', 0.5], ['fa', 1],
      ['mi', 0.5], ['do2', 0.5], ['si', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5],
      ['do', 1], ['sol', 1], ['do', 2],
    ],
  },
  {
    id: 'mary-lamb',
    icon: '🐑',
    name: 'O cordeirinho da Maria',
    notes: [
      ['mi', 1], ['re', 1], ['do', 1], ['re', 1], ['mi', 1], ['mi', 1], ['mi', 2],
      ['re', 1], ['re', 1], ['re', 2], ['mi', 1], ['sol', 1], ['sol', 2],
      ['mi', 1], ['re', 1], ['do', 1], ['re', 1], ['mi', 1], ['mi', 1], ['mi', 1], ['mi', 1],
      ['re', 1], ['re', 1], ['mi', 1], ['re', 1], ['do', 4],
    ],
  },
  {
    id: 'row-boat',
    icon: '🚣',
    name: 'Rema, rema o barco',
    notes: [
      ['do', 1.5], ['do', 1.5], ['do', 1], ['re', 0.5], ['mi', 1.5],
      ['mi', 1], ['re', 0.5], ['mi', 1], ['fa', 0.5], ['sol', 3],
      ['do2', 0.5], ['do2', 0.5], ['do2', 0.5], ['sol', 0.5], ['sol', 0.5], ['sol', 0.5],
      ['mi', 0.5], ['mi', 0.5], ['mi', 0.5], ['do', 0.5], ['do', 0.5], ['do', 0.5],
      ['sol', 1], ['fa', 0.5], ['mi', 1], ['re', 0.5], ['do', 3],
    ],
  },
  {
    id: 'london-bridge',
    icon: '🌉',
    name: 'A ponte de Londres',
    notes: [
      ['sol', 1.5], ['la', 0.5], ['sol', 1], ['fa', 1], ['mi', 1], ['fa', 1], ['sol', 2],
      ['re', 1], ['mi', 1], ['fa', 2], ['mi', 1], ['fa', 1], ['sol', 2],
      ['sol', 1.5], ['la', 0.5], ['sol', 1], ['fa', 1], ['mi', 1], ['fa', 1], ['sol', 2],
      ['re', 2], ['sol', 2], ['mi', 1], ['do', 3],
    ],
  },
  {
    id: 'three-mice',
    icon: '🐭',
    name: 'Três ratinhos cegos',
    notes: [
      ['mi', 1.5], ['re', 1.5], ['do', 3], ['mi', 1.5], ['re', 1.5], ['do', 3],
      ['sol', 1.5], ['fa', 1], ['fa', 0.5], ['mi', 3], ['sol', 1.5], ['fa', 1], ['fa', 0.5], ['mi', 3],
    ],
  },
  {
    id: 'saints',
    icon: '🎺',
    name: 'Os santos a marchar',
    notes: [
      ['do', 1], ['mi', 1], ['fa', 1], ['sol', 4], ['do', 1], ['mi', 1], ['fa', 1], ['sol', 4],
      ['do', 1], ['mi', 1], ['fa', 1], ['sol', 2], ['mi', 2], ['do', 2], ['mi', 2], ['re', 4],
      ['mi', 1], ['mi', 1], ['re', 1], ['do', 3], ['do', 1], ['mi', 2], ['sol', 2], ['sol', 1], ['fa', 3],
      ['mi', 1], ['fa', 1], ['sol', 2], ['mi', 2], ['do', 2], ['re', 2], ['do', 4],
    ],
  },
  {
    id: 'lullaby',
    icon: '😴',
    name: 'Canção de embalar',
    notes: [
      ['mi', 0.5], ['mi', 0.5], ['sol', 2], ['mi', 0.5], ['mi', 0.5], ['sol', 2],
      ['mi', 0.5], ['sol', 0.5], ['do2', 1], ['si', 1.5], ['la', 0.5], ['la', 1], ['sol', 2],
      ['re', 0.5], ['mi', 0.5], ['fa', 1], ['re', 1.5], ['re', 0.5], ['mi', 0.5], ['fa', 2],
      ['re', 0.5], ['fa', 0.5], ['si', 0.5], ['la', 0.5], ['sol', 1], ['si', 1], ['do2', 3],
    ],
  },
  {
    id: 'old-macdonald',
    icon: '🚜',
    name: 'A quinta do tio Manel',
    notes: [
      ['fa', 1], ['fa', 1], ['fa', 1], ['do', 1], ['re', 1], ['re', 1], ['do', 2],
      ['la', 1], ['la', 1], ['sol', 1], ['sol', 1], ['fa', 3], ['do', 1],
      ['fa', 1], ['fa', 1], ['fa', 1], ['do', 1], ['re', 1], ['re', 1], ['do', 2],
      ['la', 1], ['la', 1], ['sol', 1], ['sol', 1], ['fa', 4],
    ],
  },
  {
    id: 'clair-de-lune',
    icon: '🌛',
    name: 'Ao luar',
    notes: [
      ['do', 1], ['do', 1], ['do', 1], ['re', 1], ['mi', 2], ['re', 2], ['do', 1], ['mi', 1], ['re', 1], ['re', 1], ['do', 4],
      ['do', 1], ['do', 1], ['do', 1], ['re', 1], ['mi', 2], ['re', 2], ['do', 1], ['mi', 1], ['re', 1], ['re', 1], ['do', 4],
    ],
  },
  {
    id: 'alouette',
    icon: '🐦',
    name: 'Alouette',
    notes: [
      ['fa', 1.5], ['sol', 0.5], ['la', 1], ['la', 1], ['sol', 0.5], ['fa', 0.5], ['sol', 0.5], ['la', 0.5], ['fa', 1], ['do', 1],
      ['fa', 1.5], ['sol', 0.5], ['la', 1], ['la', 1], ['sol', 0.5], ['fa', 0.5], ['sol', 0.5], ['la', 0.5], ['fa', 2],
    ],
  },
  {
    id: 'jingle-bells-chorus',
    icon: '🛷',
    name: 'Jingle Bells (o refrão todo)',
    notes: [
      ['mi', 1], ['mi', 1], ['mi', 2], ['mi', 1], ['mi', 1], ['mi', 2],
      ['mi', 1], ['sol', 1], ['do', 1.5], ['re', 0.5], ['mi', 4],
      ['fa', 1], ['fa', 1], ['fa', 1.5], ['fa', 0.5], ['fa', 1], ['mi', 1], ['mi', 1], ['mi', 0.5], ['mi', 0.5],
      ['mi', 1], ['re', 1], ['re', 1], ['mi', 1], ['re', 2], ['sol', 2],
    ],
  },
  {
    id: 'merry-christmas',
    icon: '🎄',
    name: 'We Wish You a Merry Christmas',
    notes: [
      ['do', 1], ['fa', 1], ['fa', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 1], ['re', 1], ['re', 1],
      ['sol', 1], ['sol', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 1], ['do', 1], ['do', 0.5], ['do', 0.5],
      ['re', 1], ['sol', 1], ['mi', 1], ['fa', 3],
    ],
  },
  {
    id: 'joy-to-the-world',
    icon: '🌟',
    name: 'Joy to the World',
    notes: [
      ['do2', 2], ['si', 1.5], ['la', 0.5], ['sol', 3], ['fa', 1], ['mi', 2], ['re', 2], ['do', 3],
      ['sol', 1], ['la', 3], ['la', 1], ['si', 3], ['si', 1], ['do2', 4],
    ],
  },
  {
    id: 'saint-nicholas',
    icon: '🎅',
    name: 'São Nicolau',
    notes: [
      ['la', 1], ['la', 1], ['la', 1], ['la', 1], ['sol', 1], ['sol', 1], ['sol', 2],
      ['fa', 1], ['fa', 1], ['fa', 1], ['fa', 1], ['la', 4],
      ['re', 1], ['re', 1], ['re', 1], ['re', 1], ['do', 1], ['do', 1], ['fa', 2],
      ['sol', 1], ['fa', 1], ['sol', 1], ['la', 1], ['sol', 4],
    ],
  },
  {
    id: 'christmas-bells', // original
    icon: '🔔',
    name: 'Sinos de Natal',
    notes: [
      ['do2', 1], ['la', 1], ['sol', 1], ['mi', 1], ['do2', 1], ['la', 1], ['sol', 2],
      ['fa', 0.5], ['sol', 0.5], ['la', 1], ['sol', 0.5], ['la', 0.5], ['si', 1],
      ['do2', 1], ['sol', 1], ['mi', 1], ['sol', 1], ['do2', 4],
    ],
  },
  {
    id: 'police-siren',
    icon: '🚓',
    name: 'Sirene da polícia',
    notes: [['la', 1.5], ['mi', 1.5], ['la', 1.5], ['mi', 1.5], ['la', 1.5], ['mi', 1.5], ['la', 1.5], ['mi', 1.5]],
  },
  {
    id: 'ambulance-siren',
    icon: '🚑',
    name: 'Sirene da ambulância',
    notes: [['do2', 0.75], ['sol', 0.75], ['do2', 0.75], ['sol', 0.75], ['do2', 0.75], ['sol', 0.75], ['do2', 0.75], ['sol', 0.75], ['do2', 0.75], ['sol', 0.75], ['do2', 0.75], ['sol', 0.75]],
  },
  {
    id: 'fire-engine',
    icon: '🚒',
    name: 'Carro dos bombeiros',
    notes: [
      ['do', 0.5], ['re', 0.5], ['mi', 0.5], ['fa', 0.5], ['sol', 0.5], ['la', 0.5], ['si', 0.5], ['do2', 1.5],
      ['si', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['do', 1.5],
      ['do', 0.5], ['re', 0.5], ['mi', 0.5], ['fa', 0.5], ['sol', 0.5], ['la', 0.5], ['si', 0.5], ['do2', 1.5],
      ['si', 0.5], ['la', 0.5], ['sol', 0.5], ['fa', 0.5], ['mi', 0.5], ['re', 0.5], ['do', 1.5],
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
