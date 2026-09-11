#!/usr/bin/env bash
#
# Apply this setup to a pi installation.
#
# A pi package can carry themes and extensions, and this repo does — but not
# everything the look depends on. pi-zentui reads its config from a fixed path
# (`~/.pi/agent/zentui.json`) with no package discovery, so if you want its
# editor frame it has to be placed there by hand. This does that, and with
# --write-settings it also wires settings.json up.
#
# Re-runnable: identical files are left alone, and anything replaced is backed up
# first.
set -euo pipefail

THEME="tokyo-midnight-fk"
PACKAGE="git:github.com/fabkho/i-love-pi"

usage() {
	cat <<EOF
Usage: apply.sh [--write-settings]

  (no options)       copy zentui.json, then print what is left to do
  --write-settings   also set "theme" and the package entries in settings.json
                     (backing it up first)
EOF
}

write_settings=0
for arg in "$@"; do
	case $arg in
	--write-settings) write_settings=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "apply.sh: unknown option '$arg'" >&2
		usage >&2
		exit 2
		;;
	esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
source_config="$here/zentui.json"
target_config="$agent_dir/zentui.json"
target_settings="$agent_dir/settings.json"

echo "pi agent dir: $agent_dir"
mkdir -p "$agent_dir"

if [[ -f $target_config ]] && cmp -s "$source_config" "$target_config"; then
	echo "zentui.json: already up to date"
elif [[ -f $target_config ]]; then
	backup="$target_config.bak-$(date +%Y%m%d%H%M%S)"
	cp "$target_config" "$backup"
	cp "$source_config" "$target_config"
	echo "zentui.json: replaced — your previous one is at $backup"
else
	cp "$source_config" "$target_config"
	echo "zentui.json: installed (pi-zentui reads it from here and nowhere else)"
fi

if ((write_settings)); then
	python3 - "$target_settings" "$THEME" "$PACKAGE" <<'PY'
import json
import pathlib
import shutil
import sys
import time

path = pathlib.Path(sys.argv[1])
theme, package = sys.argv[2], sys.argv[3]

if path.exists():
    try:
        settings = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        sys.exit(f"settings.json: left alone, it is not valid JSON ({error})")
    if not isinstance(settings, dict):
        sys.exit("settings.json: left alone, it is not a JSON object")
else:
    settings = {}

changes = []

if settings.get("theme") != theme:
    settings["theme"] = theme
    changes.append(f"theme -> {theme}")

packages = settings.setdefault("packages", [])
if not isinstance(packages, list):
    sys.exit("settings.json: left alone, \"packages\" is not an array")

# Match on the name so an install by path, by package, or by git all count as
# "already there" — replacing one form with another would be a downgrade.
def present(needle: str) -> bool:
    return any(needle in str(entry) for entry in packages)

if not present("i-love-pi"):
    packages.append(package)
    changes.append(f"+ {package}")
if not present("pi-zentui"):
    packages.append("npm:pi-zentui")
    changes.append("+ npm:pi-zentui")

if not changes:
    print("settings.json: already up to date")
    sys.exit(0)

if path.exists():
    backup = path.with_name(f"{path.name}.bak-{time.strftime('%Y%m%d%H%M%S')}")
    shutil.copy(path, backup)
    print(f"settings.json: previous kept at {backup}")

path.write_text(json.dumps(settings, indent=2) + "\n")
for change in changes:
    print(f"settings.json: {change}")
PY
fi

cat <<'EOF'

Restart pi, or run /reload in a running session.

What each piece needs:

  * A dark terminal. The palette is built for one, and two tokens
    (toolPendingBg/toolSuccessBg) deliberately defer to your terminal background
    so tool rows read as text rather than as panels. On a light terminal body
    text drops to roughly 1.5:1 contrast.

  * The labels in the border come from this repo's editor-border extension and
    need no other extension: with none installed it supplies pi's own editor and
    labels that. Install pi-zentui as well for the frame this config describes —
    border, cost and context readout, framed user messages — which is what
    zentui.json above is for.

  * The kit label (🌐) only appears when @the-i18n-kit/pi is publishing coverage.
    Every other slot works regardless, and an empty slot is simply absent.

If you already have a theme named tokyo-midnight-fk, expect a "[Theme conflicts]"
notice and rename one of them: `name` inside the theme JSON must be unique.
EOF
