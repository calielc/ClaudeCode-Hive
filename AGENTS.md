# AGENTS.md

This file is the guide for any agent or person who starts new work on Hive. Section 1 gives the working rules. Sections 2 to 8 describe what the app does and how it is built. The text matches the code at commit `ddf426d`. Keep this file in step with the code.

## 1. Working rules

- Hive is a desktop app for many Claude Code sessions. The owner runs it with `npm run dev`, and often runs the Claude session that edits the code inside Hive itself.
- A restart of the app ends every terminal in it. The session that edits the code ends too. Do the work in a git worktree, for example `~/projects/hive-wt`, and test there.
- Never run `pkill` on `electron` or `electron-vite`. It ends the running app and the session in it.
- Do not edit files in the folder of the running dev app. A change to a React or CSS file reloads the interface only. A change to a file that holds the app state reloads the page, and the tabs come back. A change under `src/main` restarts the app in `npm run dev:watch` only.
- Commit and push only after the owner asks. Commit messages use the form `type: description`. The repository author is the personal address in the local git identity.
- Documentation and comments use plain English: short sentences, no contractions, no semicolons, no em-dashes, and the condition first. Do not use the modal verbs that the linter bans. Use `can`, `will` and `must`.
- Write tests for new rules. Run `npm test` and `npm run typecheck` before you finish.
- Tests use fake terminal commands, not the real `claude` command. Section 6 explains how.

## 2. What Hive is

Hive lists the Claude Code sessions of a folder on the left. It runs the real `claude` command in terminal panes on the right. It shows which sessions work, which wait for you, and which are ready. It runs on macOS, Windows and Linux. Only macOS is tested.

The owner is a developer who runs many sessions in parallel. The goals are a view of all sessions at a glance and fast switching. The app also arranges sessions side by side and signals a session that needs attention.

## 3. Product features

### 3.1 The left panel

- **Folder menu.** It selects the folder whose sessions are listed. The plus button adds a folder. The minus button removes the selected one from the list. The list and the selection are saved. The first start uses `~/code` as the folder. The home folder is the fallback for a machine without it.
- **Search.** The field searches the names of the sessions and the full text of their conversations, including the work of sub agents. Names match at once. The conversation search starts 300 ms after the last key and needs 2 characters. A result that matches only in a conversation carries the note "found in the conversation". Escape clears the field.
- **Status counts.** Three numbers: working, waiting, ready. They count the open sessions and the sessions of the last 24 hours.
- **Open section.** One card for each session open in a tab, in tab order. It also holds a new session that has no file yet, and a tab from another folder.
- **Last 24 hours section.** The sessions of the selected folder from the last day that are not open. One plain row for each session, with its age.
- **Older section.** The rest of the sessions, as plain rows.
- **One place for each session.** A session is never in two sections. Opening a session moves it up to Open. Closing its tab moves it back.
- **Card content.** The state dot, the name and the age. Two chips for the repository (the folder that holds `.git`) and the branch. A chip for the model, for example "Sonnet 5.5". A chip for the number of running agents, in orange above zero. One line for each running agent with its model. The last prompt in two lines.
- **Card marks.** A window icon marks a session in its own window. A blue border marks the selected card. A thin orange or red border marks a working or waiting session.
- **State dots.** Orange and pulsing means working. Red means waiting for you. Green means ready.
- **Right-click menu.** Colour for every session. For an open session also: go to tab, undock or dock, close tab.
- **Usage footer.** See section 3.7.

### 3.2 Terminals and panes

