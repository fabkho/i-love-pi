/**
 * The border lines here are copied from a real pi session (zentui's minimalist
 * editor), including its styling, because the whole point of this code is that
 * it works on output someone else produced.
 */

import { describe, expect, it } from "vitest";
import { injectIntoBorder, isBottomBorder, isTopBorder, labelWidth } from "./border.ts";

/** Bottom edge: branch on the left, project on the right, rule between. */
const BOTTOM =
  "╰─ feat/agent-harness-integrations * ──────────────────────────────────────────── the-i18n-kit ─╯";

/** The same line as pi renders it, with colour around the labels. */
const BOTTOM_STYLED =
  "\u001b[38;5;240m╰─ \u001b[0m\u001b[38;5;176mfeat/agent-harness-integrations *\u001b[0m" +
  "\u001b[38;5;240m ──────────────────────────────────────────── \u001b[0m" +
  "\u001b[38;5;111mthe-i18n-kit\u001b[0m\u001b[38;5;240m ─╯\u001b[0m";

const width = (line: string) => labelWidth(line.replace(/\u001b\[[0-9;]*m/gu, ""));

describe("labelWidth", () => {
  it("counts an emoji as the two cells a terminal gives it", () => {
    expect(labelWidth("🌐 4 missing")).toBe(12);
    expect(labelWidth("ok")).toBe(2);
  });
});

describe("isBottomBorder", () => {
  it("recognises a bottom edge, styled or not", () => {
    expect(isBottomBorder(BOTTOM)).toBe(true);
    expect(isBottomBorder(BOTTOM_STYLED)).toBe(true);
  });

  it("rejects a top edge and ordinary content", () => {
    expect(isBottomBorder("╭─ 3m 0s ───────────────────╮")).toBe(false);
    expect(isBottomBorder("│ some text                 │")).toBe(false);
  });
});

describe("injectIntoBorder", () => {
  it("places the label in the rule", () => {
    const line = injectIntoBorder(BOTTOM, "🌐 4 missing");
    expect(line).toContain("🌐 4 missing");
    expect(line).toContain("feat/agent-harness-integrations *");
    expect(line).toContain("the-i18n-kit");
  });

  it("keeps the line exactly as wide as it was", () => {
    // The frame is drawn to a width; a label that changes it corrupts the frame.
    const line = injectIntoBorder(BOTTOM, "🌐 4 missing");
    expect(width(line)).toBe(width(BOTTOM));
  });

  it("leaves surrounding styling untouched", () => {
    const line = injectIntoBorder(BOTTOM_STYLED, "🌐 4 missing");
    expect(width(line)).toBe(width(BOTTOM_STYLED));
    expect(line).toContain("\u001b[38;5;176mfeat/agent-harness-integrations *\u001b[0m");
    expect(line).toContain("\u001b[38;5;111mthe-i18n-kit\u001b[0m");
  });

  it("keeps rule between the corner and the label", () => {
    const line = injectIntoBorder(BOTTOM, "🌐 4 missing");
    expect(line).toMatch(/─{2,} 🌐 4 missing ─/u);
  });

  it("does nothing when no run is long enough", () => {
    const narrow = "╰─ branch ─ project ─╯";
    expect(injectIntoBorder(narrow, "🌐 4 missing")).toBe(narrow);
  });

  it("does nothing to a line with no rule at all", () => {
    expect(injectIntoBorder("no border here", "🌐 4 missing")).toBe("no border here");
  });

  it("does nothing with an empty label", () => {
    expect(injectIntoBorder(BOTTOM, "")).toBe(BOTTOM);
  });

  it("prefers the longest run, so it lands between the labels", () => {
    const line = injectIntoBorder(BOTTOM, "🌐 ✓");
    const beforeProject = line.slice(0, line.indexOf("the-i18n-kit"));
    expect(beforeProject).toContain("🌐 ✓");
  });

  it("can be asked for the rightmost run instead", () => {
    const twoRuns = "╰─ a ──────────────────────────── b ──────────── c ─╯";
    const longest = injectIntoBorder(twoRuns, "XX");
    const rightmost = injectIntoBorder(twoRuns, "XX", { prefer: "rightmost" });
    expect(longest.indexOf("XX")).toBeLessThan(rightmost.indexOf("XX"));
    expect(width(rightmost)).toBe(width(twoRuns));
  });

  it("handles the heavier rule characters other frames use", () => {
    const heavy = "└━ branch ━━━━━━━━━━━━━━━━━━━━━━━━━━ project ━┘";
    const line = injectIntoBorder(heavy, "🌐 ✓");
    expect(line).toContain("🌐 ✓");
    expect(width(line)).toBe(width(heavy));
  });
});

/**
 * pi's own editor draws its frame as `borderColor("─").repeat(width)`, so the
 * raw line is that character wrapped in its own escape pair again and again.
 * Scanning raw text finds runs of length one and places nothing; scanning
 * visible text and mapping back is what makes a solo install label its border.
 */
const PER_CHARACTER_RULE = "\u001b[38;5;240m─\u001b[0m".repeat(60);

describe("a frame drawn one character at a time", () => {
  it("is recognised as an edge even with no corners", () => {
    expect(isBottomBorder(PER_CHARACTER_RULE)).toBe(true);
    expect(isTopBorder(PER_CHARACTER_RULE)).toBe(true);
  });

  it("finds the run through the escapes, and keeps the width", () => {
    const line = injectIntoBorder(PER_CHARACTER_RULE, "🌐 4 missing");
    expect(line).toContain("🌐 4 missing");
    expect(width(line)).toBe(width(PER_CHARACTER_RULE));
  });

  it("puts back rule in the frame's colour, not bare text", () => {
    const line = injectIntoBorder(PER_CHARACTER_RULE, "🌐 4 missing");
    expect(line).toContain("\u001b[38;5;240m");
  });

  it("still refuses a line of hyphens, which is content more often than frame", () => {
    expect(isBottomBorder("-".repeat(60))).toBe(false);
  });
});
