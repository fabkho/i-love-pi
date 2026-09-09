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
| `tab-title` | Show the current task and a running/done indicator in the terminal tab title |

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
- **Warp**: Warp overwrites OSC titles with its own auto-title unless `WARP_DISABLE_AUTO_TITLE` is set. The extension sets that env var itself when it detects `TERM_PROGRAM=WarpTerminal`, so no shell rc changes are needed. If your Warp build still overrides it, add `export WARP_DISABLE_AUTO_TITLE=true` to your `~/.zshrc` as a fallback.
