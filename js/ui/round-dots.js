import { el } from '../dom.js';
import { T } from '../texts.js';

/** One dot for each round an exercise asks for, filled for those already got right. */
export function roundDots(solved, rounds) {
  return el('span', { class: 'round-dots', role: 'img', 'aria-label': T.school.rounds(solved, rounds), text: '●'.repeat(solved) + '○'.repeat(rounds - solved) });
}
