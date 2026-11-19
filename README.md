# Hive

Hive is a desktop app for working with many Claude Code sessions at once. It lists the sessions of a folder on the left and runs the real `claude` command in terminal panes on the right. It runs on macOS, Windows and Linux.

This is the Electron version. The earlier native macOS version in Swift is kept in the git tag `swift-v1`.

## Features

- The left panel shows the open sessions as cards on top, in tab order, then the sessions of the last 24 hours, then older ones.
- Each card shows the repo, branch, model, running agents and the last prompt.
- Live status per session (working, waiting for you, ready), taken from Claude Code hooks.
- Full text search over the names and the conversations of the selected folder.
- Layouts with 1, 2 or 4 panes. Select a pane, then pick a tab or a session to put it there. A tab that is already visible only selects its pane. You can also drag a session or a tab onto a pane.
- Undock a session into its own window, for example on another display, and dock it again.
- Links in the terminal, also long ones that wrap over several lines, open in your default browser, where you are already logged in. Only web and mail links open.
- Colour tags for sessions and six terminal colour themes.
- If a session finishes or needs you and Hive is not the active window, the system shows a notification.
- Usage bars for the 5 hour window and the weekly limit.

## More documentation

- `docs/FEATURES.md` describes every product feature and the placement rules for panes and tabs.
- `docs/TECH-STACK.md` describes the stack, the architecture, the data formats, the tests and the decisions.
- `CLAUDE.md` holds the working rules for agents and people who change the code.

## Keys

- Next tab and previous tab: Ctrl+Tab and Ctrl+Shift+Tab, on every system.
- New session: Cmd+N on macOS, Ctrl+N elsewhere.
- Search: Cmd+F on macOS, Ctrl+F elsewhere.
- Hide or show the left panel: Cmd+B on macOS, Ctrl+B elsewhere.

Plain Shift+Tab goes to Claude Code.

## Download

The installers for Windows and macOS are on the Releases page of this repository.

- Windows: run `Hive-<version>-win-x64.exe`. The installer is not signed, so Windows SmartScreen warns about an unknown publisher. Choose "More info", then "Run anyway".
- macOS: open the `.dmg` for your Mac and drag Hive to Applications. Use `arm64` for Apple Silicon and `x64` for an Intel Mac. The app is not notarized. The first time, open it with a right click and "Open".

## Requirements

- Node.js 20 or later, to build and run from source.
- The `claude` command from Claude Code, on the path of your login shell.

## Develop

    npm install
    npm run dev

`npm run dev` has hot reload for the interface. When you change React or CSS code, the window updates at once. When you change a file that holds the state of the app, the page reloads. After a reload the tabs come back, and they attach again to the Claude processes that still run, so no session is lost.

`npm run dev:watch` also restarts the whole app after a change in the main process or the preload script. A restart ends all terminals. Do not use it for Hive inside Hive, because it ends your own session.

Other commands:

- `npm test` runs the unit tests.
- `npm run test:e2e` starts the real app and runs the end-to-end tests.
- `npm run typecheck` checks the types.
- `npm run dist` builds an installer for the system you are on.

To make a release, change the version in `package.json`, commit it, and push a tag with the same number, for example `v2.1.0`. The release workflow builds the installers and makes a draft release. `docs/TECH-STACK.md`, section 14, describes it.

The renderer is React with `xterm.js`. The main process runs the terminals with `node-pty`, reads the session files and sends notifications. Run `npx electron scripts/make-icon.cjs` to draw the icon again.

## Status hooks and usage limits

Hive reads session status and usage limits from files that Claude Code writes through hooks and the status line. Click "Install hooks" in the left panel once. Hive then does the following:

- It copies two small Node scripts to `~/.claude-sessions`.
- It adds hooks to `~/.claude/settings.json` and wraps your status line command. The original status line command still runs with the same input.
- It saves a backup of the settings file as `settings.json.bak-hive`, and it replaces the hooks of the older Python version. You can click the button again safely.

Without the hooks, every session shows as ready and the usage bars stay empty.

## How it works

- Sessions come from `~/.claude/projects/<folder>/*.jsonl`. Set `CLAUDE_CONFIG_DIR` to use another Claude Code folder.
- A new session starts with `claude --session-id <id>`. An old one starts with `claude --resume <id>`.
- Each session keeps running during the life of its tab, also while no pane shows it.

## Test the window

Set `HIVE_DEBUG=1` to get `window.__hive` in the page. Set `HIVE_PTY_COMMAND` to run a harmless command instead of Claude. Set `HIVE_SCREENSHOT=<file.png>` to save a picture of the window and quit, with `HIVE_EXEC_JS` to run a script first.

## Windows

The Windows build is not tested yet. Terminals use `cmd.exe`, and the session folder names follow the rule Claude Code uses for Windows paths.
