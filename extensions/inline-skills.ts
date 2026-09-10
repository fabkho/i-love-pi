/**
 * inline-skills — type `/` anywhere in a message to open the skill menu.
 *
 * Core pi only opens the slash menu when `/` starts the message, and only
 * expands `/skill:name` at the start of the text. This extension:
 *
 *  1. Patches Editor.prototype.isAtStartOfMessage so a `/` typed after
 *     whitespace mid-sentence also triggers the autocomplete menu.
 *  2. Wraps the autocomplete provider: mid-text `/query` shows skills
 *     (reusing the built-in provider's own skill:* command list, so it is
 *     always in sync with discovered skills). Selecting inserts `/skill:name `.
 *  3. Transforms submitted input: the first whitespace-bounded `/skill:name`
 *     token is moved to the front so core's own skill expansion handles it
 *     (skill block + rest of your sentence as instructions).
 *
 * Remove: delete this file. No core files are modified.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Editor } from "@earendil-works/pi-tui";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

// ── 1. Allow "/" to trigger the menu mid-text (after whitespace) ──

type EditorInternals = {
  state: { lines: string[]; cursorLine: number; cursorCol: number };
  isSlashMenuAllowed(): boolean;
  isAtStartOfMessage(): boolean;
};

const editorProto = Editor.prototype as unknown as EditorInternals;
const orig = editorProto.isAtStartOfMessage;
editorProto.isAtStartOfMessage = function (this: EditorInternals): boolean {
  if (orig.call(this)) return true;
  if (!this.isSlashMenuAllowed()) return false;
  const line = this.state.lines[this.state.cursorLine] || "";
  const before = line.slice(0, this.state.cursorCol);
  // "/" just typed, preceded by whitespace → mid-text skill trigger
  return /\s\/$/.test(before);
};

// ── 2. Skill suggestions + insertion for mid-text "/query" ──

const MIDTEXT_SLASH = /(?:^|\s)(\/([^\s]*))$/;

function wrapProvider(base: AutocompleteProvider): AutocompleteProvider {
  return {
    triggerCharacters: base.triggerCharacters,
    shouldTriggerFileCompletion: base.shouldTriggerFileCompletion?.bind(base),

    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const fromBase = await base.getSuggestions(lines, cursorLine, cursorCol, options);
      if (fromBase) return fromBase;
      if (options.force) return null;

      const line = lines[cursorLine] || "";
      const before = line.slice(0, cursorCol);
      if (before.startsWith("/")) return null; // line start: base's territory

      const match = MIDTEXT_SLASH.exec(before);
      if (!match) return null;
      const query = match[2] ?? "";

      // Reuse the built-in command list by asking the base provider with a
      // synthetic line-start context, then keep only skill commands.
      const synthetic = `/skill:${query.startsWith("skill:") ? query.slice(6) : query}`;
      const result = await base.getSuggestions([synthetic], 0, synthetic.length, {
        signal: options.signal,
      });
      if (!result) return null;
      const items = result.items
        .filter((item) => item.value.startsWith("skill:"))
        .map((item) => ({ ...item, label: item.label.replace(/^skill:/, "") }));
      if (items.length === 0) return null;

      return { items, prefix: match[1] ?? "" }; // prefix = "/query"
    },

    applyCompletion(lines, cursorLine, cursorCol, item: AutocompleteItem, prefix) {
      // Mid-text skill selection: replace "/query" token with "/skill:name "
      if (item.value.startsWith("skill:") && prefix.startsWith("/")) {
        const line = lines[cursorLine] || "";
        const start = cursorCol - prefix.length;
        if (start > 0 || !line.startsWith("/")) {
          const insert = `/${item.value} `;
          const newLines = [...lines];
          newLines[cursorLine] = line.slice(0, start) + insert + line.slice(cursorCol);
          return { lines: newLines, cursorLine, cursorCol: start + insert.length };
        }
      }
      return base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
  };
}

// ── 3. Expand inline /skill:name on submit (via core's expansion) ──

const INLINE_SKILL = /(^|\s)(\/skill:[^\s]+)/;

export default function inlineSkills(pi: ExtensionAPI): void {
  let installed = false;

  pi.on("session_start", (_event, ctx) => {
    if (installed || !ctx.hasUI) return;
    installed = true;
    ctx.ui.addAutocompleteProvider(wrapProvider);
  });

  pi.on("input", (event) => {
    const text = event.text;
    if (text.startsWith("/")) return; // real commands / already-leading skills
    const match = INLINE_SKILL.exec(text);
    if (!match) return;
    const token = match[2];
    if (token === undefined) return;
    const tokenStart = match.index + (match[1]?.length ?? 0);
    const rest = (text.slice(0, tokenStart) + text.slice(tokenStart + token.length))
      .replace(/\s+/g, " ")
      .trim();
    // Move token to front → core expands it as skill block + args.
    return { action: "transform", text: rest ? `${token} ${rest}` : token };
  });
}
