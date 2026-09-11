/**
 * The editor this wraps belongs to another extension, which installs it in its
 * own session_start handler. Handlers run in load order, so whether an editor
 * exists when this one looks is decided by the order packages happen to be
 * listed in — which is to say, not by anything this package controls.
 *
 * These tests pin both orders.
 */

import type { Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted, because the module under test binds this import at load: mocking it
// afterwards would leave the real one in place.
const { statusRef, missingRef, persistentSurface } = vi.hoisted(() => ({
  statusRef: { current: undefined as string | undefined },
  missingRef: { current: undefined as number | undefined },
  persistentSurface: { declared: false },
}));

// Partial, so an export added to that module later arrives here rather than
// failing every test in this file — which it has done more than once.
vi.mock("./sources/i18n-kit-channel.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sources/i18n-kit-channel.ts")>()),
  getI18nStatus: () => statusRef.current,
  getI18nMissing: () => missingRef.current,
  setI18nPersistentSurface: (present: boolean) => {
    persistentSurface.declared = present;
  },
}));

import extension from "./extension.ts";
import { clearBorderSlot, getBorderSlots, setBorderSlot } from "./slots.ts";
import { registerI18nSlot } from "./sources/i18n-kit.ts";

const BOTTOM = "╰─ main * ──────────────────────────────────────────── the-i18n-kit ─╯";

/**
 * An editor in the shape the host expects: state in its own fields, mutated by
 * its own methods, rendered from those same fields.
 *
 * That shape is the point. A wrapper that delegates instead of patching ends up
 * holding half the state — input lands on the wrapper, rendering reads the
 * original — and the editor stops responding to typing, which is what shipped.
 */
class FakeEditor implements Component {
  private text = "";
  private autocompleteOpen = false;

  render(): string[] {
    return [
      "╭─ 1m ────────────────────────────────────────────────────────────╮",
      `│ ${this.text}${this.autocompleteOpen ? " [suggestions]" : ""}`,
      BOTTOM,
    ];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    this.text += data;
    if (data === "/") this.autocompleteOpen = true;
  }

  getText(): string {
    return this.text;
  }
}

function fakeEditor(): Component {
  return new FakeEditor();
}

/**
 * tui, theme, keybindings — as pi passes them, with a border colour that emits
 * real escape sequences: styling has to cost no width, and a fake that marks up
 * with plain text would hide it if it did.
 */
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";
/**
 * Where the kit's coverage label lands when keys are missing, and when clean.
 *
 * Real SGR sequences, not readable markers: the border measures a label by
 * stripping escapes first, and its stripper — like pi's — only knows `[0-9;]*m`.
 * A marker with letters in it is counted as visible width and the label stops
 * fitting, which is a fixture bug rather than a border one.
 */
const FG_MISSING = "\u001b[38;5;141m";
const FG_CLEAN = "\u001b[38;5;114m";
/**
 * A TUI stand-in. pi-tui's real `Editor` reads the terminal size off it while
 * rendering, so the fallback path — which builds a real editor — can be
 * exercised rather than merely asserted on.
 */
const TUI_STUB = {
  terminal: { rows: 24, columns: 120 },
  requestRender: () => {},
  setFocus: () => {},
} as never;
const editorArgs = [TUI_STUB, { borderColor: (text: string) => `${DIM}${text}${RESET}` }, {}] as never[];

/**
 * pi's own theme, as `ctx.ui.theme` exposes it — the only theme with `fg` on
 * it, and therefore the only place a slot's own colour can come from.
 *
 * Markers rather than colour codes, so an assertion says which token was asked
 * for rather than what it currently resolves to. An unknown token throws, as the
 * real one does.
 */
const theme = {
  fg: (color: string, text: string): string => {
    const hex: Record<string, string> = {
      success: FG_CLEAN,
      syntaxKeyword: FG_MISSING,
      borderMuted: DIM,
      accent: "\u001b[38;5;75m",
    };
    const ansi = hex[color];
    if (ansi === undefined) throw new Error(`Unknown theme color: ${color}`);
    return `${ansi}${text}${RESET}`;
  },
};

