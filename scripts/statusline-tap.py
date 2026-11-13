#!/usr/bin/python3
"""Status line wrapper for Hive.

Claude Code sends the usage limits (5 hour window, week) to the status line command.
This script saves them to ~/.claude-sessions/usage.json, then runs the original status
line command with the same input, so the status line looks the same as before.
"""
import json
import os
import subprocess
import sys
import time

base = os.path.expanduser("~/.claude-sessions")
raw = sys.stdin.read()

try:
    limits = (json.loads(raw) or {}).get("rate_limits")
    if isinstance(limits, dict):
        os.makedirs(base, exist_ok=True)
        snapshot = {
            "updated_at": time.time(),
            "five_hour": limits.get("five_hour"),
            "seven_day": limits.get("seven_day"),
            "model_scoped": limits.get("model_scoped"),
        }
        temp = os.path.join(base, "usage.json.tmp")
        with open(temp, "w") as f:
            json.dump(snapshot, f)
        os.replace(temp, os.path.join(base, "usage.json"))
except Exception:
    pass  # the status line must never break because of this

try:
    with open(os.path.join(base, "statusline-original.txt")) as f:
        original = f.read().strip()
except FileNotFoundError:
    original = ""

if original:
    result = subprocess.run(["/bin/sh", "-c", original], input=raw, text=True)
    sys.exit(result.returncode)
