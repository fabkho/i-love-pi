/**
 * Slots in the editor border.
 *
 * The border has spare width in it and nothing owns that width, so this makes
 * it available: any extension can claim a slot and put a short label there,
 * without knowing anything about frames, rules, escape sequences or how narrow
 * the pane happens to be right now.
 *
 * The registry lives in the global symbol registry rather than in this module,
 * because pi loads every extension through its own jiti instance with the
 * module cache off — importing this file from elsewhere would evaluate a second
 * copy with its own empty registry. A symbol is shared even when the code
 * around it is not, which makes this usable from an extension that has never
 * heard of this one.
 *
 * A slot supplies its label longest-first, so a narrow border can show `🌐 4`
 * where it cannot show `🌐 4 missing`. That is the slot's decision to make: only
 * the slot knows which parts of its own label matter most.
 */

const REGISTRY = Symbol.for("i-love-pi.editor-border.slots");

export interface BorderSlot {
  /** Stable identity, so a source can update or withdraw its own label. */
  id: string;
  /**
   * Candidate labels, longest first. The first that fits is shown; when none
   * fit, the slot is dropped rather than shown truncated.
   *
   * A function is re-read on every render, which is how a slot changes without
   * anything having to notify anything.
   */
  labels: string[] | (() => string[]);
  /** Lower sorts closer to the start of the border. Defaults to 100. */
  order?: number;
}

interface Registry {
  slots?: Map<string, BorderSlot>;
}

function registry(): Required<Registry> {
  const container = globalThis as { [REGISTRY]?: Registry };
  const existing = (container[REGISTRY] ??= {});
  existing.slots ??= new Map<string, BorderSlot>();
  return existing as Required<Registry>;
}

/** Claim a slot, or replace what is in it. */
export function setBorderSlot(slot: BorderSlot): void {
  registry().slots.set(slot.id, slot);
}

/** Give a slot up. */
export function clearBorderSlot(id: string): void {
  registry().slots.delete(id);
}

/** Every claimed slot, in the order they should appear. */
export function getBorderSlots(): BorderSlot[] {
  return [...registry().slots.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** A slot's labels, longest first, with empties removed. */
function labelsOf(slot: BorderSlot): string[] {
  const labels = typeof slot.labels === "function" ? slot.labels() : slot.labels;
  return labels.filter((label) => label.length > 0);
}

/**
 * What to try putting in the border, from the most complete to the least.
 *
 * Every slot at its longest first, then every slot one step shorter, and so on;
 * once the shortest forms still do not fit, the last slot is dropped and the
 * ladder is walked again. So a crowded border loses detail before it loses a
 * slot, and loses the least important slot before the most important one.
 */
export function renderCandidates(slots: BorderSlot[], separator = " · "): string[] {
  const present = slots.map((slot) => ({ slot, labels: labelsOf(slot) })).filter((entry) => entry.labels.length > 0);
  if (present.length === 0) return [];

  const candidates: string[] = [];
  for (let dropped = 0; dropped < present.length; dropped += 1) {
    const kept = present.slice(0, present.length - dropped);
    const depth = Math.max(...kept.map((entry) => entry.labels.length));
    for (let step = 0; step < depth; step += 1) {
      const line = kept
        .map((entry) => entry.labels[Math.min(step, entry.labels.length - 1)])
        .join(separator);
      if (!candidates.includes(line)) candidates.push(line);
    }
  }
  return candidates;
}
