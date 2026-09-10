/**
 * Labels in the editor border.
 *
 * The border already carries the things you glance at — branch, model, context
 * — and it has spare width between them. This makes that width available to any
 * extension: claim a slot, give it a short label, and it appears in the frame
 * you are already reading. See `slots.ts` for the contract.
 *
 * The border itself knows nothing about what it is showing. Sources under
 * `sources/` do; each one is deletable without touching anything here.
 *
 * How it gets there: pi's editor chrome is drawn by whichever extension owns
 * the editor component, and its metadata set is closed — there is no slot to
 * ask for. So this wraps the installed editor and places labels into the rule
 * of a border afterwards, consuming spare width rather than adding any. That is
 * surgery on someone else's output, so it is written to fail by doing nothing:
 * no editor, no border, an unfamiliar frame or a line too narrow, and the
 * editor renders exactly as it would have.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { injectFirstThatFits, isBottomBorder, isTopBorder } from "./border.ts";
import { getBorderSlots, renderCandidates } from "./slots.ts";
import { claimPersistentSurface, registerI18nSlot } from "./sources/i18n-kit.ts";

/**
 * Derived from the API rather than imported: the type is part of pi's editor
 * contract but not re-exported from its entry point, and deriving it means this
 * follows the contract wherever it goes.
 */
type EditorFactory = NonNullable<ReturnType<NonNullable<ExtensionContext["ui"]["getEditorComponent"]>>>;

/** Which edge of the frame carries the labels. */
type Placement = "top" | "bottom";

function placement(): Placement {
  return process.env.PI_BORDER_PLACEMENT === "top" ? "top" : "bottom";
}

/** Marks a factory as ours, so a re-check does not wrap a wrapper. */
const WRAPPED = Symbol.for("i-love-pi.editor-border.wrapped");
/** Marks an instance whose render has already been patched. */
const PATCHED = Symbol.for("i-love-pi.editor-border.patched");

/** How long to keep looking for an editor to wrap, and how often. */
const WRAP_RETRY_MS = 50;
const WRAP_TIMEOUT_MS = 3_000;

/**
 * Make a component's border carry the registered labels.
 *
 * The component is patched in place and returned as itself, rather than wrapped
 * in a second object that delegates to it. An editor keeps its state in its own
 * fields and mutates them from its own methods, so a delegating wrapper ends up
 * owning half of that state: keystrokes land on the wrapper, rendering reads the
 * original, and the editor stops responding. One object, one state, one patched
 * method.
 */
function labelBorder(editor: EditorComponent, style: (text: string) => string): EditorComponent {
  const target = editor as EditorComponent & { [PATCHED]?: boolean };
  if (target[PATCHED]) return editor;
  target[PATCHED] = true;

  const original = editor.render.bind(editor);
  const wanted = placement();
  const matches = wanted === "top" ? isTopBorder : isBottomBorder;

  editor.render = (width: number): string[] => {
    const lines = original(width);
    const candidates = renderCandidates(getBorderSlots()).map(style);
    if (candidates.length === 0) return lines;

    // Searched from the bottom for a bottom edge, from the top for a top one,
    // so a frame with autocomplete rows below the input is still labelled on
    // its own edge rather than somewhere in the list.
    const order =
      wanted === "top"
        ? lines.map((_line, index) => index)
        : lines.map((_line, index) => lines.length - 1 - index);

    for (const index of order) {
      const line = lines[index]!;
      if (!matches(line)) continue;
      const labelled = injectFirstThatFits(line, candidates);
      if (labelled === line) break;
      const next = [...lines];
      next[index] = labelled;
      return next;
    }
    return lines;
  };

  return editor;
}

export default function editorBorder(pi: ExtensionAPI): void {
  registerI18nSlot();

  const ensureWrapped = (ctx: ExtensionContext): boolean => {
    const current: EditorFactory | undefined = ctx.ui.getEditorComponent?.();
    // Nothing to wrap: pi's own editor is not exposed as a factory, and taking
    // it over would mean reimplementing someone else's frame to add a label.
    if (!current) return false;
    if ((current as { [WRAPPED]?: boolean })[WRAPPED]) return true;

    const wrapped: EditorFactory = (tui, theme, keybindings) =>
      // Styled with the frame's own colour: a label in chrome that introduces a
      // colour of its own stops looking like part of the chrome. Unstyled if the
      // host offers no border colour — a label is still better than a crash.
      labelBorder(
        current(tui, theme, keybindings),
        typeof theme?.borderColor === "function" ? theme.borderColor : (text: string) => text,
      );
    (wrapped as { [WRAPPED]?: boolean })[WRAPPED] = true;
    ctx.ui.setEditorComponent?.(wrapped);
    claimPersistentSurface();
    return true;
  };

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    if (process.env.PI_BORDER === "off") return;
    if (ensureWrapped(ctx)) return;

    /*
     * The editor this wraps is installed by another extension, in its own
     * session_start handler, and handlers run in load order — so whether one
     * exists yet depends on which package the settings happen to list first.
     * Rather than depend on that, keep looking for a short while.
     */
    const deadline = Date.now() + WRAP_TIMEOUT_MS;
    const timer = setInterval(() => {
      if (ensureWrapped(ctx) || Date.now() > deadline) clearInterval(timer);
    }, WRAP_RETRY_MS);
    timer.unref?.();
  });

  // An editor installed later still gets wrapped: extensions re-install theirs
  // when their own settings change.
  pi.on("turn_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI || process.env.PI_BORDER === "off") return;
    ensureWrapped(ctx);
  });
}
