# Hive: tech stack and architecture

This file describes how Hive is built, how to run and test it, and why. `docs/FEATURES.md` describes the product side. `CLAUDE.md` has the working rules for agents. The text matches the code at commit `f525f08`.

## 1. Stack

- App shell: Electron 45.
- Build: electron-vite 6 with Vite 8.
- Interface: React 19 with plain CSS.
- Language: TypeScript 7, strict.
- Terminal view: `@xterm/xterm` 6 with the fit and web links addons.
- Terminal process: `node-pty` 1.1, with prebuilt binaries and no compile step.
- Packaging: electron-builder 26.
- Tests: `node:test`, run with `tsx`.

All direct packages had the latest version on 2026-11-18. The `overrides` entry in `package.json` forces `minimatch` to 11.0.1 or later. This fixes its advisory.

## 2. Processes

- The main process (`src/main`) owns the Claude processes. It reads the session files, searches, watches the status files and shows notifications. It also creates windows and installs the hooks.
- The preload script (`src/preload/index.ts`) puts a typed API on `window.hive`. The type is `HiveApi` in `src/shared/types.ts`.
- The renderer (`src/renderer`) is the interface. The main window and each undocked window are separate pages of the same code. The hash route `#/terminal/<id>?title=...` selects the undocked view.

## 3. Files

- `src/main/index.ts`: app start, windows, undock, menu, tray, IPC handlers, notifications and test seams.
- `src/main/sessions.ts`: scans the session files and reads the titles and the details of open sessions.
- `src/main/agents.ts`: lists the agents of a session and reads the transcript of one agent.
- `src/main/agent-transcript.ts`: turns the file of an agent into readable items. It also finds the last model and tells if the agent is done.
- `src/main/paths.ts`: the Claude folder, the project folder name rule and the repository name.
- `src/main/search.ts`, `search.worker.ts`, `search-core.ts`, `fold-search.ts`: full text search in a worker thread.
- `src/main/pty.ts`: the Claude processes, the output buffer and the batching.
- `src/main/status.ts`: watches the status files and reads the usage.
- `src/main/hooks.ts` with `scripts/hook.cjs` and `scripts/statusline-tap.cjs`: the hook installer and the two scripts that it installs.
- `src/main/external-url.ts`: the links that can open outside the app.
- `src/renderer/panes.ts`: the pure placement logic of `docs/FEATURES.md`, section 4.
- `src/renderer/state.ts`: the store with the state shape, `setState`, `useStore` and the saving.
- `src/renderer/actions.ts`: all actions, the polling, the search and the tab operations.
- `src/renderer/terminals.ts`: one xterm for each session, with mount, fit, replay, links and the clipboard keys.
- `src/renderer/session-persist.ts`: saves and restores the open tabs across a page reload.
- `src/renderer/badge.ts`: draws the badge image for the number of waiting sessions.
- `src/renderer/components/`: `Sidebar`, `Panes` (top bar, tabs, panes, splitters), `AgentView` (agent list and transcript), `ContextMenu`, `UndockedView`, `reorder` and `a11y`.
- `src/renderer/themes.ts`, `format.ts`, `shortcuts.ts` and `styles.css`: themes and tag colors, formatting, keys and styles.
- `scripts/make-icon.cjs`: draws `build/icon.png`. Run it with `npx electron scripts/make-icon.cjs`.
- `scripts/brand-electron.cjs`: gives the dev `Electron.app` the name and the icon of Hive. `npm run dev` runs it first.

## 4. Data sources and formats