- **Real terminals.** Each session runs `claude` in a pseudo terminal. A new session runs `claude --session-id <id>`. An old one runs `claude --resume <id>`. The login shell of the user runs the command, so a shell function named `claude` works.
- **Layouts.** Single, side by side, stacked, and a 2 by 2 grid. The buttons are at the top right. The layout is saved. The dividers between panes can be dragged, and their positions are saved.
- **Selected pane.** One pane has a blue border. It gets the next session that you pick. A click in a pane or on its header selects it.
- **Tab bar.** Each tab shows the pane number in a split layout, a window icon for an undocked session, the name, and a close button. The bar scrolls sideways only for tabs that do not fit. Its scroll stops at the ends.
- **New session.** The "New Session" button and Cmd+N start a session in the selected folder.
- **Process exit.** The tab closes after Claude ends, for example after `/exit`. A process that fails within 3 seconds keeps its tab, so the error stays readable.
- **Keyboard focus.** The terminal of the selected pane gets the keyboard after a new selection or a layout change. It gets it again after the window returns to the front. A search field in use keeps the focus.
- **Colour themes.** Six terminal themes: Tokyo Night (default), Dracula, Nord, Gruvbox Dark, Solarized Dark and Paper (light). The choice is saved and applies to all open terminals at once.
- **Links.** A click on a web address in the terminal opens it in the default browser of the system. This works for addresses that wrap over several lines, and for links that a program marks itself (OSC 8). Only `http`, `https` and `mailto` links open. A link never opens a window of the app.

### 3.3 Placement rules

These rules are the most important behaviour. Pure functions in `src/renderer/panes.ts` implement them, and tests cover them.

1. Click on a visible tab (tab bar, left panel or Ctrl+Tab): select its pane only. Nothing moves. The divider sizes stay as they are.
2. Click on a hidden tab: it replaces the session in the selected pane. The replaced session stays open in the tab bar.
3. Click on a tab in its own window: select it and bring its window to the front.
4. New session: an empty selected pane gets it. Else it goes to the first empty pane. Else it replaces the session in the selected pane.
5. Switch to a split layout: the current session stays first (left or top). The other panes fill with the next tabs in tab order, and the order wraps around at the end.
6. Switch to a smaller layout: a selected pane that disappears sends its session to the first pane.
7. Close a visible tab: its pane fills with the next hidden tab. A pane stays empty only while no hidden tab is left.
8. Drop on a pane (drag from the left panel or the tab bar): the session goes into that pane. A visible tab swaps places with the pane's current tab. A tab in its own window docks into the pane.
9. Undock: the tab leaves its pane, and a hidden tab fills the pane. Dock: the tab goes into an empty pane, else into the selected pane.
10. Reorder: drag a tab, or a card in the Open section, onto another one. It lands before or after it, by the half where you drop. A line shows the place. Free space in the bar moves it to the end. The panes keep their sessions. Ctrl+Tab and the fill rule in point 5 follow the new order.

### 3.4 Undock and dock

A session can live in its own window, for example on another display. The Claude process keeps running. The new window opens on a second display, or on the main display for a machine with one display. It has a "Next display" button and a "Dock" button. Closing the window docks the session again. The undocked window shows the screen of the process by replaying its output. The process then redraws after a small resize. Theme and colour tags follow the main window.

### 3.5 Colour tags

Eight colours mark sessions: red, orange, yellow, green, teal, blue, purple and pink. They show as a stripe and a tint on the card or row, on the tab, and on the pane header. The right-click menu sets them. They are saved by session id.

### 3.6 Notifications

The system shows a notification with the session name in two cases. A session open in Hive finishes (working to ready), or it needs input (it becomes waiting). It shows nothing while a Hive window has the focus. A click brings the window to the front and selects the session. Sessions that run outside Hive do not notify. The state comes from the hooks in section 4.8.

### 3.7 Usage limits

The footer shows the 5 hour window and the weekly limit, and one bar for each model limit of the account. Each bar shows the percent used and the time until reset. Bars turn orange at 60 percent and red at 85 percent. After the reset time of a window, the bar shows a dash and "reset" until the next update. A note appears for numbers older than 10 minutes. The numbers refresh only while a Claude Code session is open, because only the status line receives them. Without the hooks, the footer shows "Install hooks".

### 3.8 Keys

- Next tab and previous tab: Ctrl+Tab and Ctrl+Shift+Tab, on every system.
- New session: Cmd+N on macOS, Ctrl+Shift+N elsewhere.
- Add folder: Cmd+O on macOS, Ctrl+Shift+O elsewhere.
- Search: Cmd+F on macOS, Ctrl+Shift+F elsewhere.
- Layout 1 to 4: Cmd+Option+1 to 4 on macOS, Ctrl+Shift+Alt+1 to 4 elsewhere.
- Undock the selected session: Cmd+Shift+D on macOS, Ctrl+Shift+U elsewhere.
- Plain Shift+Tab goes to Claude Code. The code is in `src/renderer/shortcuts.ts`.