function harness(status: string | undefined = "🌐 4 missing", missing: number | undefined = 4) {
  const handlers: Record<string, ((event: unknown, ctx: unknown) => unknown)[]> = {};
  let installed: ((...args: never[]) => Component) | undefined;

  const ctx = {
    hasUI: true,
    cwd: "/project",
    ui: {
      // A live getter, as pi's is: slot colours are read per render.
      get theme() {
        return theme;
      },
      getEditorComponent: () => installed,
      setEditorComponent: (factory: (...args: never[]) => Component) => {
        installed = factory;
      },
      setStatus: vi.fn(),
      notify: vi.fn(),
    },
  };

  const pi = {
    on: (name: string, fn: (event: unknown, ctx: unknown) => unknown) => {
      (handlers[name] ??= []).push(fn);
    },
    registerCommand: vi.fn(),
    exec: vi.fn(),
  };

  // The status the border reads comes from the kit extension's module state.
  statusRef.current = status;
  missingRef.current = missing;

  return {
    pi,
    ctx,
    fire: async (name: string, event: unknown = {}) => {
      for (const handler of handlers[name] ?? []) await handler(event, ctx);
    },
    /** What the editor renders now, through whatever wrapping is in place. */
    renderEditor: () => installed?.(...editorArgs).render(120) ?? [],
    /** The component the installed factory builds, as the host would get it. */
    editorInstance: () => installed?.(...editorArgs),
    installEditor: (factory: (...args: never[]) => Component) => {
      installed = factory;
    },
    isInstalled: () => installed !== undefined,
  };
}

beforeEach(() => {
  // The registry is global, so a test that adds a slot would otherwise leak
  // into the next one.
  for (const slot of getBorderSlots()) clearBorderSlot(slot.id);
  registerI18nSlot();
});

describe("keeping the editor working", () => {
  it("still types, and still opens autocomplete", async () => {
    const { pi, fire, installEditor, editorInstance } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    const editor = editorInstance() as unknown as FakeEditor;
    editor.handleInput("/");
    editor.handleInput("m");

    // The input must reach the same object that renders, or the editor freezes.
    expect(editor.getText()).toBe("/m");
    const lines = editor.render();
    expect(lines[1]).toContain("/m");
    expect(lines[1]).toContain("[suggestions]");
  });

  it("returns the editor itself, so the host keeps every method it had", async () => {
    const { pi, fire, installEditor, editorInstance } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    expect(editorInstance()).toBeInstanceOf(FakeEditor);
  });

  it("patches an instance once, however often it is wrapped", async () => {
    const { pi, fire, installEditor, editorInstance } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");
    await fire("turn_start");

    const line = (editorInstance()?.render(120) ?? []).at(-1) ?? "";
    expect(line.match(/🌐/gu) ?? []).toHaveLength(1);
  });
});

describe("slots", () => {
  it("shows a label from an extension that knows nothing about i18n", async () => {
    setBorderSlot({ id: "build", labels: ["⚙ 3 failing", "⚙ 3"], order: 10 });
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    const line = renderEditor().at(-1) ?? "";
    // Ordered by the slots' own order, separated for reading, and each label in
    // its own styling: the separator is coloured as chrome, the kit's label as
    // coverage. So assert the parts and their order, not one contiguous run.
    expect(line).toContain("⚙ 3 failing");
    expect(line).toContain(`${FG_MISSING}🌐 4 missing${RESET}`);
    expect(line.indexOf("⚙ 3 failing")).toBeLessThan(line.indexOf("🌐"));
  });

  it("drops the least important slot before the most important one", async () => {
    setBorderSlot({ id: "chatty", labels: ["something quite long indeed"], order: 900 });
    const narrow = "╰─ main ──────────────────── vue ─╯";
    const { pi, fire, installEditor, editorInstance } = harness();
    installEditor(() => ({
      render: () => ["╭────────────────────────────────╮", "│ hi", narrow],
      invalidate: () => {},
    }));
    extension(pi as never);
    await fire("session_start");

    const line = (editorInstance()?.render(34) ?? []).at(-1) ?? "";
    expect(line).toContain("🌐");
    expect(line).not.toContain("something quite long");
  });

  it("shows nothing when every slot has nothing to say", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    // Explicitly, because harness(undefined) would take the default parameter.
    statusRef.current = undefined;
    missingRef.current = undefined;
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    expect(renderEditor().at(-1)).toBe(BOTTOM);
  });
});