- Sessions: `~/.claude/projects/<folder-name>/<session-id>.jsonl`, with one JSON object on each line. `CLAUDE_CONFIG_DIR` moves the Claude folder.
- Folder name: the path with every character that is not a letter or digit changed to `-`. So `/Users/me/.x` becomes `-Users-me--x`, and `C:\Users\me` becomes `C--Users-me`.
- Session name: Hive uses the last `custom-title` record (from `/rename`). If none exists, it uses the last `ai-title`. If none exists, it uses the first user prompt (60 characters). Otherwise the name is "New Session". Hive reads the last 64 KB of the file first, then 512 KB.
- Card details: Hive reads the last 512 KB of the transcript backwards. It takes `gitBranch`, the `last-prompt` record, the model of the last assistant message and `cwd`. The `cwd` value gives the repository. Hive reads details for open sessions only.
- Agents: `<session-id>/subagents/agent-*.meta.json` has `agentType`, `description` and sometimes `finished`. The matching `.jsonl` gives the transcript and the model.
- Done agent: an agent is done when `finished` is true, or when its last message is an answer with no tool call. An agent whose transcript is quiet for 15 minutes also counts as done. The interface hides a done agent 30 minutes after the last change.
- State of a session: `~/.claude-sessions/status/<session-id>.json` with `{"state":"working|waiting|ready","ts":...}`. The hooks write it. For a waiting session, the file also holds the `message` and the `type` of the question.
- Usage: `~/.claude-sessions/usage.json` with `five_hour`, `seven_day` (`used_percentage` and `resets_at` in seconds) and `model_scoped`. The status line wrapper writes it.
- Settings of Hive: the `localStorage` key `hive.settings.v1` holds the folders, the selected folder, the layout, the theme, the tags and the divider positions.
- Open tabs: the `sessionStorage` key `hive.session.v1` holds the tabs, their order, the undocked tabs, the pane contents and the selected pane. It survives a page reload. It is gone after the window closes.

## 5. IPC

- Calls with an answer: `sessions:scan`, `sessions:search`, `agents:list`, `agents:transcript`, `usage:read`, `hooks:status`, `hooks:install`, `dialog:pickFolder`, `app:defaultFolder` and `pty:attach`.
- One call that the preload makes at start and waits for: `app:home`. It returns the home folder from the operating system, not from the `HOME` variable. A shell can set `HOME` to a path style that Windows does not use.
- Messages without an answer: `tabs:setOpen`, `app:openExternal`, `app:openFolder`, `badge:set`, `theme:menu`, `pty:write`, `pty:resize`, `pty:kill`, `windows:undock`, `windows:dock`, `windows:nextDisplay` and `windows:setTitle`.
- Events to the pages: `pty:data`, `pty:exit`, `windows:docked-back` and `windows:reveal`.

## 6. Terminal lifecycle

- A process starts at the first mount of its terminal, with the real size. `pty:attach` starts a process that does not run yet. For a running process, it returns the output buffer.
- The main process keeps the last 2 MB of output for each process. It sends the output in groups every 8 ms.
- A process lives until its tab closes or the app quits. A page reload does not end it. After a reload, the restored terminals attach again and replay the buffer. Then a small resize makes Claude Code draw the screen again.
- The terminal of a session lives in the page as long as the tab, also while no pane shows it. A pane only moves the terminal view into its container.
- A timer starts a terminal, not `requestAnimationFrame`. A covered or minimized window runs no animation frames, but it must still start its sessions. The option `backgroundThrottling` is off.
- `node-pty` starts processes through a helper file with the name `spawn-helper`. npm can install it without the execute permission. Then every start fails with `posix_spawnp failed`. `pty.ts` sets the permission before the first start. The `postinstall` script does the same.

## 7. Search

`fold-search.ts` searches a buffer for a text. It ignores case for ASCII letters. It finds the rarest letter of the text with the fast `Buffer.indexOf`, in both cases. It compares the full text only around those hits.

A worker thread reads the files, 4 at a time. The search takes about 1.1 seconds for 2 GB. The system `grep` took 39 seconds for the same folder, so Hive does not use it. The search needs no external tool, so it also works on Windows.

## 8. Hooks and the status line

The "Install hooks" button calls `installHooks()` in `src/main/hooks.ts`. The function does these steps:

- It writes `hook.cjs` and `statusline-tap.cjs` into `~/.claude-sessions`.
- It saves `~/.claude/settings.json` as `settings.json.bak-hive`.
- It removes the older hook entries of Hive, also those of the former Python version. It keeps all other hooks and settings.
- It adds one hook for each of `SessionStart` (ready), `UserPromptSubmit` (working), `PreToolUse` (working), `Notification` (waiting), `Stop` (ready) and `SessionEnd` (deletes the status file).
- It ignores a `Notification` of type `idle_prompt`, because the turn is already finished.
- It replaces the `statusLine` command with the wrapper. The original command is in `statusline-original.txt`. It runs after the wrapper, with the same input.

The scripts run with the real `node` that the login shell finds. Without Node, they run with the binary of Hive as Node (`ELECTRON_RUN_AS_NODE=1`). A second run changes nothing.

## 9. Security

`contextIsolation` and `sandbox` are on. The page has a content security policy. A link never opens an app window. The app blocks navigation away from itself. The link then goes to the system browser, but only for `http`, `https` and `mailto`.

