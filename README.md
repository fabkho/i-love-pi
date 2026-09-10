# i-love-pi

Personal pi setup — non-anny extensions.

## Quick Start

```bash
pi install git:github.com/fabkho/i-love-pi
```

Or manually:

```bash
git clone https://github.com/fabkho/i-love-pi.git ~/.pi/i-love-pi
```

Add to `~/.pi/settings.json`:

```json
{
  "packages": ["file:~/.pi/i-love-pi"]
}
```

Run `pi` → `/reload`.

## What's Inside

### Extensions

| Extension | Description |
|-----------|-------------|
| `fork-tab` | Fork session into new tab with a keybinding |
| `inline-skills` | Type `/` anywhere in a message to insert a skill |
| `tab-title` | Show the current task and a running/done indicator in the terminal tab title, plus a system notification when the run finishes |
| `editor-border` | Labels in the editor border, from any extension that claims a slot |

#### inline-skills

Core pi only opens the skill/command menu when `/` starts the message. With this extension you can write a sentence, hit `/` mid-text, pick a skill, and keep editing:

```
Fix this flaky test /          ← menu opens, pick "diagnose"
Fix this flaky test /skill:diagnose and report
```

On submit the skill is expanded by pi's own skill mechanism, with the rest of your sentence passed as instructions.

Notes:

- Mid-text `/` shows **skills only**; `/` at the start of the message behaves as before (full command menu).
- One inline skill per message; a second `/skill:` token is left as plain text.
- If the menu closes (no matches), retype the `/` to reopen it.
- Relies on pi internals (tested against pi 0.84.x). If a pi update breaks it, the extension fails at load — remove it from the extensions list until updated.

#### tab-title

Puts the agent's current task and a running/done indicator in the terminal tab title, so you can see what pi is doing — and whether it's finished — from the tab bar without focusing the tab. Works in Warp, Ghostty, iTerm2, WezTerm, kitty and any other terminal that honours OSC title escapes.

| State | Tab title |
|---|---|
| Idle (fresh session) | `π - session - my-repo` |
| Running | `⠋ Fix auth bug - my-repo` (animated spinner) |
| Running + tool | `⠙ Fix auth bug — editing auth.ts - my-repo` |
| Done, no errors | `✅ Fix auth bug - my-repo` |
| Done, a tool errored | `❌ Fix auth bug - my-repo` |

Notes:

- The spinner animates the whole time the agent is busy (including while thinking between tool calls). Moving title = still working; static ✅/❌ = finished.
- ✅/❌ **sticks** after the run settles until you send the next prompt, so you can switch tabs, come back later and still see the outcome.
- ❌ is shown if any tool call during the run errored; otherwise ✅. "Done" waits for `agent_settled`, so it won't show while an auto-retry, compaction or queued follow-up is pending.
- The task text is the prompt that started the run (truncated). The tool suffix shows live activity: `reading foo.ts`, `editing bar.ts`, `running: npm test`, `searching "pattern"`, …
- **System notification**: when the run settles, a native OS notification is sent too — `✅ Task completed: Fix auth bug` (or `❌ Task finished with errors: …`) with the title `pi — my-repo`. Uses `osascript` on macOS, `notify-send` on Linux, a PowerShell balloon on Windows; best-effort and silently skipped if the tool is missing. Disable with `export PI_TAB_TITLE_NOTIFY=0`.
- **Warp**: Warp overwrites OSC titles with its own auto-title unless `WARP_DISABLE_AUTO_TITLE` is set. The extension sets that env var itself when it detects `TERM_PROGRAM=WarpTerminal`, so no shell rc changes are needed. If your Warp build still overrides it, add `export WARP_DISABLE_AUTO_TITLE=true` to your `~/.zshrc` as a fallback.
#### editor-border

The editor border already carries what you glance at — branch, model, context —
and has spare width between them. This makes that width available: claim a slot,
give it a short label, and it appears in the frame you already read.

```
╰─ main * ──────────── ⚙ 3 failing · 🌐 4 missing ─ my-project ─╯
```

Labels are given longest-first, and the border shows the longest that fits:

```ts
import { setBorderSlot } from "./extensions/editor-border/slots.ts";

setBorderSlot({
  id: "build",
  order: 10,
  labels: ["⚙ 3 failing", "⚙ 3"],
});
```

A crowded border loses detail before it loses a slot, and loses the
highest-`order` slot before the lowest. Labels may also be a function, which is
re-read on every render.

Because pi gives each extension its own module registry, the slots live in the
global symbol registry (`i-love-pi.editor-border.slots`) — so an extension that
has never heard of this one can still claim a slot by writing to it directly.

Sources under `sources/` adapt something into a slot; `i18n-kit` reads the
coverage published by `@the-i18n-kit/pi` and offers it. Delete a source and the
border carries on with whatever else is registered.

| Variable | Effect |
|---|---|
| `PI_BORDER=off` | No labels |
| `PI_BORDER_PLACEMENT=top` | Label the top edge instead of the bottom |

**How it works, and how it fails.** pi's editor chrome belongs to whichever
extension owns the editor component, and its metadata set is closed. So this
wraps the installed editor and places labels into the rule of a border
afterwards, consuming spare width so the frame keeps its width and styling. It
is surgery on someone else's output, and is written to fail by doing nothing: no
editor, no border, an unfamiliar frame or a line too narrow, and the editor
renders exactly as it would have.
