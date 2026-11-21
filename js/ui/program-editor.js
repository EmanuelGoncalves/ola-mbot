import { el } from '../dom.js';
import { MY_SHOW_ID } from '../light-shows.js';
import { BLOCKS, CATEGORIES, createBlock, valueLabel } from '../program/blocks.js';
import { T } from '../texts.js';
import { sideBySide } from './layout.js';
import { createShowEditor } from './show-editor.js';

/** The icon and name of a block, shared by the palette and the program. */
function blockFace(type) {
  const spec = BLOCKS[type];
  return [el('span', { class: 'block-icon', 'aria-hidden': 'true', text: spec.icon }), el('span', { class: 'block-label', text: spec.label })];
}

/** The list of block buttons; `onPick(type)` is called when one is tapped. */
export function createPalette(onPick) {
  return el(
    'div',
    { class: 'palette' },
    CATEGORIES.map((category) =>
      el(
        'section',
        { class: 'palette-group', 'data-family': category.id },
        el('h3', { class: 'palette-heading', text: category.name }),
        Object.keys(BLOCKS)
          .filter((type) => BLOCKS[type].category === category.id)
          .map((type) =>
            el(
              'button',
              { class: 'block-chip', type: 'button', 'data-category': category.id, 'data-type': type, onClick: () => onPick(type) },
              blockFace(type),
            ),
          ),
      ),
    ),
  );
}

/**
 * Shows the program and lets the child edit it by tapping.
 * A cursor marks where the next block from the palette will go.
 * Fires `render` each time the program is drawn again.
 */
export class ProgramEditor extends EventTarget {
  #program;
  #cursor = { parentId: null, index: 0 };
  #selectedId = null;
  /** Shown inside a light-show block set to the child's own show. */
  #showEditor = createShowEditor();
  #runningId = null;

