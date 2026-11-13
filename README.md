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

### Sharing this setup with someone else

A pi theme is a colour-token JSON file and nothing more — it cannot carry code,
so the slot mechanism cannot live *in* a theme. It lives in this package, which
is the thing to hand over. Installing it brings the theme and the extensions
that draw the chrome; `setup/apply.sh` places the one config a package cannot
carry.

```bash
./setup/apply.sh --write-settings
```

That copies `zentui.json` and sets `theme` and the package entries in
`settings.json`, backing up anything it replaces. Drop `--write-settings` to
copy the config and only print what is left.

Then restart pi, or `/reload` a running session.

Two dependencies worth knowing before you promise someone this look:

| Dependency | Why |
|---|---|
| **A dark terminal** | The palette is built for one, and `toolPendingBg`/`toolSuccessBg` are `""` — tool rows defer to *your* background by design. On a white terminal body text falls to ~1.5:1 contrast. |
| **pi-zentui, for the frame** | `zentui.json` describes pi-zentui's frame: border, cost and context readout, framed user messages, and the working line with its live token rate. Without pi-zentui, pi draws its own editor. |

`setup/zentui.json` is a config, not a theme: pi-zentui reads it from
`~/.pi/agent/zentui.json` with no package or project discovery, which is why it
has to be copied rather than shipped. `apply.sh` backs up an existing one and
leaves an identical one alone, so it is safe to re-run.

## What's Inside

### Extensions

| Extension | Description |
|-----------|-------------|
| `fork-tab` | Fork session into new tab with a keybinding |
| `inline-skills` | Type `/` anywhere in a message to insert a skill |
| `tab-title` | Name the terminal tab after the session's first prompt (≤5 words) and show a running / ✅ / ❓ / ❌ indicator, plus a system notification when the run finishes |
| `quiet-tools` | Collapse shell calls to one line, expand them on demand |

### Themes

| Theme | Description |
|-------|-------------|
| `tokyo-midnight-fk` | Tokyo Night palette on a deep blue-black base, tuned for a quiet transcript |


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

Names the terminal tab after the session and shows a running/outcome indicator, so you can see what a tab is about — and whether the agent is finished — from the tab bar without focusing it. Works in Warp, Ghostty, iTerm2, WezTerm, kitty and any other terminal that honours OSC title escapes.

| State | Tab title |
|---|---|
| Idle (fresh session) | `π - session - my-repo` |
| Running | `⠋ Fix auth bug - my-repo` (animated spinner) |
| Running + tool | `⠙ Fix auth bug — editing auth.ts - my-repo` |
| Waiting on a confirm/select prompt | `❓ Fix auth bug — needs input - my-repo` |
| Done, completed | `✅ Fix auth bug - my-repo` |
| Done, agent asked you something | `❓ Fix auth bug - my-repo` |
| Done, error / aborted | `❌ Fix auth bug - my-repo` |

**Tab name**

- Set **once per session** from the first prompt and never changed by follow-up prompts, so the tab stays recognisable. Max 5 words.
- A heuristic name (first words of the prompt, minus `@file` / `/skill` tokens) appears instantly; in the background the current model is asked for a tighter ≤5-word summary (e.g. `Add community entity actions`) which replaces it. `export PI_TAB_TITLE_LLM=0` to skip the model call.
- Resumed / forked sessions are named from their first user message.
- `/tab-title Some name` overrides it manually; `/tab-title` with no args clears it so the next prompt names the tab again.

**Outcome**

