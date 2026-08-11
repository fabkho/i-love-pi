# i-love-pi

Personal pi setup — extensions, themes, agents, and prompts for anny.co development.

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

### Themes

| Theme | Description |
|-------|-------------|
| `tokyo-night` | Tokyo Night color scheme for pi TUI |

### Agents

| Agent | Description |
|-----------|-------------|
| `anny-oracle` | React patterns and conventions expert for anny codebase |
| `anny-plan-reviewer` | Reviews architecture plans for the anny platform |
| `anny-planner` | Creates implementation plans for anny features |
| `anny-scout` | Fast codebase exploration for anny repos |
| `anny-worker` | Implementation agent for anny tasks |
| `bugfix-scout` | Specialized bug-hunting exploration agent |
| `teams.yaml` | Team agent definitions |

### Prompts

| Prompt | Description |
|--------|-------------|
| `anny-feature` | Feature development prompt template |
| `anny-review` | Code review prompt template |
| `review-mr` | MR/PR review prompt template |

## CV Generator Usage

1. Create `~/.pi/agent/extensions/cv-generator/cv-data.yaml` with your CV data
2. Create per-job configs in `configs/jobname.yaml`
3. `pi` → AI can call `generate_cv --job jobname` or `list_cv_configs`

See `extensions/cv-generator/README.md` for full docs.