## 4. Technical overview

### 4.1 Stack

- App shell: Electron 45.
- Build: electron-vite 6 with Vite 8.
- Interface: React 19 with plain CSS.
- Language: TypeScript 7, strict.
- Terminal view: `@xterm/xterm` 6 with the fit and web links addons.
- Terminal process: `node-pty` 1.1, with prebuilt binaries and no compile step.
- Packaging: electron-builder 26.
- Tests: `node:test`, run with `tsx`.

All direct packages were on their latest version on 2026-11-18. The `overrides` entry in `package.json` forces `minimatch` to 11.0.1 or later, which fixes its advisory.

### 4.2 Processes

- The main process (`src/main`) owns the Claude processes. It reads the session files, searches, watches the status files, shows notifications, creates windows and installs the hooks.
- The preload script (`src/preload/index.ts`) puts a typed API on `window.hive`. The type is `HiveApi` in `src/shared/types.ts`.
- The renderer (`src/renderer`) is the interface. The main window and each undocked window are separate pages of the same code. The hash route `#/terminal/<id>?title=...` selects the undocked view.

### 4.3 Files

- `src/main/index.ts`: app start, windows, undock, IPC handlers, notifications and test seams.
- `src/main/sessions.ts`: scans the session files, reads titles, details of open sessions and running agents.
- `src/main/paths.ts`: the Claude folder, the project folder name rule and the repository name.
- `src/main/search.ts`, `search.worker.ts`, `search-core.ts`, `fold-search.ts`: full text search in a worker thread.
- `src/main/pty.ts`: the Claude processes, the output buffer and the batching.
- `src/main/status.ts`: watches the status files and reads the usage.
- `src/main/hooks.ts` with `scripts/hook.cjs` and `scripts/statusline-tap.cjs`: the hook installer and the two scripts it installs.
- `src/main/external-url.ts`: which links can open outside the app.
- `src/renderer/panes.ts`: the pure placement logic of section 3.3.
- `src/renderer/state.ts`: the store with the state shape, `setState`, `useStore` and the saving.
- `src/renderer/actions.ts`: all actions, the polling, the search and the tab operations.
- `src/renderer/terminals.ts`: one xterm for each session, with mount, fit, replay and links.
- `src/renderer/session-persist.ts`: saves and restores the open tabs across a page reload.
- `src/renderer/components/`: `Sidebar`, `Panes` (top bar, tabs, panes, splitters), `ContextMenu`, `UndockedView` and `reorder`.
- `src/renderer/themes.ts`, `format.ts`, `shortcuts.ts` and `styles.css`: themes and tag colours, formatting, keys and styles.
- `scripts/make-icon.cjs`: draws `build/icon.png`. Run it with `npx electron scripts/make-icon.cjs`.

### 4.4 Data sources and formats

- Sessions: `~/.claude/projects/<folder-name>/<session-id>.jsonl`, one JSON object for each line. `CLAUDE_CONFIG_DIR` moves the Claude folder.
- Folder name: the path with every character that is not a letter or digit turned into `-`. So `/Users/me/.x` becomes `-Users-me--x`, and `C:\Users\me` becomes `C--Users-me`.
- Session name: the last `custom-title` record (from `/rename`), else the last `ai-title`, else the first user prompt (60 characters), else "New Session". Hive reads the last 64 KB of the file first, then 512 KB.
- Card details: Hive reads the last 512 KB of the transcript backwards. It takes `gitBranch`, the `last-prompt` record, the model of the last assistant message and `cwd`, which gives the repository. It reads details for open sessions only.
- Agents: `<session-id>/subagents/agent-*.meta.json` has `finished` and `description`. The matching `.jsonl` gives the model. An agent with a transcript quiet for 15 minutes counts as stale.
- State of a session: `~/.claude-sessions/status/<session-id>.json` with `{"state":"working|waiting|ready","ts":...}`. The hooks write it.
- Usage: `~/.claude-sessions/usage.json` with `five_hour`, `seven_day` (`used_percentage` and `resets_at` in seconds) and `model_scoped`. The status line wrapper writes it.
- Settings of Hive: the `localStorage` key `hive.settings.v1` holds the folders, the selected folder, the layout, the theme, the tags and the divider positions.
- Open tabs: the `sessionStorage` key `hive.session.v1` holds the tabs, their order, the undocked tabs, the pane contents and the selected pane. It survives a page reload and is gone after the window closes.

