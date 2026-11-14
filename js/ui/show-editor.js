import { el } from '../dom.js';
import { myShow, OFF, SHOW_SPEEDS } from '../light-shows.js';
import { colorById, COLORS } from '../robot/palette.js';
import { T } from '../texts.js';

const nameOf = (color) => colorById(color)?.name ?? T.show.off;

/** A round button of one colour, or a moon for the lights off. */
function dot(color, label, onClick) {
  const hex = colorById(color)?.hex;
  return el('button', { class: 'light-dot show-dot', type: 'button', style: hex && `background:${hex}`, 'aria-label': label, onClick }, hex ? '' : '🌙');
}

/**
 * Where the child makes a light show: tap a colour to add it to the row, tap a colour of the
 * row to take it out, and choose how fast they change. Every editor shows the same show.
 */
export function createShowEditor() {
  const row = el('ol', { class: 'show-row', 'aria-label': T.show.row });
  const speeds = SHOW_SPEEDS.map((speed) =>
    el('button', { class: 'button', type: 'button', onClick: () => myShow.setSpeed(speed) }, `${speed.icon} ${T.drive.speeds[speed.id]}`),
  );
  /** The colours just taken out all at once, which can still be put back; null once the row changed again. */
  let takenOut = null;
  const clear = el('button', { class: 'button', type: 'button', onClick: clearOrUndo });

  function clearOrUndo() {
    const back = takenOut;
    takenOut = back ? null : myShow.colors;
    if (back) myShow.restore(back);
    else myShow.clear();
  }

  const palette = [...COLORS.map((color) => color.id), OFF].map((color) => dot(color, T.show.add(nameOf(color)), () => myShow.add(color)));

  function draw() {
    const { colors } = myShow;
    row.replaceChildren(
      ...(colors.length > 0
        ? colors.map((color, index) => el('li', {}, dot(color, T.show.remove(nameOf(color), index + 1), () => myShow.removeAt(index))))
        : [el('li', { class: 'hint', text: T.show.empty })]),
    );
    speeds.forEach((button, index) => button.setAttribute('aria-pressed', String(SHOW_SPEEDS[index] === myShow.speed)));
    if (colors.length > 0) takenOut = null; // the row has colours again: nothing left to put back
    clear.textContent = takenOut ? `↩️ ${T.show.undo}` : `🧽 ${T.show.clear}`;
    clear.disabled = colors.length === 0 && !takenOut;
    for (const button of palette) button.disabled = myShow.full;
  }

  myShow.addEventListener('change', draw);
  draw();
  return el(
    'div',
    { class: 'show-editor' },
    row,
    el('p', { class: 'hint', text: T.show.hint }),
    el('div', { class: 'row' }, palette),
    el('div', { class: 'row' }, speeds, clear),
  );
}
