/**
 * fork-tab — Fork session into a new terminal tab (Ghostty or Warp).
 * Detects which terminal is active and uses the appropriate method.
 * Shows a message selector so the user can pick which point in history to fork from,
 * matching the behaviour of the integrated /fork command.
 *
 * Works with both stock Pi and OMP.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// ── Type helpers ─────────────────────────────────────────────────────

interface UserMessage {
  entryId: string;
  text: string;
  parentId: string | null;
}

// ── AppleScript: Ghostty new tab ─────────────────────────────────────

const GHOSTTY_TAB_SCRIPT = `on run argv
	set targetCwd to item 1 of argv
	set startupInput to item 2 of argv
	tell application "Ghostty"
		set cfg to new surface configuration
		set initial working directory of cfg to targetCwd
		set initial input of cfg to startupInput
		if (count of windows) > 0 then
			try
				set frontWindow to front window
				new tab frontWindow with configuration cfg
			on error
				new window with configuration cfg
			end try
		else
			new window with configuration cfg
		end if
		activate
	end tell
end run`;

// ── AppleScript: Ghostty split ───────────────────────────────────────

const GHOSTTY_SPLIT_SCRIPT = `on run argv
	set targetCwd to item 1 of argv
	set startupInput to item 2 of argv
	tell application "Ghostty"
		set cfg to new surface configuration
		set initial working directory of cfg to targetCwd
		set initial input of cfg to startupInput
		if (count of windows) > 0 then
			try
				set frontWindow to front window
				set targetTerminal to focused terminal of selected tab of frontWindow
				split targetTerminal direction right with configuration cfg
			on error
				new window with configuration cfg
			end try
		else
			new window with configuration cfg
		end if
		activate
	end tell
end run`;

// ── AppleScript: Warp new tab ────────────────────────────────────────

const WARP_TAB_SCRIPT = `on run argv
	set targetCwd to item 1 of argv
	set startupInput to item 2 of argv
	tell application "Warp"
		activate
		delay 0.3
		tell application "System Events"
			tell process "Warp"
				keystroke "t" using command down
				delay 4.0
				keystroke "cd " & targetCwd & return
				delay 1.0
				keystroke startupInput
			end tell
		end tell
	end tell
end run`;

// ── Helpers ──────────────────────────────────────────────────────────

function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getAgentBinary(): string[] {
  const currentScript = process.argv[1];
  if (currentScript && existsSync(currentScript)) {
    return [process.execPath, currentScript];
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return [process.execPath];
  }

  // Detect if we're running as omp or pi
  if (process.env.OMP_AGENT_DIR || process.argv[1]?.includes("omp")) {
    return ["omp"];
  }
  return ["pi"];
}

function buildStartupInput(sessionFile: string | undefined, prompt: string): string {
  const commandParts = [...getAgentBinary()];

  if (sessionFile) {
    commandParts.push("--session", sessionFile);
  }

  if (prompt.length > 0) {
    commandParts.push("--", prompt);
  }

  return `${commandParts.map(shellQuote).join(" ")}\n`;
}

/**
 * Extract the display text from a user message's content, which may be
 * a plain string or an array of content blocks.
 */
function extractUserMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(" ");
  }
  return "";
}

async function detectTerminal(pi: ExtensionAPI): Promise<"ghostty" | "warp" | null> {
  // Check TERM_PROGRAM env var first
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() ?? "";
  if (termProgram.includes("ghostty")) return "ghostty";
  if (termProgram.includes("warp")) return "warp";

  // Fallback: check which app is frontmost
  const result = await pi.exec("osascript", [
    "-e",
    'tell application "System Events" to get name of first application process whose frontmost is true',
  ]);
  const frontApp = result.stdout?.trim().toLowerCase() ?? "";
  if (frontApp.includes("ghostty")) return "ghostty";
  if (frontApp.includes("warp")) return "warp";

  return null;
}

/**
 * Collect all user messages from the current session for the fork selector.
 * Returns them in chronological order (oldest first, newest last).
 */
function getUserMessages(ctx: ExtensionCommandContext): UserMessage[] {
  const entries = ctx.sessionManager.getEntries();
  const messages: UserMessage[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    // SessionMessageEntry has message.role
    const msg = entry as { message: { role: string; content: unknown } };
    if (msg.message.role !== "user") continue;
    const text = extractUserMessageText(msg.message.content);
    if (text) {
      messages.push({
        entryId: entry.id,
        text,
        parentId: entry.parentId,
      });
    }
  }
  return messages;
}

/**
 * Create a forked session file.
 *
 * @param ctx        Extension command context
 * @param targetLeafId  Entry ID to fork from (the new session includes all entries
 *                      from root up to this ID). Pass undefined to fork at the
 *                      current leaf. Pass null to create a fresh session (no entries).
 */
