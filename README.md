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
