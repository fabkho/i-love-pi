#!/usr/bin/env python3
"""CV Generator — renders CV from data + theme + config to PDF."""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

BASE = Path(__file__).resolve().parent

# Default output base — overridable via CV_OUTPUT_DIR env var
DEFAULT_OUTPUT_BASE = Path(
    os.environ.get("CV_OUTPUT_DIR", os.path.expanduser("~/Documents/Bewerbungen"))
)


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_settings() -> dict:
    settings_path = BASE / "settings.yaml"
    if settings_path.exists():
        return load_yaml(settings_path)
    return {}


def render(config_name: str, theme: str = "personal", output_base: str = None) -> Path:
    settings = load_settings()
    data = load_yaml(BASE / "cv-data.yaml")
    config = load_yaml(BASE / "configs" / f"{config_name}.yaml")

    ctx = {**data, **config}

    # Render HTML
    env = Environment(loader=FileSystemLoader(str(BASE / "themes" / theme)))
    template = env.get_template("template.html")
    html = template.render(**ctx)

    # Determine output directory
    base = Path(output_base) if output_base else DEFAULT_OUTPUT_BASE
    out_dir = base / config_name
    out_dir.mkdir(parents=True, exist_ok=True)

    # Write HTML
    html_path = out_dir / f"{config_name}.html"
    html_path.write_text(html, encoding="utf-8")

    # Generate PDF
    pdf_name = config.get("output", "Lebenslauf.pdf")
    pdf_path = out_dir / pdf_name
    result = subprocess.run(
        ["weasyprint", str(html_path), str(pdf_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error generating PDF:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    # Copy config for reproducibility
    config_src = BASE / "configs" / f"{config_name}.yaml"
    config_dst = out_dir / "config.yaml"
    if config_src != config_dst:
        shutil.copy2(config_src, config_dst)

    print(f"✅ {pdf_path}")
    return pdf_path


def main():
    parser = argparse.ArgumentParser(description="Generate CV PDF")
    parser.add_argument("--job", required=True, help="Config name (e.g. sidestream, brandung)")
    parser.add_argument("--theme", default="personal", help="Theme name (default: personal)")
    parser.add_argument("--output", default=None, help=f"Output base directory (default: {DEFAULT_OUTPUT_BASE})")
    args = parser.parse_args()

    config_path = BASE / "configs" / f"{args.job}.yaml"
    if not config_path.exists():
        print(f"Config not found: {config_path}", file=sys.stderr)
        available = [p.stem for p in (BASE / "configs").glob("*.yaml")]
        print(f"Available configs: {available}", file=sys.stderr)
        sys.exit(1)

    render(args.job, args.theme, args.output)


if __name__ == "__main__":
    main()
