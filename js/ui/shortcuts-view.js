import { el } from '../dom.js';
import { BLOCKS } from '../program/blocks.js';
import { BLOCK_KEYS, GLOBAL_KEYS, keyOf, PROGRAM_KEYS } from '../shortcuts.js';
import { T } from '../texts.js';

const key = (cap) => el('kbd', { text: cap });

/**
 * The keyboard shortcuts: the button of the top bar, the list it opens, and what each key does.
 * `tabs` are the tabs in order (`{ id, label }`); `actions` are `showTab(id)`, `currentTab()`,
 * `stopAll()`, `toggleSound()`, `connect()` and `programKey(event)`, the keys of the Programar tab.
 */
export class Shortcuts {
  #tabs;
  #actions;

  constructor({ tabs, actions }) {
    this.#tabs = tabs;
    this.#actions = actions;
    this.dialog = el(
      'dialog',
      { class: 'dialog shortcuts', 'aria-labelledby': 'shortcuts-title' },
      el('h2', { id: 'shortcuts-title', text: T.shortcuts.title }),
      el('p', { class: 'hint', text: T.shortcuts.intro }),
      el('div', { class: 'dialog-body' }, this.#everywhere(), this.#driving(), this.#programming()),
      el('button', { class: 'button', type: 'button', onClick: () => this.dialog.close() }, T.shortcuts.close),
    );
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close(); // a tap on the backdrop
    });
    this.button = el('button', { class: 'button shortcuts-button', type: 'button', 'aria-label': T.shortcuts.title, onClick: () => this.toggle() }, '⌨️');
  }

  toggle() {
    if (this.dialog.open) return this.dialog.close();
    this.dialog.showModal();
    this.dialog.querySelector(':scope > button').focus(); // Enter or Esc closes the list again
  }

  /**
   * Does what a key press asks for and returns true, or returns false when the key is not a
   * shortcut here: while typing in a box, with Ctrl, Alt or ⌘ held, or behind an open dialog.
   */
  handle(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.target.closest?.('input, select, textarea, [contenteditable]')) return false;
    const pressed = keyOf(event);
    // On some keyboards the question mark arrives as Shift and the key it is printed on.
    if (pressed === GLOBAL_KEYS.help || (event.shiftKey && pressed === '/')) {
      this.toggle();
      return true;
    }
    // A dialog has the keyboard to itself; Esc closes it by itself.
    if (event.repeat || document.querySelector('dialog[open]') || this.dialog.open) return false;
    const { showTab, currentTab, stopAll, toggleSound, connect, programKey } = this.#actions;
    const tab = /^[1-9]$/.test(pressed) ? this.#tabs[Number(pressed) - 1] : null;
    const action = tab ? () => showTab(tab.id) : { [GLOBAL_KEYS.stop]: stopAll, [GLOBAL_KEYS.sound]: toggleSound, [GLOBAL_KEYS.connect]: connect }[pressed];
    if (action) {
      action();
      return true;
    }
    // Enter on a button that has the keyboard presses that button, as everywhere.
    if (pressed === PROGRAM_KEYS.run && event.target.closest?.('button, a, summary')) return false;
    if (event.shiftKey && pressed.startsWith('Arrow')) return false; // Shift and an arrow drive the robot
    return currentTab() === 'programar' && programKey(event);
  }

  #group(title, rows) {
    return el(
      'section',
      { class: 'shortcuts-group' },
      el('h3', { text: title }),
      el('dl', {}, rows.map(([caps, text]) => el('div', { class: 'shortcut' }, el('dt', {}, caps.map(key)), el('dd', { text })))),
    );
  }

  #everywhere() {
    return this.#group(T.shortcuts.everywhere, [
      [['?'], T.shortcuts.help],
      [[`1 … ${this.#tabs.length}`], T.shortcuts.tabs(this.#tabs.map((tab, i) => `${i + 1} ${tab.label}`).join(', '))],
      [['Esc'], T.shortcuts.stop],
      [['S'], T.shortcuts.sound],
      [['B'], T.shortcuts.connect],
    ]);
  }

  #programming() {
    const blocks = BLOCK_KEYS.map(({ cap, block, again, onMap }) => {
      const { icon, label } = BLOCKS[block];
      return [[cap], [`${icon} ${label}.`, again, onMap && T.shortcuts.onMap].filter(Boolean).join(' ')];
    });
    return this.#group(T.shortcuts.program, [...blocks, [['⌫'], T.shortcuts.remove], [['Enter'], T.shortcuts.run], [['I'], T.shortcuts.home]]);
  }

  #driving() {
    return this.#group(T.shortcuts.drive, [
      [['↑ ↓ ← →'], T.shortcuts.driveArrows],
      [['Shift', '↑ ↓ ← →'], T.shortcuts.driveShift],
    ]);
  }
}
