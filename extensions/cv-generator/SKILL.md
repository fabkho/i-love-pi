# CV Generator

Generate and manage CV PDFs via YAML configs + Jinja2 themes.

## Data Model

CV data lives in `cv-data.yaml` (single source of truth). Per-job overrides in `configs/jobname.yaml`. Themes in `themes/themname/template.html`.

## Config Fields

```yaml
email: string
phone: string
location: string
languages: string ("" to hide)
border: boolean
output: string (PDF filename, default: "Lebenslauf.pdf")
```

## Tools

- `list_cv_configs` — list all job configs and themes
- `generate_cv` — generate PDF from config + theme. Creates `<output_base>/jobname/` folder.

## Flow

1. User provides job link/details
2. Agent creates `configs/jobname.yaml` with appropriate overrides
3. Agent calls `generate_cv --job jobname`
4. PDF + config copy land in `~/Documents/Bewerbungen/jobname/`

## For New Users (Colleagues)

1. Clone `i-love-pi`, copy `extensions/cv-generator` to `~/.pi/agent/extensions/`
2. Create `cv-data.yaml` with their personal data
3. Create their own theme in `themes/mytheme/` (can start from `themes/personal/`)
4. Run `/reload` in pi

Do NOT copy the author's `cv-data.yaml`, `configs/*.yaml`, or `output/`. Those are personal and gitignored.

## Creating a New Theme

Copy `themes/personal/` → `themes/my-theme/`. Edit `template.html` — Jinja2 with these variables:

```
{{ personal.name }}, {{ personal.role }}, {{ email }}, {{ phone }},
{{ location }}, {{ languages }}, {{ border }}, {{ profile }},
{{ experience }} (list), {{ education }} (list), {{ skills }} (list),
{{ projects }} (list)
```

Style is pure CSS in `<style>` — no framework needed.
