import { JINGLES } from '../jingles.js';
import { MY_SHOW_ID, SHOWS } from '../light-shows.js';
import { COLORS, NOTES } from '../robot/palette.js';

export const CATEGORIES = [
  { id: 'move', name: 'Andar' },
  { id: 'lights', name: 'Luzes' },
  { id: 'sound', name: 'Sons' },
  { id: 'control', name: 'Controlo' },
  { id: 'sense', name: 'Olhos do robô' },
  { id: 'things', name: 'Coisas do mapa' },
];

/** The families of blocks that only make sense on a printed map. */
export const MAP_CATEGORIES = ['things'];

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const numbers = (values, label) => values.map((value) => ({ value, label: label(value) }));

const TURN_OPTIONS = [
  { value: 1, label: 'um quarto de volta' },
  { value: 2, label: 'meia volta' },
];

/**
 * Every block a child can use. A block has at most one choice (`options`),
 * and `container` blocks hold other blocks inside.
 */
export const BLOCKS = {
  forward: {
    category: 'move',
    icon: '⬆️',
    label: 'Andar em frente',
    options: numbers([1, 2, 3, 4, 5], (n) => plural(n, 'passo', 'passos')),
    defaultValue: 1,
  },
  backward: {
    category: 'move',
    icon: '⬇️',
    label: 'Andar para trás',
    options: numbers([1, 2, 3, 4, 5], (n) => plural(n, 'passo', 'passos')),
    defaultValue: 1,
  },
  turnLeft: {
    category: 'move',
    icon: '↩️',
    label: 'Virar à esquerda',
    options: TURN_OPTIONS,
    defaultValue: 1,
  },
  turnRight: {
    category: 'move',
    icon: '↪️',
    label: 'Virar à direita',
    options: TURN_OPTIONS,
    defaultValue: 1,
  },
  lights: {
    category: 'lights',
    icon: '💡',
    label: 'Acender as luzes',
    options: COLORS.map((color) => ({ value: color.id, label: color.name, swatch: color.hex })),
    defaultValue: 'red',
  },
  lightsOff: {
    category: 'lights',
    icon: '🌙',
    label: 'Apagar as luzes',
  },
  lightShow: {
    category: 'lights',
    icon: '🎆',
    label: 'Espetáculo de luzes',
    options: [...SHOWS.map((show) => ({ value: show.id, label: `${show.icon} ${show.name}` })), { value: MY_SHOW_ID, label: '⭐ O meu espetáculo' }],
    defaultValue: SHOWS[0].id,
  },
  note: {
    category: 'sound',
    icon: '🎵',
    label: 'Tocar a nota',
    options: NOTES.map((note) => ({ value: note.id, label: note.name })),
    defaultValue: 'do',
  },
  music: {
    category: 'sound',
    icon: '🎶',
    label: 'Tocar a música',
    options: JINGLES.map((jingle) => ({ value: jingle.id, label: `${jingle.icon} ${jingle.name}` })),
    defaultValue: JINGLES[0].id,
  },
  wait: {
    category: 'control',
    icon: '⏱️',
    label: 'Esperar',
    options: numbers([1, 2, 3, 5], (n) => plural(n, 'segundo', 'segundos')),
    defaultValue: 1,
  },
  repeat: {
    category: 'control',
    icon: '🔁',
    label: 'Repetir',
    options: numbers([2, 3, 4, 5, 10], (n) => `${n} vezes`),
    defaultValue: 2,
    container: true,
  },
  untilObstacle: {
    category: 'sense',
    icon: '🧱',
    label: 'Andar até ver um obstáculo',
  },
  ifObstacle: {
    category: 'sense',
    icon: '👀',
    label: 'Se vir um obstáculo',
    container: true,
  },
  pick: {
    category: 'things',
    icon: '🤲',
    label: 'Apanhar',
  },
  drop: {
    category: 'things',
    icon: '📦',
    label: 'Largar',
  },
};

let lastId = 0;

/** Creates a fresh block of the given type with its default choice. */
export function createBlock(type, value) {
  const spec = BLOCKS[type];
  const block = { id: `b${++lastId}`, type };
  if (spec.options) {
    const known = spec.options.some((option) => option.value === value);
    block.value = known ? value : spec.defaultValue;
  }
  if (spec.container) block.body = [];
  return block;
}

/** The text of a block's current choice, e.g. "2 passos". */
export function valueLabel(block) {
  return BLOCKS[block.type].options?.find((option) => option.value === block.value)?.label ?? '';
}
