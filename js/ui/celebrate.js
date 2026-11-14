import { el } from '../dom.js';

const SYMBOLS = ['⭐', '🌟', '✨', '🎉'];
const PIECES = 18;
const DURATION_MS = 2600;

/** Lets a few stars fall over the page. */
export function celebrate() {
  const pieces = Array.from({ length: PIECES }, (_, index) =>
    el('span', {
      text: SYMBOLS[index % SYMBOLS.length],
      style: `left:${Math.random() * 94}%; animation-delay:${Math.random() * 0.5}s`,
    }),
  );
  const layer = el('div', { class: 'celebration', 'aria-hidden': 'true' }, pieces);
  document.body.append(layer);
  setTimeout(() => layer.remove(), DURATION_MS + 600);
}