  constructor(program) {
    super();
    this.#program = program;
    this.element = el('div', { class: 'editor' });
    program.addEventListener('change', () => this.#render());
    this.moveCursorToEnd();
  }

  /** The block that is open, or null. */
  get selected() {
    return this.#program.locate(this.#selectedId)?.block ?? null;
  }

  /** Where the next block goes: `{ parentId, index }`. */
  get cursor() {
    return { ...this.#cursor };
  }

  /** Adds a new block at the cursor. */
  add(type) {
    const block = createBlock(type);
    const at = this.#cursor;
    this.#selectedId = null;
    this.#cursor = block.body ? { parentId: block.id, index: 0 } : { parentId: at.parentId, index: at.index + 1 };
    this.#program.insert(block, at);
    this.element.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * For the keyboard: a key pressed again makes the block before the cursor one larger (one
   * more step, half a turn instead of a quarter) when it is of this `type` and can take more;
   * otherwise a new block is added.
   */
  addOrGrow(type) {
    const before = this.#beforeCursor();
    const options = BLOCKS[type].options ?? [];
    const larger = before?.type === type && typeof before.value === 'number' && !before.body ? options[options.findIndex((option) => option.value === before.value) + 1] : null;
    if (larger) this.#program.setValue(before.id, larger.value);
    else this.add(type);
  }

  /** Takes away the block before the cursor. Returns false when there is none. */
  removeLast() {
    const before = this.#beforeCursor();
    if (!before) return false;
    this.#selectedId = null;
    this.#cursor.index -= 1;
    this.#program.remove(before.id);
    return true;
  }

  #beforeCursor() {
    return this.#program.listOf(this.#cursor.parentId)?.[this.#cursor.index - 1] ?? null;
  }

  moveCursorToEnd() {
    this.#selectedId = null;
    this.#cursor = { parentId: null, index: this.#program.blocks.length };
    this.#render();
  }

  /** Marks the block being run, or none with null. */
  highlight(id) {
    this.#runningId = id;
    for (const item of this.element.querySelectorAll('.block')) {
      item.classList.toggle('is-running', item.dataset.id === id);
    }
    // On a phone the program sits below the mat: following the block would hide the robot.
    if (id && sideBySide()) this.element.querySelector('.is-running')?.scrollIntoView({ block: 'nearest' });
  }

  #render() {
    this.#syncCursor();
    this.element.replaceChildren(
      el('button', { class: 'block-start', type: 'button', onClick: () => this.#setCursor(null, 0) }, el('span', { 'aria-hidden': 'true', text: '▶️' }), T.program.start),
      this.#list(this.#program.blocks, null),
    );
    this.dispatchEvent(new Event('render'));
  }

  /** Keeps the cursor right after the selected block and inside a list that still exists. */
  #syncCursor() {
    const selected = this.#selectedId && this.#program.locate(this.#selectedId);
    if (selected) {
      this.#cursor = { parentId: selected.parent?.id ?? null, index: selected.index + 1 };
    } else {
      this.#selectedId = null;
    }
    const list = this.#program.listOf(this.#cursor.parentId);
    if (!list) this.#cursor = { parentId: null, index: this.#program.blocks.length };
    else this.#cursor.index = Math.min(this.#cursor.index, list.length);
  }

  #list(blocks, parentId) {
    const isCursor = (index) => this.#cursor.parentId === parentId && this.#cursor.index === index;
    const items = blocks.flatMap((block, index) => [isCursor(index) && this.#cursorItem(), this.#blockItem(block)]);
    items.push(isCursor(blocks.length) ? this.#cursorItem() : this.#slotItem(parentId, blocks.length));
    return el('ol', { class: 'block-list' }, items);
  }

  #cursorItem() {
    return el('li', { class: 'cursor' }, el('span', { 'aria-hidden': 'true', text: '➕' }), T.program.cursor);
  }

  #slotItem(parentId, index) {
    const label = parentId === null ? T.program.slot : T.program.slotInside;
    return el('li', {}, el('button', { class: 'slot', type: 'button', onClick: () => this.#setCursor(parentId, index) }, label));
  }

  #blockItem(block) {
    const spec = BLOCKS[block.type];
    const selected = block.id === this.#selectedId;
    const classes = ['block', selected && 'is-selected', block.id === this.#runningId && 'is-running'];
    return el(
      'li',
      { class: classes.filter(Boolean).join(' '), 'data-id': block.id, 'data-category': spec.category },
      el(
        'button',
        { class: 'block-head', type: 'button', 'aria-expanded': String(selected), onClick: () => this.#toggleSelection(block.id) },
        blockFace(block.type),
        spec.options && this.#valuePill(block, spec),
      ),
      selected && this.#toolbox(block, spec),
      spec.container && this.#list(block.body, block.id),
    );
  }

  #valuePill(block, spec) {
    const swatch = spec.options.find((option) => option.value === block.value)?.swatch;
    return el(
      'span',
      { class: 'block-value' },
      swatch && el('span', { class: 'swatch', style: `background:${swatch}` }),
      valueLabel(block),
    );
  }

  /** Choices and actions for the selected block. */
  #toolbox(block, spec) {
    const action = (name, icon, label, run) =>
      el('button', { class: 'tool', type: 'button', 'data-tool': name, onClick: run }, el('span', { 'aria-hidden': 'true', text: icon }), label);
    return el(
      'div',
      { class: 'toolbox' },
      spec.options &&
        el(
          'div',
          { class: 'options', role: 'group', 'aria-label': spec.label },
          spec.options.map((option) =>
            el(
              'button',
              {
                class: 'option',
                type: 'button',
                'data-value': option.value,
                'aria-pressed': String(option.value === block.value),
                onClick: () => this.#program.setValue(block.id, option.value),
              },
              option.swatch && el('span', { class: 'swatch', style: `background:${option.swatch}` }),
              option.label,
            ),
          ),
        ),
      block.type === 'lightShow' && block.value === MY_SHOW_ID && this.#showEditor,
      el(
        'div',
        { class: 'tools' },
        action('up', '⬆️', T.program.moveUp, () => this.#program.moveUp(block.id)),
        action('down', '⬇️', T.program.moveDown, () => this.#program.moveDown(block.id)),
        action('copy', '📑', T.program.duplicate, () => this.#duplicate(block.id)),
        action('remove', '🗑️', T.program.remove, () => this.#remove(block.id)),
      ),
    );
  }

  #toggleSelection(id) {
    this.#selectedId = this.#selectedId === id ? null : id;
    this.#render();
  }

  #setCursor(parentId, index) {
    this.#selectedId = null;
    this.#cursor = { parentId, index };
    this.#render();
  }

  /** Copies a block, with what is inside it, and opens the copy: it is the one to change next. */
  #duplicate(id) {
    const copy = this.#program.duplicate(id);
    if (!copy) return;
    this.#selectedId = copy.id;
    this.#render();
  }

  #remove(id) {
    const { parent, index } = this.#program.locate(id);
    this.#selectedId = null;
    this.#cursor = { parentId: parent?.id ?? null, index };
    this.#program.remove(id);
  }
}