### 4.5 IPC

- Calls with an answer: `sessions:scan`, `sessions:search`, `usage:read`, `hooks:status`, `hooks:install`, `dialog:pickFolder`, `app:defaultFolder` and `pty:attach`.
- Messages without an answer: `tabs:setOpen`, `app:openExternal`, `pty:write`, `pty:resize`, `pty:kill`, `windows:undock`, `windows:dock`, `windows:nextDisplay` and `windows:setTitle`.
- Events to the pages: `pty:data`, `pty:exit`, `windows:docked-back` and `windows:reveal`.

### 4.6 Terminal lifecycle

- A process starts at the first mount of its terminal, with the real size. `pty:attach` starts a process that does not run yet. For a running process, it returns the output buffer.
- The main process keeps the last 2 MB of output for each process. It sends the output in groups every 8 ms.
- A process lives until its tab closes or the app quits. A page reload does not end it. After a reload, the restored terminals attach again and replay the buffer. A small resize then makes Claude Code draw the screen again.
- The terminal of a session lives in the page as long as the tab, also while no pane shows it. A pane only moves the terminal view into its container.
- A timer starts a terminal, not `requestAnimationFrame`. A covered or minimized window runs no animation frames, and it must still start its sessions. The option `backgroundThrottling` is off.
- `node-pty` starts processes through a helper file named `spawn-helper`. npm can install it without the execute permission, and every start then fails with `posix_spawnp failed`. `pty.ts` sets the permission before the first start. The `postinstall` script does the same.

### 4.7 Search

`fold-search.ts` searches a buffer for a text and ignores case for ASCII letters. It finds the rarest letter of the text with the fast `Buffer.indexOf`, in both cases. It checks the full text only around those hits. A worker thread reads the files, 4 at a time. The search takes about 1.1 seconds for 2 GB. The system `grep` took 39 seconds for the same folder, so Hive does not use it. The search needs no external tool, so it also works on Windows.

### 4.8 Hooks and the status line

The "Install hooks" button calls `installHooks()` in `src/main/hooks.ts`. It does the following:

- It writes `hook.cjs` and `statusline-tap.cjs` into `~/.claude-sessions`.
- It saves `~/.claude/settings.json` as `settings.json.bak-hive`.
- It removes the older hook entries of Hive, also those of the former Python version. It keeps all other hooks and settings.
- It adds one hook for each of `SessionStart` (ready), `UserPromptSubmit` (working), `PreToolUse` (working), `Notification` (waiting), `Stop` (ready) and `SessionEnd` (deletes the status file). A `Notification` of type `idle_prompt` is ignored, because the turn is already finished.
- It replaces the `statusLine` command with the wrapper. The original command is stored in `statusline-original.txt` and runs after the wrapper with the same input.
- The scripts run with the real `node` that the login shell finds. Without Node, they run with the binary of Hive as Node (`ELECTRON_RUN_AS_NODE=1`).
- A second run changes nothing.

### 4.9 Security

`contextIsolation` and `sandbox` are on. The page has a content security policy. A link never opens an app window. Navigation away from the app is blocked. The link then goes to the system browser, but only for `http`, `https` and `mailto`.

### 4.10 Performance numbers

- A scan of 59 sessions takes about 20 ms. It takes 3 ms for unchanged files. Titles are cached by file time.
- Hive reads the session folder every 1.5 seconds and the usage file every 5 seconds. The main process reads the status files every second.

## 5. Build and run

