# Hive

Hive is a macOS app for working with many Claude Code sessions at once. It lists the sessions of a folder on the left and runs the real `claude` command in terminal panes on the right.

## Features

- The left panel shows the open sessions as cards on top, in tab order, then the sessions of the last 24 hours, then older ones.
- Each card shows the repo, branch, model, running agents and last prompt.
- Live status per session (working, waiting for you, ready), taken from Claude Code hooks.
- Full text search over names and conversations.
- Layouts with 1, 2 or 4 panes. Select a pane, then pick a tab or session to put it there, or drag it onto a pane.
- Undock a session into its own window, for example on another display, and dock it again.
- Colour tags for sessions and terminal colour themes.
- If a session finishes or needs you and Hive is not the active app, macOS shows a notification.
- Usage bars for the 5 hour window and the weekly limit.

## Requirements

- macOS 14 or later.
- Swift 5.9 or later. The Command Line Tools are enough, Xcode is not needed.
- The `claude` command from Claude Code.

## Build and run

Run a debug build:

    scripts/dev.sh

Build `Hive.app` with its icon:

    scripts/bundle.sh

## Status hooks and usage limits

Hive reads session status and usage limits from files that Claude Code writes through hooks and the status line. Install them once:

    scripts/install-hooks.py

The script copies helper scripts to `~/.claude-sessions`, adds hooks to `~/.claude/settings.json` and wraps your status line command. It saves a backup of the settings file first, and you can run it again safely. Without it, every session shows as ready and the usage bars stay empty.

## How it works

- Sessions come from `~/.claude/projects/<folder>/*.jsonl`.
- Terminals use [SwiftTerm](https://github.com/migueldeicaza/SwiftTerm).
- A new session starts with `claude --session-id <id>`. An old one starts with `claude --resume <id>`.