## 10. Performance numbers

- A scan of 59 sessions takes about 20 ms. It takes 3 ms for unchanged files. Hive caches titles by file time.
- Hive reads the session folder every 1.5 seconds and the usage file every 5 seconds. The main process reads the status files every second.
- The agent list of an open session refreshes every 2 seconds. The transcript of an open agent refreshes every 1.5 seconds.

## 11. Build and run

- Run `npm install`, then `npm run dev`.
- First, `scripts/brand-electron.cjs` gives the dev `Electron.app` in `node_modules` the name "Hive" and the Hive icon (macOS only). Then the menu bar and the Dock do not show "Electron". The script signs the bundle again with an ad hoc signature.
- A new install of Electron resets this change. The next `npm run dev` sets it again.
- After the start, the interface reloads hot. If you change a file with the app state, the page reloads and the tabs come back.
- `npm run dev:watch` also restarts the whole app after a change in the main process. A restart ends all terminals. Do not use it for Hive inside Hive.
- `npm test` runs 45 unit tests. They cover the placement rules, the tab reorder, the saved session, formatting, the scanner, the search, the paths, the link rules and the agent transcripts.
- `npm run typecheck`, `npm run build` and `npm run dist` (an installer for the current system) are also available.
- The packaged macOS app is unsigned, because no Developer ID certificate exists. Open it with a right click and "Open".

## 12. Tests with the real window

### 12.1 Test seams

- `HIVE_DEBUG=1`: puts `window.__hive` in the page with all actions, `getState`, `terminalText` and `pointOf`.
- `HIVE_PTY_COMMAND`: runs this command in each terminal instead of Claude.
- `HIVE_SCREENSHOT=<file.png>`: saves a picture of the window and quits. Other windows get `<file>.window1.png` and so on.
- `HIVE_EXEC_JS`, `HIVE_WAIT_MS` and `HIVE_PROBE_JS`: run a script in the page, wait, then run a probe and print its result.
- `HIVE_OPEN_LOG=<file>`: writes links to a file instead of an open in the browser.

### 12.2 Lessons

- Run the Electron binary from `node_modules` directly, with `--user-data-dir=<temp folder>`. Never share the data folder with a running Hive.
- Remove `ELECTRON_RENDERER_URL` from the environment of a test run, with `env -u ELECTRON_RENDERER_URL`. A shell inside the dev app inherits it. Then the test loads the dev server and not the build.
- A window that other windows cover does not paint, and its picture shows an old frame. Test mode sets the Chromium switches that make the window paint at all times.
- On macOS, `date +%N` does not work. Use plain `date` in fake commands.

## 13. Pipelines and updates

- `.github/workflows/ci.yml` runs on each push to `main` and on each pull request. It runs `npm ci`, `npm run typecheck`, `npm test` and `npm run build` on Ubuntu and on Windows. The install skips the Electron binary, because these steps do not need it.
- `.github/workflows/audit.yml` runs `npm audit`. It runs when `package.json` or `package-lock.json` changes, and every Monday at 05:00 UTC. A finding of high severity or more in the packages that ship in the app fails the run. A finding in the build tools only gives a warning, because a fix does not always exist.
- `renovate.json` configures Renovate. Renovate opens pull requests for updates on Monday before 06:00 (Amsterdam time). It groups the minor and patch updates of the dev packages and of the GitHub Actions. It waits 3 days after a release. A major update of `electron`, `node-pty`, `electron-builder` or `@xterm/xterm` gets its own pull request with the label `needs-manual-test`.
- Renovate needs the Renovate GitHub App on the repository. The file alone does nothing until the owner installs the app.
- Do not accept the `--force` fixes of `npm audit`. They downgrade Vite and electron-builder.

## 14. Decisions and why

- Electron, not Tauri. The terminal needs a pseudo terminal. `node-pty` has prebuilt binaries, so there is no Rust and no compile step. The owner knows TypeScript.
- Hive replaces Swift in the same repository. The owner wanted one code base for all systems. The `swift-v1` tag keeps the old app.
- The placement rules are pure functions. The rules are tricky. The pure form makes them testable and stable.
- Hive has its own search. The system `grep` was too slow. A buffer search in a worker takes about 1 second and needs no external tool.
- The hooks are Node scripts. Windows can have no Python. A machine without Node still runs the scripts, because Hive can use its own binary.
- Processes outlive the page. A hot reload must not end the sessions of a developer who runs Hive inside Hive.
