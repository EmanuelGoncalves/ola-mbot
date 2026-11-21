/**
 * The keys that add a block to the program, in the Programar tab: `key` as the browser names
 * it (letters in lower case), `cap` as it is printed on the keyboard, and the `block` it adds.
 * Pressing the key of a move or a turn again makes the block one larger; `again` says so in the
 * list of shortcuts. A key with `onMap` only works while a printed map is open.
 */
export const BLOCK_KEYS = [
  { key: 'ArrowUp', cap: '↑', block: 'forward', again: 'Outra vez: mais um passo.' },
  { key: 'ArrowDown', cap: '↓', block: 'backward', again: 'Outra vez: mais um passo.' },
  { key: 'ArrowLeft', cap: '←', block: 'turnLeft', again: 'Outra vez: meia volta.' },
  { key: 'ArrowRight', cap: '→', block: 'turnRight', again: 'Outra vez: meia volta.' },
  { key: 'c', cap: 'C', block: 'lights' },
  { key: 'x', cap: 'X', block: 'lightsOff' },
  { key: 'n', cap: 'N', block: 'note' },
  { key: 'm', cap: 'M', block: 'music' },
  { key: 'e', cap: 'E', block: 'wait', again: 'Outra vez: mais tempo.' },
  { key: 'r', cap: 'R', block: 'repeat' },
  { key: 'a', cap: 'A', block: 'pick', onMap: true },
  { key: 'l', cap: 'L', block: 'drop', onMap: true },
];

/** The other keys of the Programar tab. */
export const PROGRAM_KEYS = { run: 'Enter', remove: ['Backspace', 'Delete'], home: 'i' };

/** The keys that work on every tab. Digits 1 to 9 open the tabs, in their order. */
export const GLOBAL_KEYS = { help: '?', stop: 'Escape', sound: 's', connect: 'b' };

/** A key as the tables above name it: letters in lower case, whatever Shift or Caps Lock say. */
export const keyOf = (event) => (event.key.length === 1 ? event.key.toLowerCase() : event.key);
