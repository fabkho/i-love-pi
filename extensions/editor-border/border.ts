/**
 * Putting a label into a border that was already drawn.
 *
 * The editor frame is rendered by whoever owns the editor component, and its
 * metadata set is closed — there is no slot to ask for. What there is, in every
 * frame of this shape, is a run of horizontal rule between the left label and
 * the right one, and that run is spare width by construction.
 *
 * So a label goes in by consuming rule, never by adding width: the line keeps
 * its length, the corners stay put, and the styling around it is untouched
 * because the rule characters are literal text between escape sequences rather
 * than inside them.
 *
 * This is surgery on someone else's output. It is written to fail by doing
 * nothing — no run long enough, no border at all, and the line comes back
 * exactly as it arrived.
 */

/** Horizontal rules used by the frames this runs against. */
const RULE_CHARACTERS = ["─", "━", "-", "═"] as const;

/** Space kept between the label and the rule on either side. */
const PADDING = 1;

export interface InjectOptions {
  /** Rule kept to the left of the label, so the line still reads as a border. */
  minLeadingRule?: number;
  /** Where to sit when several runs are long enough. */
  prefer?: "longest" | "rightmost";
}

interface Run {
  index: number;
  length: number;
  character: string;
}

/**
 * The line split into visible characters, each with the offset it starts at in
 * the raw string.
 *
 * Rules are not plain text. pi's own editor builds its border as
 * `borderColor("─").repeat(width)`, so the raw line is the same character
 * wrapped in its own escape pair over and over — `ESC─ESC ESC─ESC …`. Scanning
 * the raw string therefore finds a run of length one, not a border, and nothing
 * is ever placed. Runs are found in the visible text and mapped back.
 */
interface VisibleLine {
  /** The line with escape sequences removed. */
  text: string;
  /** `rawAt[i]` is where visible character `i` starts in the raw line. */
  rawAt: number[];
}

function visibleLine(line: string): VisibleLine {
  let text = "";
  const rawAt: number[] = [];
  let index = 0;
  while (index < line.length) {
    const escape = line[index] === "\u001b" ? ANSI_AT_START.exec(line.slice(index)) : null;
    if (escape) {
      index += escape[0].length;
      continue;
    }
    text += line[index];
    rawAt.push(index);
    index += 1;
  }
  return { text, rawAt };
}

/** Every unbroken run of one rule character in the visible line. */
function findRuns(text: string): Run[] {
  const runs: Run[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (!RULE_CHARACTERS.includes(character as (typeof RULE_CHARACTERS)[number])) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < text.length && text[end] === character) end += 1;
    runs.push({ index, length: end - index, character });
    index = end;
  }
  return runs;
}

/** Escape sequences occupy no cells, so they are removed before measuring. */
const ANSI = /\u001b\[[0-9;]*m/gu;

/** The same, anchored, for walking a line one character at a time. */
const ANSI_AT_START = /^\u001b\[[0-9;]*m/u;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/**
 * Visible width of `text`, counting an emoji as the two cells a terminal gives
 * it and styling as none. Enough for the labels this places; not a
 * general-purpose width function.
 */
export function labelWidth(text: string): number {
  let width = 0;
  for (const character of stripAnsi(text)) {
    const code = character.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1f300 && code <= 0x1faff) || // pictographs
      (code >= 0x2600 && code <= 0x27bf) || // symbols
      (code >= 0x1f000 && code <= 0x1f2ff);
    width += wide ? 2 : 1;
  }
  return width;
}

/**
 * Place `label` inside the border line, consuming rule so the width holds.
 *
 * `label` may carry its own styling; only its visible width is counted. Returns
 * the line unchanged when there is nowhere for the label to go.
 */
export function injectIntoBorder(line: string, label: string, options: InjectOptions = {}): string {
  const { minLeadingRule = 2, prefer = "longest" } = options;
  if (label.length === 0) return line;

  // Rule on both sides: a label that ends flush against the next one reads as
  // part of it, rather than as its own thing sitting in the border.
  const needed = labelWidth(label) + PADDING * 2 + minLeadingRule + 1;
  const { text, rawAt } = visibleLine(line);
  const candidates = findRuns(text).filter((run) => run.length >= needed);
  if (candidates.length === 0) return line;

  const target =
    prefer === "rightmost"
      ? candidates[candidates.length - 1]!
      : candidates.reduce((longest, run) => (run.length > longest.length ? run : longest));

  const rule = target.character;
  const consumed = labelWidth(label) + PADDING * 2 + 1;
  const leading = target.length - consumed;

  // Map the whole run back to raw offsets, keeping the styling that wrapped it.
  // The rule is drawn one styled character at a time, so emitting plain text
  // here would drop the frame's colour across the span the label eats — and the
  // span is only `consumed` wide, with `leading` rule put back in front of it.
  const startRaw = rawAt[target.index]!;
  const endRaw = rawAt[target.index + target.length - 1]! + 1;
  const before = line.slice(0, startRaw);
  const after = line.slice(endRaw);
  const styleOpen = /(\u001b\[[0-9;]*m)$/u.exec(before)?.[1] ?? "";
  const styleClose = /^(\u001b\[[0-9;]*m)/u.exec(after)?.[1] ?? "";

  const replacement =
    styleOpen +
    rule.repeat(leading) +
    " ".repeat(PADDING) +
    label +
    " ".repeat(PADDING) +
    rule +
    styleClose;

  return before + replacement + after;
}

/**
 * Whether a line is nothing but horizontal rule — a frame edge with no corners.
 *
 * pi's own editor frames the input with two bare rules and no corner glyphs, so
 * a corner-only test sees no frame there at all and nothing is ever placed. A
 * cornerless edge cannot say whether it is the top or the bottom one; which rule
 * gets the label is decided by the caller, which searches from the edge it wants.
 *
 * Hyphen is deliberately not a rule here, although `RULE_CHARACTERS` counts it:
 * a line of `-----` in a frame this runs against is far more likely to be content
 * someone typed than a border, and a label dropped into their text is worse than
 * a label not placed.
 */
function isCornerlessRule(line: string): boolean {
  const text = stripAnsi(line).trim();
  if (text.length === 0) return false;
  for (const character of text) {
    if (character !== "─" && character !== "━" && character !== "═") return false;
  }
  return true;
}

/** Whether a line looks like the bottom edge of a frame. */
export function isBottomBorder(line: string): boolean {
  const text = stripAnsi(line);
  return /[╰└][^\n]*[╯┘]\s*$/u.test(text) || isCornerlessRule(text);
}

/** Whether a line looks like the top edge of a frame. */
export function isTopBorder(line: string): boolean {
  const text = stripAnsi(line);
  return /[╭┌][^\n]*[╮┐]\s*$/u.test(text) || isCornerlessRule(text);
}

/**
 * Place the first label that fits, from longest to shortest.
 *
 * A border too narrow for "🌐 4 missing" still has room for "🌐 4", and a label
 * that silently disappears when a pane is resized is worse than a terse one.
 */
export function injectFirstThatFits(line: string, labels: string[], options: InjectOptions = {}): string {
  for (const label of labels) {
    const injected = injectIntoBorder(line, label, options);
    if (injected !== line) return injected;
  }
  return line;
}
