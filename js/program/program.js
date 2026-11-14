import { BLOCKS, createBlock } from './blocks.js';

/**
 * A program is a list of blocks; container blocks keep their own list in `body`.
 * Fires `change` after every edit.
 */
export class Program extends EventTarget {
  blocks = [];

  /** Finds a block: its list, its index there and its container (or null at the top). */
  locate(id, list = this.blocks, parent = null) {
    for (const [index, block] of list.entries()) {
      if (block.id === id) return { list, index, block, parent };
      const inside = block.body && this.locate(id, block.body, block);
      if (inside) return inside;
    }
    return null;
  }

  /** The list held by a container, or the top list when `parentId` is null. */
  listOf(parentId) {
    return parentId === null ? this.blocks : (this.locate(parentId)?.block.body ?? null);
  }

  /** Every block, containers before their contents. */
  all(list = this.blocks) {
    return list.flatMap((block) => [block, ...(block.body ? this.all(block.body) : [])]);
  }

  insert(block, { parentId = null, index } = {}) {
    const list = this.listOf(parentId) ?? this.blocks;
    list.splice(index ?? list.length, 0, block);
    this.#changed();
  }

  remove(id) {
    const found = this.locate(id);
    if (!found) return;
    found.list.splice(found.index, 1);
    this.#changed();
  }

  /**
   * Puts a copy of a block right after it, with its choice and, for a container, a copy of
   * everything inside. Returns the copy.
   */
  duplicate(id) {
    const found = this.locate(id);
    if (!found) return null;
    const [copy] = Program.revive(this.serialize([found.block]));
    found.list.splice(found.index + 1, 0, copy);
    this.#changed();
    return copy;
  }

  setValue(id, value) {
    const found = this.locate(id);
    if (!found) return;
    found.block.value = value;
    this.#changed();
  }

  /** Moves a block one place up: into the container above it, or out of its own. */
  moveUp(id) {
    const found = this.locate(id);
    if (!found) return;
    const { list, index, block, parent } = found;
    if (index > 0) {
      const above = list[index - 1];
      list.splice(index, 1);
      if (above.body) above.body.push(block);
      else list.splice(index - 1, 0, block);
    } else if (parent) {
      list.splice(index, 1);
      const outer = this.locate(parent.id);
      outer.list.splice(outer.index, 0, block);
    }
    this.#changed();
  }

  /** Moves a block one place down: into the container below it, or out of its own. */
  moveDown(id) {
    const found = this.locate(id);
    if (!found) return;
    const { list, index, block, parent } = found;
    if (index < list.length - 1) {
      const below = list[index + 1];
      list.splice(index, 1);
      if (below.body) below.body.unshift(block);
      else list.splice(index + 1, 0, block);
    } else if (parent) {
      list.splice(index, 1);
      const outer = this.locate(parent.id);
      outer.list.splice(outer.index + 1, 0, block);
    }
    this.#changed();
  }

  clear() {
    this.replace([]);
  }

  replace(blocks) {
    this.blocks = blocks;
    this.#changed();
  }

  /** Plain data for saving: types, choices and nested bodies. */
  serialize(list = this.blocks) {
    return list.map(({ type, value, body }) => ({ type, value, body: body && this.serialize(body) }));
  }

  /** Rebuilds blocks from saved data, skipping anything this version does not know. */
  static revive(data) {
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && Object.hasOwn(BLOCKS, item.type))
      .map((item) => {
        const block = createBlock(item.type, item.value);
        if (block.body) block.body = Program.revive(item.body);
        return block;
      });
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }
}