describe("the label itself", () => {
  it("takes its own colour when the slot names one", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    // Readable at all, which the frame colour is not — `borderMuted` is a
    // quiet-rule colour, so a figure drawn in it disappears into the border.
    expect(renderEditor().at(-1)).toContain(`${FG_MISSING}🌐 4 missing${RESET}`);
    expect(renderEditor().at(-1)).not.toContain(`${DIM}🌐 4 missing${RESET}`);
  });

  it("colours itself by what it reports, not once at load", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");
    expect(renderEditor().at(-1)).toContain(FG_MISSING);

    // The kit finishes a run and coverage is clean: green, same as the cost.
    statusRef.current = "🌐 ✓";
    missingRef.current = 0;
    expect(renderEditor().at(-1)).toContain(`${FG_CLEAN}🌐 ✓${RESET}`);
  });

  it("leaves a slot that names no colour in the frame's own colour", async () => {
    setBorderSlot({ id: "build", labels: ["⚙ 3 failing"], order: 10 });
    statusRef.current = undefined;
    missingRef.current = undefined;
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    expect(renderEditor().at(-1)).toContain(`${DIM}⚙ 3 failing${RESET}`);
  });

  it("falls back to the frame colour when a slot names an unknown token", async () => {
    // A mistyped token must not take the editor down with it: this runs inside
    // render, once a frame.
    setBorderSlot({ id: "typo", labels: ["oops"], order: 10, color: "chartreuse" as never });
    statusRef.current = undefined;
    missingRef.current = undefined;
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    expect(renderEditor().at(-1)).toContain(`${DIM}oops${RESET}`);
  });

  it("shortens rather than vanishing when the border is narrow", async () => {
    const narrow = "╰─ main * ───────────── vue ─╯";
    const { pi, fire, installEditor, editorInstance } = harness();
    installEditor(() => ({
      render: () => ["╭─ 1m ──────────────────────╮", "│ hi", narrow],
      invalidate: () => {},
    }));
    extension(pi as never);
    await fire("session_start");

    const line = (editorInstance()?.render(30) ?? []).at(-1) ?? "";
    expect(line).toContain("🌐 4");
    expect(line).not.toContain("missing");
  });

  it("falls back to the marker alone when even the count will not fit", async () => {
    const tiny = "╰─ main ────────── vue ─╯";
    const { pi, fire, installEditor, editorInstance } = harness("🌐 1234567 missing", 1234567);
    installEditor(() => ({
      render: () => ["╭──────────────────────╮", "│ hi", tiny],
      invalidate: () => {},
    }));
    extension(pi as never);
    await fire("session_start");

    const line = (editorInstance()?.render(24) ?? []).at(-1) ?? "";
    expect(line).toContain("🌐");
    expect(line).not.toContain("1234567");
  });

  it("can label the top edge instead", async () => {
    vi.stubEnv("PI_BORDER_PLACEMENT", "top");
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);
    await fire("session_start");

    const lines = renderEditor();
    expect(lines[0]).toContain("🌐 4 missing");
    expect(lines.at(-1)).not.toContain("🌐");
    vi.unstubAllEnvs();
  });
});

