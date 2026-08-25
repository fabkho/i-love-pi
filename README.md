# i-love-pi

Personal pi setup — non-anny extensions.

## Quick Start

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
| `cv-generator` | YAML-driven CV PDF generator with Jinja2 themes. Auto-discovers its own skill. |
| `fork-tab` | Fork session into new tab with a keybinding |

## CV Generator Usage

1. Create `~/.pi/agent/extensions/cv-generator/cv-data.yaml` with your CV data
2. Create per-job configs in `configs/jobname.yaml`
3. `pi` → AI can call `generate_cv --job jobname` or `list_cv_configs`

See `extensions/cv-generator/README.md` for full docs.
