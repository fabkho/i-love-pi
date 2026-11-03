/**
 * aic-meter — GitHub Copilot "AI credits" (AIC) used in this pi session, plus
 * the account's monthly pool.
 *
 * The `copilot` CLI shows "Session: 22.87 AIC used". Pi has no such counter,
 * but every assistant message already carries its token usage priced in USD
 * (`usage.cost.total`). Copilot bills at 1 AIC = $0.01, and pi's price table
 * for Copilot models uses the same per-million-token rates, so:
 *
 *     AIC = usage.cost.total * 100
 *
 * Checked against a real `copilot` CLI session: its per-call nano-AIU
 * (`copilotUsage.totalNanoAiu`) matched pi's USD cost x 100 for claude-sonnet-5.5.
 * Other models are only as accurate as pi's price table for them — compare
 * against the CLI once before trusting the number.
 *
 * Only messages from the `github-copilot` provider are counted. The session
 * total is rebuilt from the current branch on start/resume/fork/tree
 * navigation, so it survives restarts and follows branches.
 *
 * Monthly pool: read from GitHub's `/copilot_internal/user` through the `gh`
 * CLI (already logged in), cached for a minute. It covers every tool on the
 * account (pi, copilot CLI, editor) and lags the real usage a little.
 *
 * Display:   "AIC 22.9 · 509/25k". With pi-zentui it is published as the custom
 *            value `i-love-pi:aic` (aliased `$aic` in setup/zentui.json, used in
 *            the Minimalist editor's top-right slot in place of `$cost`);
 *            without zentui it falls back to a pi footer status.
 * Command:   /aic   — breakdown by model for this session, plus the monthly pool
 *
 * Env:
 *   PI_AIC_PER_USD     credits per dollar (default 100)
 *   PI_AIC_PROVIDERS   comma-separated provider ids to count (default github-copilot)
 *   PI_AIC_POOL=0      do not query the monthly pool
 *   PI_AIC_COLOR=0     plain text, no colours
 *   PI_AIC_GHE_HOST    GitHub host for the pool query (default: the enterprise
 *                      domain of pi's github-copilot login, else github.com)
 *
 * Quick test:  pi -e ./extensions/aic-meter.ts
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "aic";
/** Key under which the value is published to pi-zentui (alias it as `aic` in zentui.json). */
const ZENTUI_KEY = "i-love-pi:aic";
const PER_USD = Number(process.env.PI_AIC_PER_USD) > 0 ? Number(process.env.PI_AIC_PER_USD) : 100;
const PROVIDERS = new Set(
	(process.env.PI_AIC_PROVIDERS ?? "github-copilot")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean),
);
const POOL_ENABLED = process.env.PI_AIC_POOL !== "0";
const POOL_TTL_MS = 60_000;

interface ModelTotals {
	aic: number;
	messages: number;
	tokens: number;
}

type Totals = Map<string, ModelTotals>;

interface Pool {
	used: number;
	entitlement: number;
	resetDate?: string;
}

/** AIC for one assistant message, or undefined if it should not be counted. */
function messageAic(message: unknown): { model: string; aic: number; tokens: number } | undefined {
	const m = message as
		| {
				role?: string;
				provider?: string;
				model?: string;
				usage?: { totalTokens?: number; cost?: { total?: number } };
		  }
		| undefined;
	if (!m || m.role !== "assistant") return undefined;
	if (!m.provider || !PROVIDERS.has(m.provider)) return undefined;
	const usd = m.usage?.cost?.total;
	if (typeof usd !== "number" || !Number.isFinite(usd)) return undefined;
	return { model: m.model ?? "unknown", aic: usd * PER_USD, tokens: m.usage?.totalTokens ?? 0 };
}

function add(totals: Totals, r: { model: string; aic: number; tokens: number }): void {
	const t = totals.get(r.model) ?? { aic: 0, messages: 0, tokens: 0 };
	t.aic += r.aic;
	t.messages += 1;
	t.tokens += r.tokens;
	totals.set(r.model, t);
}

function sum(totals: Totals): number {
	let s = 0;
	for (const t of totals.values()) s += t.aic;
	return s;
}

function fmt(aic: number): string {
	return aic >= 100 ? aic.toFixed(0) : aic.toFixed(1);
}

/** 508.7 -> "509", 25000 -> "25k" */
function fmtPool(n: number): string {
	if (n >= 10_000) return `${Math.round(n / 1000)}k`;
	return Math.round(n).toLocaleString("en-US");
}

/** Host of pi's github-copilot login (reads only the `enterpriseUrl` field). */
async function copilotHost(): Promise<string> {
	if (process.env.PI_AIC_GHE_HOST) return process.env.PI_AIC_GHE_HOST;
	try {
		const dir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
		const auth = JSON.parse(await readFile(join(dir, "auth.json"), "utf8")) as {
			"github-copilot"?: { enterpriseUrl?: unknown };
		};
		const url = auth["github-copilot"]?.enterpriseUrl;
		if (typeof url === "string" && /^[a-z0-9.-]+$/i.test(url.trim())) return url.trim();
	} catch {
		// fall through to github.com
	}
	return "github.com";
}

function gh(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("gh", args, { timeout: 15_000, maxBuffer: 1024 * 1024 }, (err, stdout) =>
			err ? reject(err) : resolve(stdout),
		);
	});
}