describe("wrapping the editor", () => {
  it("labels the border when an editor is already installed", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);

    await fire("session_start");

    expect(renderEditor().at(-1)).toContain("🌐 4 missing");
  });

  it("waits for an editor installed after it, by an extension loaded later", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    extension(pi as never);

    // Nothing to wrap yet: this is the order that broke it in a real session.
    await fire("session_start");
    expect(renderEditor()).toEqual([]);

    installEditor(fakeEditor);
    await vi.waitFor(() => expect(renderEditor().at(-1)).toContain("🌐 4 missing"), { timeout: 3_000 });
  });

  it("wraps an editor that appears only once a turn starts", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    extension(pi as never);
    await fire("session_start");

    installEditor(fakeEditor);
    await fire("turn_start");

    expect(renderEditor().at(-1)).toContain("🌐 4 missing");
  });

  it("tells the widget that coverage now has a permanent home", async () => {
    const { pi, fire, installEditor } = harness();
    persistentSurface.declared = false;
    installEditor(fakeEditor);
    extension(pi as never);

    await fire("session_start");

    expect(persistentSurface.declared).toBe(true);
  });

  it("does not wrap a wrapper", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);

    await fire("session_start");
    await fire("turn_start");
    await fire("turn_start");

    const line = renderEditor().at(-1) ?? "";
    expect(line.match(/🌐/gu) ?? []).toHaveLength(1);
  });

  it("leaves the editor alone when there is nothing to report", async () => {
    const { pi, fire, installEditor, renderEditor } = harness();
    // Explicitly, because harness(undefined) would take the default parameter.
    statusRef.current = undefined;
    installEditor(fakeEditor);
    extension(pi as never);

    await fire("session_start");

    expect(renderEditor().at(-1)).toBe(BOTTOM);
  });

  it("stays out of it when the border is turned off", async () => {
    vi.stubEnv("PI_BORDER", "off");
    const { pi, fire, installEditor, renderEditor } = harness();
    installEditor(fakeEditor);
    extension(pi as never);

    await fire("session_start");

    expect(renderEditor().at(-1)).toBe(BOTTOM);
    vi.unstubAllEnvs();
  });

describe("when no extension supplies an editor", () => {
  /*
   * pi's default editor is only reachable through `setEditorComponent`, so a
   * solo install has nothing to wrap unless this extension supplies one. These
   * pin that it does, that it waits for another extension first, and that the
   * wait can be turned off.
   */
  const QUICK = "0";

  it("supplies pi's own editor, labelled, once the wait runs out", async () => {
    vi.stubEnv("PI_BORDER_WRAP_TIMEOUT_MS", QUICK);
    const { pi, fire, isInstalled, editorInstance } = harness();
    extension(pi as never);

    await fire("session_start");
    await vi.waitFor(() => expect(isInstalled()).toBe(true), { timeout: 2_000 });

    // pi's own class, not a stand-in, because the host wires a custom editor
    // itself: this ends up being the default editor with labels in its border.
    expect(editorInstance()?.constructor.name).toBe("CustomEditor");
    expect((editorInstance()?.render(120) ?? []).join("\n")).toContain("🌐 4 missing");
    vi.unstubAllEnvs();
  });

  it("still prefers an editor another extension installed", async () => {
    vi.stubEnv("PI_BORDER_WRAP_TIMEOUT_MS", QUICK);
    const { pi, fire, installEditor, editorInstance } = harness();
    extension(pi as never);
    await fire("session_start");

    // Arrives inside the wait window, so it wins and gets wrapped rather than
    // being replaced by a default frame.
    installEditor(fakeEditor);
    await fire("turn_start");

    expect(editorInstance()).toBeInstanceOf(FakeEditor);
    vi.unstubAllEnvs();
  });

  it("leaves the editor alone when asked not to supply one", async () => {
    vi.stubEnv("PI_BORDER", "off");
    const { pi, fire, isInstalled } = harness();
    extension(pi as never);
    await fire("session_start");
    await fire("turn_start");

    expect(isInstalled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
});
