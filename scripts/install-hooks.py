#!/usr/bin/python3
"""Adds the status hooks and the usage status line wrapper to ~/.claude/settings.json.
Makes a backup first. Safe to run twice."""
import json
import os
import shutil
import sys

here = os.path.dirname(os.path.abspath(__file__))
target_dir = os.path.expanduser("~/.claude-sessions")
os.makedirs(target_dir, exist_ok=True)
hook = os.path.join(target_dir, "hook.py")
shutil.copy(os.path.join(here, "hook.py"), hook)
os.chmod(hook, 0o755)

settings_path = os.path.expanduser("~/.claude/settings.json")
settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        settings = json.load(f)
    shutil.copy(settings_path, settings_path + ".bak-claude-sessions")

events = {
    "SessionStart": "ready",
    "UserPromptSubmit": "working",
    "PreToolUse": "working",
    "Notification": "waiting",
    "Stop": "ready",
    "SessionEnd": "end",
}
hooks = settings.setdefault("hooks", {})
for event, state in events.items():
    command = f"{hook} {state}"
    groups = hooks.setdefault(event, [])
    if any(h.get("command") == command for g in groups for h in g.get("hooks", [])):
        continue
    groups.append({"hooks": [{"type": "command", "command": command}]})

# Usage limits: wrap the status line command. The original command is kept in a file
# and still runs, with the same input, after the wrapper.
tap = os.path.join(target_dir, "statusline-tap.py")
shutil.copy(os.path.join(here, "statusline-tap.py"), tap)
os.chmod(tap, 0o755)
status_line = settings.get("statusLine") or {"type": "command"}
if status_line.get("command") != tap:
    with open(os.path.join(target_dir, "statusline-original.txt"), "w") as f:
        f.write(status_line.get("command", ""))
    status_line["command"] = tap
    settings["statusLine"] = status_line

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
print("Hooks installed. Backup:", settings_path + ".bak-claude-sessions")
