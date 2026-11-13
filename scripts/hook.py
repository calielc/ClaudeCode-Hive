#!/usr/bin/python3
"""Claude Code hook. Writes the state of a session to ~/.claude-sessions/status/<id>.json.

Usage: hook.py <state>   (state is working, waiting, ready or end)
The hook input JSON arrives on stdin.
"""
import json
import os
import sys
import time

state = sys.argv[1] if len(sys.argv) > 1 else "ready"
try:
    data = json.load(sys.stdin)
    session_id = data["session_id"]
except Exception:
    sys.exit(0)

# The idle reminder comes 60 seconds after a turn ended. The turn is already "ready".
if state == "waiting" and data.get("notification_type") == "idle_prompt":
    sys.exit(0)

directory = os.path.expanduser("~/.claude-sessions/status")
os.makedirs(directory, exist_ok=True)
path = os.path.join(directory, session_id + ".json")

if state == "end":
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
else:
    with open(path, "w") as f:
        json.dump({"state": state, "ts": time.time()}, f)
