/**
 * quiet-tools — one line per shell call, full transcript on demand.
 *
 * A run of shell commands is mostly noise you already trust: the command
 * itself is the interesting part, the output usually is not. By default pi
 * still prints a preview of every command's output, which turns a long run
 * into a wall of text you scroll past.
 *
 * This collapses each `bash` row to a single status line and hands the output
 * back to pi's own renderer the moment you ask for it. `Ctrl+O` (pi's existing
 * `app.tools.expand` toggle) expands every tool row in the transcript, so the
 * detail is always one keystroke away — and the hint follows your keybinding
 * config rather than hardcoding `ctrl+o`.
 *
 *   collapsed:  $ npm test                                     ← pi's own header
 *               ✓ 12.4s · 38 lines · (ctrl+o to expand)
 *
 *   expanded:   $ npm test
 *               ...full output, styled as before...
 *
 * This overrides the built-in `bash` tool by name — pi's documented way to
 * replace a built-in. Execution is not reimplemented: it delegates to
 * `createBashToolDefinition(cwd)`, so shell resolution, truncation, session env
 * vars and the `BashToolDetails` result shape stay exactly as pi produced them.
 * Only the render slots are replaced; `description`, schema and prompt metadata
 * are taken verbatim from pi's definition, so the tool the model sees is
 * unchanged. `renderCall` is pi's own `$ command` header unless a registered
 * formatter claims the command (see below).
 *
 * Relies on pi's built-in tool definitions being importable (tested against
 * pi 0.84.x). If a pi update removes `createBashToolDefinition`, this extension
 * fails at load and pi reports it — remove it from the extensions list until
 * updated.
 *
 * Other extensions can summarise specific commands (e.g. orca-coordinator turns
 * `orca orchestration ask --from … --question "…" 2>&1 | tail` into
 * `⧉ orca ask <question> [a · b · c]`). They publish a `BashCallFormatter` into a
 * process-wide registry (`Symbol.for("pi.bash-call-formatters")`) instead of
 * owning `bash` themselves; it is read at render time, so load order is irrelevant.
 *
 * Environment:
 *   PI_QUIET_TOOLS=off        don't override anything; `bash` renders as stock
 *   PI_QUIET_TOOLS_HINT_LINES minimum output lines before the expand hint is
 *                             shown (default 4; 0 always shows it)
 */

