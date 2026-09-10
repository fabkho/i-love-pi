/**
 * tab-title — Current task + running/done indicator in the terminal tab title.
 *
 * Updates the terminal/tab title (Warp, iTerm2, WezTerm, and any other
 * OSC-title-aware terminal) to reflect what pi is currently doing, via the
 * built-in `ctx.ui.setTitle()` extension API (same OSC title sequence pi
 * itself uses for the default "π - <session> - <cwd>" title).
 *
 * This lets you tell whether the agent is still working or finished just by
 * glancing at the tab bar — no need to have the tab focused/open.
 *
 * Title states:
 *   - Idle (no task yet):        "π - <session> - <cwd>"
 *   - Running:                   "⠋ <task> - <cwd>"
 *   - Running + tool activity:   "⠋ <task> — <tool action> - <cwd>"
 *       e.g. "⠋ Fix auth bug — editing auth.ts - bookings-api"
 *   - Done (settled, no errors): "✅ <task> - <cwd>"
 *   - Done (settled, tool error occurred during the run): "❌ <task> - <cwd>"
 *
 * The done/error indicator sticks around (it does NOT revert to the idle
 * title) until the next prompt is sent, so you can check back later and
 * still see the outcome of the last run.
 *
 * The "task" is derived from the user's prompt that kicked off the current
 * agent run (before_agent_start). The tool-action suffix comes from the
 * tool currently executing (tool_execution_start/end) so the tab shows live
 * progress, not just a static task name.
 *
 * System notification:
 *   When the run settles, a native OS notification is also sent
 *   ("Task completed" / "Task finished with errors" + the task text) so you
 *   get pinged even when the terminal is hidden or on another desktop.
 *   Uses `osascript` on macOS, `notify-send` on Linux and a PowerShell
 *   balloon on Windows. Set PI_TAB_TITLE_NOTIFY=0 to disable.
 *
 * Part of the i-love-pi package. No config needed — works out of the box,
 * including in Warp (see below).
 *
 *   Quick test standalone: pi -e ./extensions/tab-title.ts
 *
 * Warp note:
 *   Warp silently overwrites OSC title escapes with its own auto-title
 *   unless WARP_DISABLE_AUTO_TITLE is set in the environment. This
 *   extension sets that env var itself on load when it detects
 *   TERM_PROGRAM=WarpTerminal, so no manual shell rc changes are needed.
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Warp overrides OSC title escape codes with its own auto-titling unless
// WARP_DISABLE_AUTO_TITLE is set in the environment. Set it automatically
// (as early as possible, at module load) so this works with zero manual
// shell rc setup. No-op outside Warp.
if (process.env.TERM_PROGRAM === "WarpTerminal" && !process.env.WARP_DISABLE_AUTO_TITLE) {
	process.env.WARP_DISABLE_AUTO_TITLE = "true";
}

const MAX_TASK_LEN = 42;
const MAX_TOOL_LEN = 26;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 120;
const NOTIFY_ENABLED = !/^(0|false|off|no)$/i.test(process.env.PI_TAB_TITLE_NOTIFY ?? "");

type RunState = "idle" | "running" | "done" | "error";

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return "";
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Turn a tool call's name/args into a short human-readable activity string. */
function describeTool(toolName: string, args: any): string | undefined {
	switch (toolName) {
		case "read":
			return args?.path ? `reading ${path.basename(String(args.path))}` : "reading file";
		case "write":
			return args?.path ? `writing ${path.basename(String(args.path))}` : "writing file";
		case "edit":
			return args?.path ? `editing ${path.basename(String(args.path))}` : "editing file";
		case "bash":
		case "powershell":
			return args?.command ? `running: ${truncate(String(args.command), MAX_TOOL_LEN)}` : "running command";
		case "grep":
			return args?.pattern ? `searching "${truncate(String(args.pattern), MAX_TOOL_LEN - 4)}"` : "searching";
		case "find":
			return "finding files";
		case "ls":
			return "browsing files";
		default:
			// Custom/MCP/subagent tools: fall back to args.description or the tool name.
			if (args?.description) return truncate(String(args.description), MAX_TOOL_LEN);
			return toolName.replace(/[_-]+/g, " ");
	}
}