- `npm install`, then `npm run dev`: the interface hot reloads. A change to a file with the app state reloads the page, and the tabs come back.
- `npm run dev:watch`: also restarts the whole app after a change in the main process. A restart ends all terminals. Do not use it for Hive inside Hive.
- `npm test`: 38 unit tests for the placement rules, the tab reorder, the saved session, formatting, the scanner, the search, the paths and the link rules.
- `npm run typecheck`, `npm run build` and `npm run dist` (an installer for the current system).
- The packaged macOS app is unsigned, because no Developer ID certificate exists. Open it with a right click and "Open".

## 6. Tests with the real window

### 6.1 Test seams

- `HIVE_DEBUG=1`: puts `window.__hive` in the page with all actions, `getState`, `terminalText` and `pointOf`.
- `HIVE_PTY_COMMAND`: runs this command in each terminal instead of Claude.
- `HIVE_SCREENSHOT=<file.png>`: saves a picture of the window and quits. Other windows get `<file>.window1.png` and so on.
- `HIVE_EXEC_JS`, `HIVE_WAIT_MS` and `HIVE_PROBE_JS`: run a script in the page, wait, then run a probe and print its result.
- `HIVE_OPEN_LOG=<file>`: writes links to a file instead of opening the browser.

### 6.2 Lessons

- Run the Electron binary from `node_modules` directly, with `--user-data-dir=<temp folder>`. Never share the data folder with a running Hive.
- Remove `ELECTRON_RENDERER_URL` from the environment of a test run, with `env -u ELECTRON_RENDERER_URL`. A shell inside the dev app inherits it. The test then loads the dev server and not the build.
- A window that other windows cover does not paint, and its picture shows an old frame. Test mode sets the Chromium switches that keep painting.
- On macOS, `date +%N` does not work. Use plain `date` in fake commands.

## 7. Repository and workflow state

- GitHub: `calielc/ClaudeCode-Hive`, private. The branch `main` is at `ddf426d`.
- History: the first versions were a native macOS app in Swift. The tag `swift-v1` keeps that version. The Electron rewrite replaced it on `main`.
- `~/projects/claude-sessions-app` is the main project, and it can run `npm run dev`. `~/projects/hive-wt` is a git worktree on the branch `fix/survive-reload`. It exists to change code without a restart of a dev app that hosts a session.
- The local `main` of the main project can be behind GitHub. The script `~/projects/apply-hive-fix.sh` stashes old uncommitted copies, moves `main` forward to the branch and runs `npm install`.

## 8. Known gaps and ideas

- Windows and Linux are not tested. Terminals use `cmd.exe` on Windows. The hook command of the fallback runner uses POSIX syntax.
- No real Claude session was driven in the Electron version. Tests use fake commands.
- Notifications, real mouse drag and drop, and the Ctrl+Tab key press are not tested live. Synthetic events cover drag and drop and the link clicks.
- The macOS builds are unsigned and not notarized.
- `npm audit` lists 11 high findings. All come from `picomatch` in the build tools. The newest release (4.0.7) is still affected, so no fix exists yet. The production packages have no findings. Run `npm audit` after each update, and do not accept the `--force` fixes, because they downgrade Vite and electron-builder.
- The settings of the former Swift app do not carry over.
- A restart of the app ends all terminals. A separate long-lived process that owns the terminals will remove this limit and allow `dev:watch` inside Hive.
- Tabs come back after a page reload, not after an app restart.
- A plain click opens a link. A Cmd-click rule will avoid accidental opens.
- Ideas: `/rename` from inside Hive, a layout for each folder, a command palette, and a setting for the notification triggers.

## 9. Decisions and why

- Electron, not Tauri. The terminal needs a pseudo terminal. `node-pty` ships prebuilt binaries, so there is no Rust and no compile step. The owner knows TypeScript.
- Swift is replaced in the same repository. The owner wanted one code base for all systems. The `swift-v1` tag keeps the old app.
- The placement rules are pure functions. The rules are tricky, and the pure form makes them testable and stable.
- Hive has its own search. The system `grep` was too slow. A buffer search in a worker gives about 1 second and needs no external tool.
- The hooks are Node scripts. Windows can have no Python. A machine without Node still runs the scripts, because Hive can use its own binary.
- Processes outlive the page. A hot reload must not end the sessions of a developer who runs Hive inside Hive.
