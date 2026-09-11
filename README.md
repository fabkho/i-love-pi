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

Three dependencies worth knowing before you promise someone this look:

| Dependency | Why |
|---|---|
| **A dark terminal** | The palette is built for one, and `toolPendingBg`/`toolSuccessBg` are `""` — tool rows defer to *your* background by design. On a white terminal body text falls to ~1.5:1 contrast. |
| **Nothing else, for the labels** | `editor-border` labels whatever editor is installed, and when none is it installs pi's own `CustomEditor` and labels that — so a solo install works. pi-zentui is what gives you the frame `zentui.json` describes (cost and context readout, framed messages), not what makes labels appear. |
| **The kit, for the kit label** | The `🌐` slot is empty unless `@the-i18n-kit/pi` is publishing coverage. Every other slot works regardless. |

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
| `tab-title` | Show the current task and a running/done indicator in the terminal tab title, plus a system notification when the run finishes |
| `editor-border` | Labels in the editor border, from any extension that claims a slot |
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
| `PI_BORDER_EDITOR=off` | Never supply an editor; label only one another extension installed |
| `PI_BORDER_WRAP_TIMEOUT_MS=n` | How long to wait for another extension's editor (default 3000) |

**How it works, and how it fails.** pi's editor chrome belongs to whichever
extension owns the editor component, and its metadata set is closed. So this
wraps the installed editor and places labels into the rule of a border
afterwards, consuming spare width so the frame keeps its width and styling.

Two things make that work in more than one host:

- **A cornerless frame is a frame.** pi's own editor draws its border as two bare
  rules with no `╭╰` glyphs, so a corner-only test finds no border there at all.
  `isBottomBorder`/`isTopBorder` accept a line that is nothing but rule too;
  hyphens are excluded, because a line of `-----` is far more likely to be
  something you typed than a border.
- **Runs are found in the visible line, not the raw one.** pi builds its border
  as `borderColor("─").repeat(width)`, so the raw text is that character
  wrapped in its own escape pair over and over. A raw scan sees runs of length
  one and places nothing. Runs are measured with escapes removed and mapped back
  to raw offsets, and the styling that wrapped the consumed span is put back —
  otherwise part of the rule would drop to the default colour.

**No editor to wrap?** Then it supplies one: pi's own `CustomEditor`, installed
through `setEditorComponent`, so it is the default editor with labels rather
than a stand-in. pi wires a custom editor itself — `onSubmit`, `onChange`, the
text, border colour, padding, autocomplete, and every app action — so nothing
is lost. This is also why a solo install works with no other extension:
another extension's editor is preferred and wrapped, and one is only supplied
when the wait for it runs out.

It is surgery on someone else's output, and is written to fail by doing nothing:
no border, an unfamiliar frame or a line too narrow, and the editor renders
exactly as it would have.

#### quiet-tools

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