/** Escape a string for embedding inside a double-quoted AppleScript literal. */
function appleScriptQuote(text: string): string {
	return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escape a string for embedding inside a single-quoted PowerShell literal. */
function powershellQuote(text: string): string {
	return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Fire a native OS notification. Best-effort: silently ignores missing
 * tools (e.g. no notify-send on a headless Linux box) and never throws.
 */
async function sendSystemNotification(pi: ExtensionAPI, title: string, body: string): Promise<void> {
	if (!NOTIFY_ENABLED) return;
	try {
		switch (process.platform) {
			case "darwin":
				await pi.exec("osascript", [
					"-e",
					`display notification ${appleScriptQuote(body)} with title ${appleScriptQuote(title)}`,
				]);
				break;
			case "linux":
				await pi.exec("notify-send", ["--app-name=pi", title, body]);
				break;
			case "win32":
				await pi.exec("powershell", [
					"-NoProfile",
					"-Command",
					[
						"Add-Type -AssemblyName System.Windows.Forms;",
						"$n = New-Object System.Windows.Forms.NotifyIcon;",
						"$n.Icon = [System.Drawing.SystemIcons]::Information;",
						"$n.Visible = $true;",
						`$n.ShowBalloonTip(5000, ${powershellQuote(title)}, ${powershellQuote(body)}, 'Info');`,
						"Start-Sleep -Seconds 5; $n.Dispose();",
					].join(" "),
				]);
				break;
			default:
				break;
		}
	} catch {
		// Notifications are a nicety — never let them break the run.
	}
}

export default function (pi: ExtensionAPI) {
	let state: RunState = "idle";
	let task: string | undefined;
	let toolSuffix: string | undefined;
	let hadError = false;
	let spinnerTimer: ReturnType<typeof setInterval> | null = null;
	let spinnerFrame = 0;

	function baseTitle(): string {
		const cwd = path.basename(process.cwd());
		const session = pi.getSessionName();
		return session ? `π - ${session} - ${cwd}` : `π - ${cwd}`;
	}

	function statusIcon(): string {
		switch (state) {
			case "running":
				return SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
			case "done":
				return "✅";
			case "error":
				return "❌";
			default:
				return "";
		}
	}

	function render(ctx: ExtensionContext) {
		const cwd = path.basename(process.cwd());
		if (state === "idle" || !task) {
			ctx.ui.setTitle(baseTitle());
			return;
		}
		const suffix = state === "running" && toolSuffix ? ` — ${toolSuffix}` : "";
		ctx.ui.setTitle(`${statusIcon()} ${task}${suffix} - ${cwd}`);
	}

	function stopSpinner() {
		if (spinnerTimer) {
			clearInterval(spinnerTimer);
			spinnerTimer = null;
		}
	}

	function startSpinner(ctx: ExtensionContext) {
		stopSpinner();
		spinnerFrame = 0;
		spinnerTimer = setInterval(() => {
			spinnerFrame++;
			render(ctx);
		}, SPINNER_INTERVAL_MS);
	}

	// A new task starts: capture the user's prompt as the headline and start animating.
	pi.on("before_agent_start", async (event, ctx) => {
		state = "running";
		task = truncate(event.prompt, MAX_TASK_LEN) || "Working";
		toolSuffix = undefined;
		hadError = false;
		startSpinner(ctx);
		render(ctx);
	});

	// Show live activity while tools run; track whether any tool call errored.
	pi.on("tool_execution_start", async (event, ctx) => {
		toolSuffix = describeTool(event.toolName, event.args);
		render(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.isError) hadError = true;
		toolSuffix = undefined;
		render(ctx);
	});

	// Fully settled (no retry/compaction/follow-up left): freeze on a done/error
	// indicator so the outcome is visible from the tab bar at a glance, even
	// without focusing the tab. Stays until the next prompt is sent.
	pi.on("agent_settled", async (_event, ctx) => {
		stopSpinner();
		state = hadError ? "error" : "done";
		toolSuffix = undefined;
		render(ctx);

		const cwd = path.basename(process.cwd());
		const headline = hadError ? "❌ Task finished with errors" : "✅ Task completed";
		void sendSystemNotification(pi, `pi — ${cwd}`, `${headline}: ${task ?? "Working"}`);
	});

	pi.on("session_start", async (_event, ctx) => {
		stopSpinner();
		state = "idle";
		task = undefined;
		toolSuffix = undefined;
		hadError = false;
		ctx.ui.setTitle(baseTitle());
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopSpinner();
		ctx.ui.setTitle(baseTitle());
	});
}