async function fetchPool(): Promise<Pool | undefined> {
	try {
		const host = await copilotHost();
		const out = await gh(["api", "--hostname", host, "/copilot_internal/user"]);
		const data = JSON.parse(out) as {
			quota_reset_date?: string;
			quota_snapshots?: { premium_interactions?: { entitlement?: number; quota_remaining?: number } };
		};
		const q = data.quota_snapshots?.premium_interactions;
		if (!q || typeof q.entitlement !== "number" || typeof q.quota_remaining !== "number") return undefined;
		return { used: q.entitlement - q.quota_remaining, entitlement: q.entitlement, resetDate: data.quota_reset_date };
	} catch {
		return undefined;
	}
}

// ── Colors (tokyo-midnight-fk palette) ──────────────────────────────
// pi-zentui keeps a publisher's SGR styling in its default "original" colour
// mode and closes it with a reset, so these cannot leak into the border.
// Set PI_AIC_COLOR=0 for plain text.
const COLOR = process.env.PI_AIC_COLOR !== "0";
const C = {
	label: "#6b7aa8", // comment
	session: "#7dcfff", // cyan
	sep: "#5b6b9c", // muted ink
	pool: "#a3aed2", // fg-dim
	warn: "#e0af68", // yellow
	crit: "#f7768e", // red
};

function paint(hex: string, text: string, bold = false): string {
	if (!COLOR) return text;
	const n = Number.parseInt(hex.slice(1), 16);
	const rgb = `${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`;
	return `\x1b[${bold ? "1;" : ""}38;2;${rgb}m${text}\x1b[${bold ? "22;" : ""}39m`;
}

/** "AIC 22.9 · 509/25k" — pool turns yellow from 70 %, red from 90 % of the month. */
function styledText(sessionAic: number, pool: Pool | undefined): string {
	let text = `${paint(C.label, "AIC")} ${paint(C.session, fmt(sessionAic), true)}`;
	if (pool) {
		const ratio = pool.entitlement > 0 ? pool.used / pool.entitlement : 0;
		const color = ratio >= 0.9 ? C.crit : ratio >= 0.7 ? C.warn : C.pool;
		text += `${paint(C.sep, " · ")}${paint(color, fmtPool(pool.used))}${paint(C.label, `/${fmtPool(pool.entitlement)}`)}`;
	}
	return text;
}

export default function (pi: ExtensionAPI) {
	let totals: Totals = new Map();
	let pool: Pool | undefined;
	let poolFetchedAt = 0;
	let poolInFlight = false;

	const render = (ctx: ExtensionContext): void => {
		if (!ctx.hasUI) return;
		let text: string | undefined;
		if (totals.size > 0) text = styledText(sum(totals), pool);
		// pi-zentui publisher protocol v1: when a zentui template references our key,
		// publish the value there and drop the footer fallback; otherwise fall back to
		// pi's own footer status.
		const capability = { supported: false, active: false, key: ZENTUI_KEY };
		pi.events.emit("zentui:variable-capability", capability);
		if (capability.active) {
			pi.events.emit("zentui:variable", { key: ZENTUI_KEY, text });
			ctx.ui.setStatus(STATUS_KEY, undefined);
		} else {
			ctx.ui.setStatus(STATUS_KEY, text);
		}
	};

	/** Refresh the monthly pool in the background (at most once per minute). */
	const refreshPool = (ctx: ExtensionContext, force = false): void => {
		if (!POOL_ENABLED || poolInFlight) return;
		if (!force && Date.now() - poolFetchedAt < POOL_TTL_MS) return;
		poolInFlight = true;
		void fetchPool()
			.then((p) => {
				poolFetchedAt = Date.now();
				if (p) pool = p;
				render(ctx);
			})
			.finally(() => {
				poolInFlight = false;
			});
	};

	const rebuild = (ctx: ExtensionContext): void => {
		totals = new Map();
		for (const entry of ctx.sessionManager.getBranch() as Array<{ type?: string; message?: unknown }>) {
			if (entry.type !== "message") continue;
			const r = messageAic(entry.message);
			if (r) add(totals, r);
		}
		render(ctx);
		refreshPool(ctx);
	};

	pi.on("session_start", async (_event, ctx) => rebuild(ctx));
	pi.on("session_tree", async (_event, ctx) => rebuild(ctx));
	pi.on("session_shutdown", async () => {
		pi.events.emit("zentui:variable", { key: ZENTUI_KEY, text: undefined });
	});

	pi.on("message_end", async (event, ctx) => {
		const r = messageAic(event.message);
		if (!r) return;
		add(totals, r);
		render(ctx);
		refreshPool(ctx);
	});

	pi.registerCommand("aic", {
		description: "Show GitHub Copilot AI credits (AIC): this session and the monthly pool",
		handler: async (_args, ctx) => {
			const lines: string[] = [];
			if (totals.size === 0) {
				lines.push(`No ${[...PROVIDERS].join("/")} usage in this session yet.`);
			} else {
				for (const [model, t] of [...totals.entries()].sort((a, b) => b[1].aic - a[1].aic)) {
					lines.push(
						`${model}: ${fmt(t.aic)} AIC (${t.messages} msgs, ${t.tokens.toLocaleString("en-US")} tok)`,
					);
				}
				lines.push(`Session: ${fmt(sum(totals))} AIC  (estimate: USD cost x ${PER_USD})`);
			}
			if (POOL_ENABLED) {
				const p = await fetchPool();
				if (p) {
					pool = p;
					poolFetchedAt = Date.now();
					const pct = p.entitlement > 0 ? ((p.used / p.entitlement) * 100).toFixed(1) : "?";
					lines.push(
						`Month: ${p.used.toFixed(1)} / ${p.entitlement.toLocaleString("en-US")} AIC (${pct}%)` +
							(p.resetDate ? `, resets ${p.resetDate}` : ""),
					);
					render(ctx);
				} else {
					lines.push("Month: unavailable (gh not logged in for the Copilot host?)");
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
