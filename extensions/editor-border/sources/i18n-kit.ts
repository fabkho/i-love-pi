/**
 * The i18n kit as a border source.
 *
 * Everything specific to translations lives here: the border itself knows only
 * that something claimed a slot and gave it labels. Delete this file and the
 * border keeps working for whatever else is registered.
 *
 * The kit publishes coverage on a global channel of its own; this reads it and
 * offers it to the border, longest form first. Nothing is registered when the
 * kit is not installed, so its slot simply never appears.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { setBorderSlot } from "../slots.ts";
import { getI18nMissing, getI18nStatus, setI18nPersistentSurface } from "./i18n-kit-channel.ts";

export const I18N_SLOT_ID = "i18n";

/*
 * Coverage is a figure, and the border draws an uncoloured label in the frame's
 * own colour — `borderMuted`, which themes set a few percent off the background.
 * Legible as a rule, not as text. So the slot names its colours.
 *
 * Both are theme *tokens*, not palette names: pi's `ThemeColor` vocabulary is
 * semantic, and has no `purple` in it. Clean coverage takes the same green as
 * pi's cost readout; missing keys borrow the palette's purple from
 * `syntaxKeyword`, the token that carries it. `warning` is the other token that
 * means "needs attention" — swap either constant if the semantics matter more
 * than the colour.
 */
const CLEAN_COVERAGE: ThemeColor = "success";
const MISSING_KEYS: ThemeColor = "syntaxKeyword";

/**
 * Offer coverage to the border, and tell the kit's widget it need not announce
 * the standing figure itself.
 */
export function registerI18nSlot(): void {
  setBorderSlot({
    id: I18N_SLOT_ID,
    order: 50,
    labels: () => {
      const status = getI18nStatus();
      if (!status) return [];
      const missing = getI18nMissing();
      const labels = [status];
      // "🌐 4" where "🌐 4 missing" will not fit; the marker alone below that.
      if (missing !== undefined && missing > 0) labels.push(`🌐 ${missing}`);
      labels.push("🌐");
      return labels;
    },
    /*
     * Coloured by what it reports, because a count is a figure and the border
     * draws an uncoloured label in `borderMuted` — a quiet-rule colour, close
     * to the background, not something you can read. So the slot says its own.
     *
     * Re-read every render: coverage changes as the kit runs, and the colour
     * has to follow it rather than settle at whatever it was at load.
     *
     * Known caveat: at zero missing the label reads `🌐 ✓` in the same green as
     * the cost readout, so when the border is crowded the two blend into one
     * green run. `accent` (blue) separates them if that bothers you.
     */
    color: () => ((getI18nMissing() ?? 0) > 0 ? MISSING_KEYS : CLEAN_COVERAGE),
  });
}

/** Called once the border is actually rendering, not merely loaded. */
export function claimPersistentSurface(): void {
  setI18nPersistentSurface(true);
}