import {
	createBashToolDefinition,
	keyHint,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

type BashTool = ReturnType<typeof createBashToolDefinition>;
type RenderResult = NonNullable<BashTool["renderResult"]>;
type BashResult = Parameters<RenderResult>[0];
type RenderOptions = Parameters<RenderResult>[1];
type Theme = Parameters<RenderResult>[2];
type RenderContext = Parameters<RenderResult>[3];

type FormatterStyle = "title" | "accent" | "muted" | "dim" | "success" | "error" | "warning" | "output";
type FormatterLine = { text: string; style?: FormatterStyle }[];

/** Contract for command summaries published by other extensions (see header). */
export type BashCallFormatter = {
	id: string;
	/** Lines to show instead of `$ command` (header first), or null to keep the stock header. */
	formatCall(command: string, expanded: boolean): FormatterLine[] | null;
	/** One status segment for a finished, collapsed row, or null for the generic `✓`. */
	formatResult?(
		command: string,
		output: string,
		state: { isError: boolean },
	): { text: string; style: FormatterStyle } | null;
	/** Label for a still-running row (default "running"). */
	pendingLabel?(command: string): string | null;
};

const BASH_CALL_FORMATTERS = Symbol.for("pi.bash-call-formatters");

/** The first registered formatter that claims `command`, with its call lines. */
function claimCommand(command: unknown, expanded: boolean): { formatter: BashCallFormatter; lines: FormatterLine[] } | null {
	if (typeof command !== "string") return null;
	const registry = (globalThis as Record<symbol, Map<string, BashCallFormatter> | undefined>)[BASH_CALL_FORMATTERS];
	for (const formatter of registry?.values() ?? []) {
		try {
			const lines = formatter.formatCall(command, expanded);
			if (lines) return { formatter, lines };
		} catch {
			// A broken formatter must never break the transcript; fall through to stock.
		}
	}
	return null;
}

function styled(theme: Theme, text: string, style: FormatterStyle | undefined): string {
	switch (style) {
		case "title":
			return theme.fg("toolTitle", theme.bold(text));
		case "output":
			return theme.fg("toolOutput", text);
		case undefined:
			return text;
		default:
			return theme.fg(style, text);
	}
}

/** Collapsed: every line clipped to the width (one row per line). Expanded: wrapped text. */
function formattedCallComponent(lines: FormatterLine[], expanded: boolean, theme: Theme) {
	const rendered = lines.map((line) => line.map((segment) => styled(theme, segment.text, segment.style)).join(""));
	if (expanded) return new Text(rendered.join("\n"), 0, 0);
	return {
		render: (width: number) => rendered.map((line) => truncateToWidth(line, width, "…")),
		invalidate: () => {},
	};
}

const TICK_MS = 1000;
const MAX_ERROR_CHARS = 96;
const DEFAULT_HINT_LINES = 4;

function hintThreshold(): number {
	const raw = Number.parseInt(process.env.PI_QUIET_TOOLS_HINT_LINES ?? "", 10);
	return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_HINT_LINES;
}

function outputText(result: BashResult): string {
	return result.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("\n")
		.trim();
}

function countLines(text: string): number {
	return text === "" ? 0 : text.split("\n").length;
}

/** First non-blank line, clipped — a failing command's message, not its stack. */
function firstLine(text: string): string {
	const line = text.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
	return line.length > MAX_ERROR_CHARS ? `${line.slice(0, MAX_ERROR_CHARS - 1)}…` : line;
}

function formatElapsed(ms: number): string {
	return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function renderQuietResult(
	result: BashResult,
	options: RenderOptions,
	theme: Theme,
	context: RenderContext,
	builtin: BashTool,
): ReturnType<RenderResult> {
	// Expanded: this is a deliberate look at the output, so defer to pi.
	if (options.expanded && builtin.renderResult) {
		return builtin.renderResult(result, options, theme, context);
	}

	// `state` is the row-local object pi shares between the call and result
	// slots, so the inherited `renderCall` has already marked the start time.
	const state = context.state;
	if (context.executionStarted && state.startedAt === undefined) {
		state.startedAt = Date.now();
	}
	if (state.startedAt !== undefined && options.isPartial && state.interval === undefined) {
		state.interval = setInterval(() => context.invalidate(), TICK_MS);
	}
	if (!options.isPartial) {
		state.endedAt ??= Date.now();
		if (state.interval !== undefined) {
			clearInterval(state.interval);
			state.interval = undefined;
		}
	}

	const elapsed =
		state.startedAt === undefined
			? undefined
			: formatElapsed((state.endedAt ?? Date.now()) - state.startedAt);

	const output = outputText(result);
	const lines = countLines(output);
	const separator = theme.fg("dim", " · ");
	const parts: string[] = [];
	const command = (context.args as { command?: unknown } | undefined)?.command;
	const claim = claimCommand(command, false);
	let summary: { text: string; style: FormatterStyle } | null = null;
	if (claim && !options.isPartial) {
		try {
			summary = claim.formatter.formatResult?.(command as string, output, { isError: context.isError }) ?? null;
		} catch {
			summary = null;
		}
	}

	if (options.isPartial) {
		const label = (claim && claim.formatter.pendingLabel?.(command as string)) || "running";
		parts.push(theme.fg("muted", elapsed === undefined ? label : `${label} ${elapsed}`));
	} else if (summary) {
		parts.push(styled(theme, summary.text, summary.style));
		if (elapsed !== undefined) parts.push(theme.fg("dim", elapsed));
	} else if (context.isError) {
		const detail = firstLine(output);
		parts.push(theme.fg("error", detail === "" ? "✗ failed" : `✗ ${detail}`));
		if (elapsed !== undefined) parts.push(theme.fg("dim", elapsed));
	} else {
		parts.push(theme.fg("success", "✓"));
		if (elapsed !== undefined) parts.push(theme.fg("dim", elapsed));
		if (lines > 0) {
			parts.push(theme.fg("dim", `${lines} line${lines === 1 ? "" : "s"}`));
		}
	}

	// Hidden output worth reading gets an affordance; a two-line command's
	// status line stays clean.
	if (lines > 0 && lines >= hintThreshold()) {
		parts.push(theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`));
	}

	const component = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
	component.setText(parts.join(separator));
	return component;
}

export default function quietTools(pi: ExtensionAPI): void {
	if (process.env.PI_QUIET_TOOLS === "off") return;

	// One definition per cwd: execution and rendering both use the live cwd
	// from their context, so a session that moves directories stays correct.
	const perCwd = new Map<string, BashTool>();
	const bashFor = (cwd: string): BashTool => {
		const existing = perCwd.get(cwd);
		if (existing) return existing;
		const created = createBashToolDefinition(cwd);
		perCwd.set(cwd, created);
		return created;
	};

	// Annotated so the built-in's generics (details, render state) flow into
	// the override — otherwise the spread widens `result` to `unknown`.
	const definition: BashTool = {
		...bashFor(process.cwd()),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return bashFor(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
		},
		renderCall(args, theme, context) {
			const claim = claimCommand(args?.command, context.expanded);
			const builtin = bashFor(context.cwd);
			if (!claim || !builtin.renderCall) {
				return builtin.renderCall!(args, theme, context);
			}
			// Same start-time bookkeeping as pi's header, which this replaces for the row.
			const state = context.state;
			if (context.executionStarted && state.startedAt === undefined) {
				state.startedAt = Date.now();
				state.endedAt = undefined;
			}
			return formattedCallComponent(claim.lines, context.expanded, theme);
		},
		renderResult(result, options, theme, context) {
			return renderQuietResult(result, options, theme, context, bashFor(context.cwd));
		},
	};

	pi.registerTool(definition);
}
