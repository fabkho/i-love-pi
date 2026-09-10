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

import { setBorderSlot } from "../slots.ts";
import { getI18nMissing, getI18nStatus, setI18nPersistentSurface } from "./i18n-kit-channel.ts";

export const I18N_SLOT_ID = "i18n";

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
  });
}

/** Called once the border is actually rendering, not merely loaded. */
export function claimPersistentSurface(): void {
  setI18nPersistentSurface(true);
}
