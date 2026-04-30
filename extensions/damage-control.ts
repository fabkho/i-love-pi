/**
 * Damage Control — Blocks dangerous bash commands and restricts sensitive paths
 *
 * Reads rules from (first found):
 *   .pi/damage-control-rules.yaml   (project-level)
 *   ~/.pi/damage-control-rules.yaml (global)
 *
 * Original: github.com/disler/pi-vs-claude-code
 */

import type { ExtensionAPI, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { parse as yamlParse } from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface Rule {
	pattern: string;
	reason: string;
	ask?: boolean;
}

interface Rules {
	bashToolPatterns: Rule[];
	zeroAccessPaths: string[];
	readOnlyPaths: string[];
	noDeletePaths: string[];
}

export default function (pi: ExtensionAPI) {
	let rules: Rules = { bashToolPatterns: [], zeroAccessPaths: [], readOnlyPaths: [], noDeletePaths: [] };

	function resolvePath(p: string, cwd: string): string {
		if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
		return path.resolve(cwd, p);
	}

	function isPathMatch(targetPath: string, pattern: string, cwd: string): boolean {
		const resolvedPattern = pattern.startsWith("~")
			? path.join(os.homedir(), pattern.slice(1))
			: pattern;

		if (resolvedPattern.endsWith("/")) {
			const abs = path.isAbsolute(resolvedPattern) ? resolvedPattern : path.resolve(cwd, resolvedPattern);
			return targetPath.startsWith(abs);
		}

		const regexPattern = resolvedPattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, ".*");
		const regex = new RegExp(`^${regexPattern}$|^${regexPattern}/|/${regexPattern}$|/${regexPattern}/`);
		const relativePath = path.relative(cwd, targetPath);

		return regex.test(targetPath) || regex.test(relativePath)
			|| targetPath.includes(resolvedPattern) || relativePath.includes(resolvedPattern);
	}

	pi.on("session_start", async (_event, ctx) => {
		const projectRulesPath = path.join(ctx.cwd, ".pi", "damage-control-rules.yaml");
		const globalRulesPath = path.join(os.homedir(), ".pi", "damage-control-rules.yaml");
		const rulesPath = fs.existsSync(projectRulesPath) ? projectRulesPath
			: fs.existsSync(globalRulesPath) ? globalRulesPath : null;

		try {
			if (rulesPath) {
				const content = fs.readFileSync(rulesPath, "utf8");
				const loaded = yamlParse(content) as Partial<Rules>;
				rules = {
					bashToolPatterns: loaded.bashToolPatterns || [],
					zeroAccessPaths: loaded.zeroAccessPaths || [],
					readOnlyPaths: loaded.readOnlyPaths || [],
					noDeletePaths: loaded.noDeletePaths || [],
				};
				const total = rules.bashToolPatterns.length + rules.zeroAccessPaths.length + rules.readOnlyPaths.length + rules.noDeletePaths.length;
				const source = rulesPath === projectRulesPath ? "project" : "global";
				ctx.ui.notify(`🛡️ Damage-Control: ${total} rules loaded (${source})`);
				ctx.ui.setStatus(`🛡️ ${total} rules`, "damage-control");
			} else {
				ctx.ui.notify("🛡️ Damage-Control: no rules file found");
			}
		} catch (err) {
			ctx.ui.notify(`🛡️ Damage-Control error: ${err instanceof Error ? err.message : String(err)}`);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		let violationReason: string | null = null;
		let shouldAsk = false;

		const checkPaths = (pathsToCheck: string[]) => {
			for (const p of pathsToCheck) {
				const resolved = resolvePath(p, ctx.cwd);
				for (const zap of rules.zeroAccessPaths) {
					if (isPathMatch(resolved, zap, ctx.cwd)) return `Zero-access path: ${zap}`;
				}
			}
			return null;
		};

		const inputPaths: string[] = [];
		if (isToolCallEventType("read", event) || isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			inputPaths.push(event.input.path);
		} else if (isToolCallEventType("grep", event) || isToolCallEventType("find", event) || isToolCallEventType("ls", event)) {
			inputPaths.push(event.input.path || ".");
		}

		if (isToolCallEventType("grep", event) && event.input.glob) {
			for (const zap of rules.zeroAccessPaths) {
				if (event.input.glob.includes(zap) || isPathMatch(event.input.glob, zap, ctx.cwd)) {
					violationReason = `Glob matches zero-access path: ${zap}`; break;
				}
			}
		}

		if (!violationReason) violationReason = checkPaths(inputPaths);

		if (!violationReason) {
			if (isToolCallEventType("bash", event)) {
				const cmd = event.input.command;
				for (const rule of rules.bashToolPatterns) {
					if (new RegExp(rule.pattern).test(cmd)) {
						violationReason = rule.reason; shouldAsk = !!rule.ask; break;
					}
				}
				if (!violationReason) {
					for (const zap of rules.zeroAccessPaths) {
						if (cmd.includes(zap)) { violationReason = `Command references zero-access path: ${zap}`; break; }
					}
				}
				if (!violationReason) {
					for (const rop of rules.readOnlyPaths) {
						if (cmd.includes(rop) && (/[\s>|]/.test(cmd) || /\b(rm|mv|sed)\b/.test(cmd))) {
							violationReason = `Command may modify read-only path: ${rop}`; break;
						}
					}
				}
				if (!violationReason) {
					for (const ndp of rules.noDeletePaths) {
						if (cmd.includes(ndp) && /\b(rm|mv)\b/.test(cmd)) {
							violationReason = `Command tries to delete protected path: ${ndp}`; break;
						}
					}
				}
			} else if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
				for (const p of inputPaths) {
					const resolved = resolvePath(p, ctx.cwd);
					for (const rop of rules.readOnlyPaths) {
						if (isPathMatch(resolved, rop, ctx.cwd)) { violationReason = `Read-only path: ${rop}`; break; }
					}
				}
			}
		}

		if (violationReason) {
			if (shouldAsk) {
				const confirmed = await ctx.ui.confirm(
					"🛡️ Damage-Control",
					`Dangerous command: ${violationReason}\n\nCommand: ${isToolCallEventType("bash", event) ? event.input.command : JSON.stringify(event.input)}\n\nProceed?`,
					{ timeout: 30000 }
				);
				if (!confirmed) {
					ctx.ui.setStatus(`⚠️ Blocked: ${violationReason.slice(0, 40)}`, "damage-control");
					pi.appendEntry("damage-control-log", { tool: event.toolName, input: event.input, rule: violationReason, action: "blocked_by_user" });
					ctx.abort();
					return { block: true, reason: `🛑 BLOCKED: ${violationReason} (denied)\n\nDo NOT retry with alternative commands. Report this to the user and ask how to proceed.` };
				}
				pi.appendEntry("damage-control-log", { tool: event.toolName, input: event.input, rule: violationReason, action: "confirmed" });
				return { block: false };
			} else {
				ctx.ui.notify(`🛑 Damage-Control blocked ${event.toolName}: ${violationReason}`);
				ctx.ui.setStatus(`⚠️ Blocked: ${violationReason.slice(0, 40)}`, "damage-control");
				pi.appendEntry("damage-control-log", { tool: event.toolName, input: event.input, rule: violationReason, action: "blocked" });
				ctx.abort();
				return { block: true, reason: `🛑 BLOCKED: ${violationReason}\n\nDo NOT retry with alternative commands. Report this to the user and ask how to proceed.` };
			}
		}

		return { block: false };
	});
}
