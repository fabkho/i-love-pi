# CV Generator

Pi extension for generating CV PDFs from YAML data + Jinja2 templates.

## Setup

```bash
cp -r extensions/cv-generator ~/.pi/agent/extensions/
```

## Requirements

- Python 3 with `pyyaml`, `jinja2`, `weasyprint`
- `pip3 install pyyaml jinja2 weasyprint`

## Usage

1. Create `cv-data.yaml` with your CV content (see example below)
2. Create per-job configs in `configs/jobname.yaml`
3. The AI agent can call `generate_cv --job jobname` or `list_cv_configs`

## Creating Your cv-data.yaml

```yaml
personal:
  name: "Your Name"
  role: "Your Role"

profile: |
  Your profile text...

experience:
  - company: "Company GmbH"
    location: "City"
    date: "January 2020 – heute"
    position: "Software Engineer"
    subtitle: "Optional subtitle"
    bullets:
      - "Bullet point 1"
      - "Bullet point 2"

education: [...]

skills:
  - key: "Frontend"
    val: "Vue 3, Nuxt, TypeScript"

projects:
  - name: "project-name"
    url: "https://github.com/you/project"
    desc: "Description"
```

## Per-Job Config

`configs/myjob.yaml`:

```yaml
email: "your@email.com"
phone: "+49 123 456789"
location: "Köln"
languages: "DE (Muttersprache) · EN (C1)"  # or "" to hide
border: true
output: "Lebenslauf.pdf"
```

## Custom Themes

Create `themes/mytheme/template.html` — Jinja2 with same variable names. Use with `--theme mytheme`.

## Settings

`settings.yaml`:

```yaml
output_base: "~/Documents/Bewerbungen"  # where per-job folders go
```