- The spinner animates the whole time the agent is busy (including while thinking between tool calls). Moving title = still working; static ✅/❓/❌ = finished.
- The outcome **sticks** after the run settles until you send the next prompt, so you can switch tabs, come back later and still see it.
- Tool errors during a run do **not** make it ❌ — the agent normally recovers from a failed grep/edit. Instead: ❌ if the final assistant message ended with an error or was aborted (Ctrl+C, provider error); ❓ if the agent stopped on a question to you; ✅ otherwise. "Done" waits for `agent_settled`, so it won't show while an auto-retry, compaction or queued follow-up is pending.
- The tool suffix shows live activity: `reading foo.ts`, `editing bar.ts`, `running: npm test`, `searching "pattern"`, …
- **System notification**: when the run settles, a native OS notification is sent too — `✅ Task completed: Fix auth bug` / `❓ Needs your input: …` / `❌ Task failed or aborted: …` with the title `pi — my-repo`. Uses `osascript` on macOS, `notify-send` on Linux, a PowerShell balloon on Windows; best-effort and silently skipped if the tool is missing. Disable with `export PI_TAB_TITLE_NOTIFY=0`.
- `export PI_TAB_TITLE_DEBUG=1` logs naming decisions to stderr.
- **Warp**: Warp overwrites OSC titles with its own auto-title unless `WARP_DISABLE_AUTO_TITLE` is set. The extension sets that env var itself when it detects `TERM_PROGRAM=WarpTerminal`, so no shell rc changes are needed. If your Warp build still overrides it, add `export WARP_DISABLE_AUTO_TITLE=true` to your `~/.zshrc` as a fallback.
#### quiet-tools

Other extensions can replace the `$ command` header and the collapsed status line for commands they recognise. They do this by registering a `BashCallFormatter` in `globalThis[Symbol.for("pi.bash-call-formatters")]` (a `Map` keyed by id). For example, pi-orca-coordinator renders `orca orchestration ask …` as `⧉ orca ask [a · b · c] <question>`. Formatters are looked up at render time; a formatter that throws falls back to stock rendering.

A run of shell commands is mostly output you scroll past. The command is the
interesting part; its `stdout` usually isn't. pi previews a few lines of every
command by default, which turns a long run into a wall of text.

This collapses each `bash` row to a single status line and hands the output
back to pi's own renderer the moment you ask for it:

```
$ npm test
✓ 12.4s · 38 lines · (ctrl+o to expand)
```

`Ctrl+O` is pi's existing tool-expansion toggle, so it expands every tool row in
the transcript at once — the hint follows your keybinding config rather than
hardcoding `ctrl+o`. Failed commands keep their first line in the collapsed view,
because that is the part you actually want:

```
$ npm run build
✗ TS2345: Argument of type 'string' is not assignable · 3.1s
```

Running commands show a live timer; output with fewer lines than the hint
threshold stays a clean `✓ 0.1s · 2 lines`.

**How it works.** This overrides the built-in `bash` tool by name — the
documented way to replace a built-in. Each slot is inherited separately, so
execution delegates to pi's own `createBashToolDefinition(cwd)` and only the
`renderResult` slot is replaced. Shell resolution, output truncation, session
env vars and the `BashToolDetails` result shape are pi's, unchanged; `$ command`
still renders as the built-in header; and the description, schema and prompt
metadata the model sees are taken verbatim from pi's definition.

| Variable | Effect |
|---|---|
| `PI_QUIET_TOOLS=off` | Don't override anything; `bash` renders as stock |
| `PI_QUIET_TOOLS_HINT_LINES=n` | Output lines before the expand hint appears (default 4) |

Only `bash` is touched. `read`, `grep`, `find` and `ls` keep pi's rendering,
since their output is usually the point of the call.

#### tokyo-midnight-fk

The palette is Tokyo Night on a deep blue-black base, tuned for a transcript
that stays quiet:

- **Tool boxes are transparent.** `toolPendingBg` and `toolSuccessBg` are empty
(terminal default), so tool rows read as text instead of nested dark panels.
Only a failing tool gets a faint red tint (`toolErrorBg`), so failures still
catch the eye in a long run.
- **Output recedes, results don't.** `toolOutput` is a step dimmer than body
text, so a command's output sits behind the command itself.
- **A thinking gradient** runs `thinkingOff → thinkingMinimal → … → thinkingMax`
from the border colour up through blue, cyan and magenta, so the editor border
tells you the thinking level at a glance.

Registered as a package theme (`pi.themes` in `package.json`), so it travels
with the repo. Editing the active theme file hot-reloads it.