async function createForkedSession(
  ctx: ExtensionCommandContext,
  targetLeafId: string | null | undefined,
): Promise<string | undefined> {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) return undefined;

  const sessionDir = path.dirname(sessionFile);
  const currentHeader = ctx.sessionManager.getHeader();

  // Determine entries to include:
  // - undefined  → fork at current position (full branch)
  // - null       → fresh session (no entries, just header)
  // - string     → branch up to that entry
  let branchEntries: Array<Record<string, unknown>>;
  if (targetLeafId === null) {
    branchEntries = [];
  } else {
    branchEntries = ctx.sessionManager.getBranch(
      targetLeafId,
    ) as unknown as Array<Record<string, unknown>>;
  }

  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");
  const newSessionId = randomUUID();
  const newSessionFile = path.join(
    sessionDir,
    `${fileTimestamp}_${newSessionId}.jsonl`,
  );

  const newHeader = {
    type: "session",
    version: currentHeader?.version ?? 3,
    id: newSessionId,
    timestamp,
    cwd: currentHeader?.cwd ?? ctx.cwd,
    parentSession: sessionFile,
  };

  const lines =
    [JSON.stringify(newHeader), ...branchEntries.map((e) => JSON.stringify(e))].join(
      "\n",
    ) + "\n";

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(newSessionFile, lines, "utf8");

  return newSessionFile;
}

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("fork-tab", {
    description:
      "Fork this session into a new terminal tab. Shows a message selector so you can pick which point in history to fork from. Detects Ghostty/Warp automatically. Usage: /fork-tab [prompt]",
    handler: async (args, ctx) => {
      if (process.platform !== "darwin") {
        ctx.ui.notify("/fork-tab requires macOS", "error");
        return;
      }

      const terminal = await detectTerminal(pi);
      if (!terminal) {
        ctx.ui.notify(
          "Could not detect terminal (Ghostty or Warp). Set TERM_PROGRAM env var.",
          "error",
        );
        return;
      }

      const prompt = args.trim();

      // ── Gather user messages for the fork selector ───────────────
      const userMessages = getUserMessages(ctx);

      let targetLeafId: string | null | undefined;

      if (userMessages.length > 0) {
        // Build display options — trim long messages to fit the selector UI
        const maxDisplayLen = 80;
        const options = userMessages.map((msg, i) => {
          const prefix = `${i + 1}`.padStart(2, " ");
          const body =
            msg.text.length > maxDisplayLen
              ? msg.text.substring(0, maxDisplayLen - 3) + "..."
              : msg.text;
          return `${prefix}: ${body}`;
        });

        const selected = await ctx.ui.select(
          "Fork from which message?",
          options,
        );

        if (selected !== undefined) {
          const idx = options.indexOf(selected);
          if (idx >= 0) {
            const chosenMsg = userMessages[idx];
            // Fork BEFORE the selected message, matching the integrated
            // /fork command behaviour: the new session includes everything
            // up to (but not including) the chosen message.
            targetLeafId = chosenMsg.parentId; // null if root message
          }
        }
        // If the user cancels (selected === undefined), targetLeafId stays
        // undefined, which means we fork at the current position (full branch).
      }

      const forkedSessionFile = await createForkedSession(ctx, targetLeafId);
      const startupInput = buildStartupInput(forkedSessionFile, prompt);

      let script: string;
      if (terminal === "ghostty") {
        script = GHOSTTY_TAB_SCRIPT;
      } else {
        script = WARP_TAB_SCRIPT;
      }

      const result = await pi.exec("osascript", [
        "-e",
        script,
        "--",
        ctx.cwd,
        startupInput,
      ]);

      if (result.code !== 0) {
        const reason =
          result.stderr?.trim() || result.stdout?.trim() || "unknown error";
        ctx.ui.notify(
          `Failed to fork to ${terminal} tab: ${reason}`,
          "error",
        );
        return;
      }

      const suffix = prompt ? " with prompt" : "";
      ctx.ui.notify(`Forked → new ${terminal} tab${suffix}`, "success");
    },
  });

  // Also register /fork-split for Ghostty split (right pane)
  pi.registerCommand("fork-split", {
    description:
      "Fork this session into a Ghostty right-hand split. Shows a message selector so you can pick which point in history to fork from. Usage: /fork-split [prompt]",
    handler: async (args, ctx) => {
      if (process.platform !== "darwin") {
        ctx.ui.notify("/fork-split requires macOS", "error");
        return;
      }

      const prompt = args.trim();

      // ── Gather user messages for the fork selector ───────────────
      const userMessages = getUserMessages(ctx);

      let targetLeafId: string | null | undefined;

      if (userMessages.length > 0) {
        const maxDisplayLen = 80;
        const options = userMessages.map((msg, i) => {
          const prefix = `${i + 1}`.padStart(2, " ");
          const body =
            msg.text.length > maxDisplayLen
              ? msg.text.substring(0, maxDisplayLen - 3) + "..."
              : msg.text;
          return `${prefix}: ${body}`;
        });

        const selected = await ctx.ui.select(
          "Fork from which message?",
          options,
        );

        if (selected !== undefined) {
          const idx = options.indexOf(selected);
          if (idx >= 0) {
            const chosenMsg = userMessages[idx];
            targetLeafId = chosenMsg.parentId;
          }
        }
      }

      const forkedSessionFile = await createForkedSession(ctx, targetLeafId);
      const startupInput = buildStartupInput(forkedSessionFile, prompt);

      const result = await pi.exec("osascript", [
        "-e",
        GHOSTTY_SPLIT_SCRIPT,
        "--",
        ctx.cwd,
        startupInput,
      ]);

      if (result.code !== 0) {
        const reason =
          result.stderr?.trim() || result.stdout?.trim() || "unknown error";
        ctx.ui.notify(`Failed to fork split: ${reason}`, "error");
        return;
      }

      const suffix = prompt ? " with prompt" : "";
      ctx.ui.notify(`Forked → Ghostty split${suffix}`, "success");
    },
  });
}
