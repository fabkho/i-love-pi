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

import { CustomEditor, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { injectFirstThatFits, isBottomBorder, isTopBorder } from "./border.ts";
import { getBorderSlots, type LabelStyler, renderCandidates } from "./slots.ts";
import { claimPersistentSurface, registerI18nSlot } from "./sources/i18n-kit.ts";

/**
 * Derived from the API rather than imported: the type is part of pi's editor
 * contract but not re-exported from its entry point, and deriving it means this
 * follows the contract wherever it goes.
 */
type EditorFactory = NonNullable<ReturnType<NonNullable<ExtensionContext["ui"]["getEditorComponent"]>>>;

/** The editor theme pi hands an editor factory — the frame's colour lives here. */
type EditorTheme = Parameters<EditorFactory>[1];

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
const DEFAULT_WRAP_TIMEOUT_MS = 3_000;

/**
 * How long to wait for another extension's editor before supplying one.
 *
 * Long enough to outlast a slow package load, short enough that a solo install
 * is not sitting on an unlabelled border. Read per session so it can be tuned
 * without a reload, and so tests need not spend the real three seconds.
 */
function wrapTimeoutMs(): number {
  const raw = Number.parseInt(process.env.PI_BORDER_WRAP_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_WRAP_TIMEOUT_MS;
}

/** Between two slots' labels in the border. */
const SEPARATOR = " · ";

/**
 * How a slot's label gets its colour.
 *
 * A slot that names no colour is drawn in the frame's own colour, so
 * decorative chrome keeps looking like chrome. A slot that names one is drawn
 * in that colour — because the frame colour is not a readable-text colour: pi
 * defines `getEditorTheme().borderColor` as `fg("borderMuted")`, which themes
 * set a few percent off the background. Right for a rule, unreadable for a
 * figure.
 *
 * The frame colour comes from the editor's own theme, which is all that theme
 * carries. The slot colour comes from pi's full theme (`ctx.ui.theme`, a live
 * getter), the only one with `fg` on it.
 *
 * An unknown token falls back to the frame colour rather than throwing: this
 * runs inside `editor.render`, once per frame, and one mistyped token must not
 * take the editor down with it.
 */
/**
 * The frame's own colour, as the editor component carries it.
 *
 * The editor theme is a narrower thing than pi's: it has `borderColor` and the
 * select-list colours, and no `fg`. Unstyled if the host offers nothing, because
 * a label is still better than a crash.
 */
function chromeOf(editorTheme: EditorTheme): (text: string) => string {
  return typeof editorTheme?.borderColor === "function" ? editorTheme.borderColor : (text: string) => text;
}
function stylerFor(chrome: (text: string) => string, currentTheme: () => Theme | undefined): LabelStyler {
  return (label, color) => {
    if (color === undefined) return chrome(label);
    try {
      // Called as a method: Theme.fg reads its colour map off `this`.
      return currentTheme()?.fg(color, label) ?? chrome(label);
    } catch {
      return chrome(label);
    }
  };
}

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
function labelBorder(editor: EditorComponent, style: LabelStyler): EditorComponent {
  const target = editor as EditorComponent & { [PATCHED]?: boolean };
  if (target[PATCHED]) return editor;
  target[PATCHED] = true;


  const original = editor.render.bind(editor);
  const wanted = placement();
  const matches = wanted === "top" ? isTopBorder : isBottomBorder;

  editor.render = (width: number): string[] => {
    const lines = original(width);
    // Labels are styled individually so each slot keeps its own colour, which
    // means the separator has to be coloured deliberately to stay chrome.
    const candidates = renderCandidates(getBorderSlots(), style(SEPARATOR, undefined), style);
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
    if (!current) return false;
    if ((current as { [WRAPPED]?: boolean })[WRAPPED]) return true;

    const wrapped: EditorFactory = (tui, editorTheme, keybindings) =>
      labelBorder(
        current(tui, editorTheme, keybindings),
        stylerFor(chromeOf(editorTheme), () => ctx.ui.theme),
      );
    (wrapped as { [WRAPPED]?: boolean })[WRAPPED] = true;
    ctx.ui.setEditorComponent?.(wrapped);
    claimPersistentSurface();
    return true;
  };

  /*
   * Nobody else supplied an editor, so supply one and label it.
   *
   * pi's own editor is only reachable through `setEditorComponent`, and its
   * default is not exposed for wrapping — which is why this extension had
   * nothing to do without a second extension present. The way in is to install
   * the same class pi installs, `CustomEditor`.
   *
   * It is the same class, not a substitute: pi wires a custom editor itself in
   * `setCustomEditorComponent` — `onSubmit` and `onChange` from the default
   * editor, the text, border colour, padding, autocomplete, and for anything
   * exposing `actionHandlers` (which `CustomEditor` does) the escape, ctrl-D and
   * paste-image handlers, extension shortcuts and every app action. So the
   * result is the default editor, with labels in its border.
   */
  const installOwnEditor = (ctx: ExtensionContext): boolean => {
    if (process.env.PI_BORDER_EDITOR === "off") return false;
    // Someone arrived while we were waiting; their editor wins.
    if (ctx.ui.getEditorComponent?.()) return ensureWrapped(ctx);

    const factory: EditorFactory = (tui, editorTheme, keybindings) =>
      labelBorder(new CustomEditor(tui, editorTheme, keybindings), stylerFor(chromeOf(editorTheme), () => ctx.ui.theme));
    (factory as { [WRAPPED]?: boolean })[WRAPPED] = true;
    ctx.ui.setEditorComponent?.(factory);
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
     *
     * So wait rather than install: another extension's editor is the one the
     * user asked for, and taking the editor over before it has had its turn
     * would replace a deliberately chosen frame with a default one. Only when
     * the wait runs out does this supply pi's own editor, so a solo install
     * still gets labels.
     */
    const deadline = Date.now() + wrapTimeoutMs();
    const timer = setInterval(() => {
      if (ensureWrapped(ctx)) {
        clearInterval(timer);
        return;
      }
      if (Date.now() <= deadline) return;
      clearInterval(timer);
      installOwnEditor(ctx);
    }, WRAP_RETRY_MS);
    timer.unref?.();
  });

  // An editor installed later still gets wrapped: extensions re-install theirs
  // when their own settings change, and pi drops a custom editor on session
  // reset. Wrapping first keeps a chosen editor; installing only happens when
  // there is nothing left to wrap.
  pi.on("turn_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI || process.env.PI_BORDER === "off") return;
    if (!ensureWrapped(ctx)) installOwnEditor(ctx);
  });
}
