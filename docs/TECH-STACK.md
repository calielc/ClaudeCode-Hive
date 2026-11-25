# Hive: tech stack and architecture

This file describes how Hive is built, how to run and test it, and why. `docs/FEATURES.md` describes the product side. `CLAUDE.md` has the working rules for agents. The text matches the code at commit `94ac888`.

## 1. Stack

- App shell: Electron 45.
- Build: electron-vite 6 with Vite 8.
- Interface: React 19 with plain CSS.
- Language: TypeScript 7, with `strict` and the extra checks in section 11.1.
- Code style and lint: Biome 2, with its default style. Section 11.1 has the details.
- Terminal view: `@xterm/xterm` 6 with the fit and web links addons.
- Terminal process: `node-pty` 1.1, with prebuilt binaries and no compile step.
- Packaging: electron-builder 26.
- Git hook: Husky 9, with the pre-commit hook of section 11.1.
- Tests: `node:test`, run with `tsx`. The end-to-end tests drive the real app with `playwright-core`.

All direct packages had the latest version on 2026-11-18. The `overrides` entry in `package.json` forces `minimatch` to 11.0.1 or later. This fixes its advisory.

## 2. Processes

- The main process (`src/main`) owns the Claude processes. It reads the session files, searches, watches the status files and shows notifications. It also creates windows and installs the hooks.
- The preload script (`src/preload/index.ts`) puts a typed API on `window.hive`. The type is `HiveApi` in `src/shared/types.ts`.
- The renderer (`src/renderer`) is the interface. The main window and each undocked window are separate pages of the same code. The hash route `#/terminal/<id>?title=...` selects the undocked view.

## 3. Files

- `src/main/index.ts`: app start, windows, undock, menu, tray, IPC handlers, notifications and test seams.
- `src/main/sessions.ts`: scans the session files and reads the titles and the details of open sessions.
- `src/main/agents.ts`: lists the agents of a session and reads the transcript of one agent.
- `src/main/background.ts`: lists the monitors, cron jobs and wake-ups of a session from its transcript, reads the detail text of one, and finds the next run of a cron expression.
- `src/main/shells.ts`: lists the background shells of a session and reads the output of one shell.
- `src/main/agent-transcript.ts`: turns the file of an agent into readable items. It also finds the last model and tells if the agent is done.
- `src/main/paths.ts`: the Claude folder, the project folder name rule and the repository name.
- `src/main/search.ts`, `search.worker.ts`, `search-core.ts`, `fold-search.ts`: full text search in a worker thread.
- `src/main/pty.ts`: the Claude processes, the output buffer and the batching.
- `src/main/status.ts`: watches the status files and reads the usage.
- `src/main/hooks.ts` and `hooks-settings.ts` with `scripts/hook.cjs` and `scripts/statusline-tap.cjs`: the hook installer and the two scripts that it installs.
- `src/main/external-url.ts`: the links that can open outside the app.
- `src/main/update-check.ts`: the check for a newer release. It compares versions, reads the answer of the GitHub API and runs the timer.
- `src/renderer/panes.ts`: the pure placement logic of `docs/FEATURES.md`, section 4.
- `src/renderer/state.ts`: the store with the state shape, `setState`, `useStore` and the saving.
- `src/renderer/actions.ts`: all actions, the polling, the search and the tab operations.
- `src/renderer/terminals.ts`: one xterm for each session, with mount, fit, replay, links and the clipboard keys.
- `src/renderer/font-size.ts`: the limits of the font size, and the rule that turns wheel movement into steps, with one named notch for each kind of input (wheel, macOS wheel and pinch). `main.tsx` listens for Ctrl and the wheel in every window, and it tracks whether a real Control key is held to tell a pinch from a wheel, and `applyFontSize` in `terminals.ts` gives all terminals the size.
- `src/renderer/session-persist.ts`: saves and restores the open tabs across a page reload.
- `src/renderer/badge.ts`: draws the badge image for the number of waiting sessions.
- `src/renderer/components/`: `Sidebar`, `SidebarSplitter` (the width of the left panel), `Panes` (top bar, tabs, panes, splitters), `AgentView` (agent and shell list, agent transcript and shell output), `ContextMenu`, `UndockedView`, `reorder` and `a11y`.
- `src/renderer/themes.ts`, `format.ts`, `shortcuts.ts` and `styles.css`: themes and tag colors, formatting, keys and styles.
- `e2e/`: the end-to-end tests. `app.ts` starts Hive, `fixture.ts` makes the fake sessions, and `fake-claude.cjs` replaces the `claude` command. See section 12.3.
- `docs/images/`: the pictures of the documentation. `npm run screenshots` takes them with `e2e/screenshots.ts`. The script starts the real app on a made-up home folder with demo sessions, agents and usage numbers. `e2e/demo-claude.cjs` draws the demo terminals. See section 12.4.
- `scripts/start.ts`: `npm run app`. It pulls `main`, installs the packages and the Electron binary when needed, and starts the built app, so the source code can replace the installer. `launch.sh`, `launch.ps1` and `launch.cmd` in the root only change to the repository folder and run it.
- `scripts/make-icon.cjs`: draws `build/icon.png`. Run it with `npx electron scripts/make-icon.cjs`.
- `scripts/next-version.ts`, `git-version.ts` and `release-version.ts`: the rules for the version of a release, the reading of git, and the command that the release workflow runs. `scripts/dist.ts` builds a local installer with a draft version. See section 14.
- `biome.json`, `.editorconfig`, `.gitattributes` and `.husky/pre-commit`: the lint and the style, the line endings and the commit hook. See section 11.1.
- `.github/`: the workflows `ci.yml`, `audit.yml`, `release.yml`, `installers.yml` and `pr-title.yml`, and the file `CODEOWNERS`. `renovate.json` in the root configures Renovate. See section 13.
- `scripts/brand-electron.cjs`: gives the dev `Electron.app` the name and the icon of Hive. `npm run dev` runs it first.

## 4. Data sources and formats

- Sessions: `~/.claude/projects/<folder-name>/<session-id>.jsonl`, with one JSON object on each line. `CLAUDE_CONFIG_DIR` moves the Claude folder.
- Folder name: the path with every character that is not a letter or digit changed to `-`. So `/Users/me/.x` becomes `-Users-me--x`, and `C:\Users\me` becomes `C--Users-me`.
- Session name: Hive uses the last `custom-title` record (from `/rename`). If none exists, it uses the last `ai-title`. If none exists, it uses the first user prompt (60 characters). Otherwise the name is "New Session". Hive reads the last 64 KB of the file first, then 512 KB.
- Card details: Hive reads the last 512 KB of the transcript backwards. It takes `gitBranch`, the `last-prompt` record, the model of the last assistant message and `cwd`. The `cwd` value gives the repository. Hive reads details for open sessions only.
- Agents: `<session-id>/subagents/agent-*.meta.json` has `agentType`, `description` and sometimes `finished`. The matching `.jsonl` gives the transcript and the model.
- Done agent: an agent is done when `finished` is true, or when its last message is an answer with no tool call. An agent whose transcript is quiet for 15 minutes also counts as done. The interface hides a done agent 30 minutes after the last change.
- Shells: the transcript `<session-id>.jsonl` holds a `task_status` line for each shell, with `taskType` `local_bash`, `taskId`, `description`, `shell.command` and `outputFilePath`. A `<task-notification>` line with the same `<task-id>` marks the end. Hive reads only the last 6 MB of the transcript. A shell is done after its end note, or when the transcript is quiet for 15 minutes. The interface hides a done shell 30 minutes after its last line.
- Background tasks: the transcript holds a `Monitor`, `CronCreate`, `CronDelete`, `TaskStop` or `ScheduleWakeup` tool call, and its result starts or ends the task. A `<task-notification>` user entry with an `<event>` is an event of a monitor. Hive reads only the last 6 MB, caches the parsed tasks by file and modification time, and works out the status and the note from the clock on every call.
- Shell output: Hive never reads a path that the renderer sends. The renderer sends the folder, the session id and the shell id. Main takes the path from the transcript and reads it only when its last four segments are the project folder name, the session id, `tasks` and `<shell id>.output`, and when it is a regular file, not a link. It returns the last 512 KB, cut at a line start.
- State of a session: `~/.claude-sessions/status/<session-id>.json` with `{"state":"working|waiting|ready","ts":...}`. The hooks write it. For a waiting session, the file also holds the `message` and the `type` of the question.
- Usage: `~/.claude-sessions/usage.json` with `five_hour`, `seven_day` (`used_percentage` and `resets_at` in seconds) and `model_scoped`. The status line wrapper writes it.
- Settings of Hive: the `localStorage` key `hive.settings.v1` holds the folders, the selected folder, the layout, the theme, the font size, the tags, the divider positions whether the left panel is hidden and the version whose update notice the user closed.
- Open tabs: the `sessionStorage` key `hive.session.v1` holds the tabs, their order, the undocked tabs, the pane contents and the selected pane. It survives a page reload. It is gone after the window closes.

## 5. IPC

- Calls with an answer: `sessions:scan`, `sessions:search`, `agents:list`, `agents:transcript`, `shells:list`, `shells:output`, `background:list`, `background:detail`, `usage:read`, `hooks:status`, `hooks:install`, `dialog:pickFolder`, `app:defaultFolder` and `pty:attach` and `update:get`.
- One call that the preload makes at start and waits for: `app:home`. It returns the home folder from the operating system, not from the `HOME` variable. A shell can set `HOME` to a path style that Windows does not use.
- Messages without an answer: `tabs:setOpen`, `app:openExternal`, `app:openFolder`, `badge:set`, `theme:menu`, `pty:write`, `pty:resize`, `pty:kill`, `windows:undock`, `windows:dock`, `windows:nextDisplay` and `windows:setTitle`.
- Events to the pages: `pty:data`, `pty:exit`, `windows:docked-back`, `windows:reveal` and `update:available`.

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
- The agent and shell list of an open session refreshes every 2 seconds. The transcript of an open agent and the output of an open shell refresh every 1.5 seconds.

## 11. Build and run

- Run `npm install`, then `npm run dev`.
- First, `scripts/brand-electron.cjs` gives the dev `Electron.app` in `node_modules` the name "Hive" and the Hive icon (macOS only). Then the menu bar and the Dock do not show "Electron". The script signs the bundle again with an ad hoc signature.
- A new install of Electron resets this change. The next `npm run dev` sets it again.
- After the start, the interface reloads hot. If you change a file with the app state, the page reloads and the tabs come back.
- `npm run dev:watch` also restarts the whole app after a change in the main process. A restart ends all terminals. Do not use it for Hive inside Hive.
- `npm test` runs 257 unit tests. They cover the placement rules, the font size, the width of the left panel, the usage forecast and bar color, the tab reorder, the saved session, formatting, the scanner, the search, the paths, the link rules, the agent transcripts and the agent list, the background tasks and the cron schedule, the status and usage files, the merge of the hook settings, the update check, and the version rules of the releases (also against a real git repository).
- `npm run test:e2e` builds the app and runs the end-to-end tests. They start the real app, so they need a screen. See section 12.3.
- `npm run typecheck`, `npm run lint`, `npm run build` and `npm run dist` (an installer for the current system, with a draft version, see section 14.1) are also available. `npm run lint:fix` formats the code and applies the safe fixes.
- The installers are not signed with a trusted certificate, because none exists. Section 14 has the details. On macOS, open the app with a right click and "Open".

### 11.1 Strict checks and style

- The compiler runs with `strict` and these extra options: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` and `forceConsistentCasingInFileNames`. With `noUncheckedIndexedAccess`, a read from an array or a record can give `undefined`. Handle that case in the code.
- Biome checks the code and formats it. The file `biome.json` holds the rules. The style is the common Prettier style: double quotes, semicolons, trailing commas, 80 columns and 2 spaces. Biome has these defaults, so the config only sets the spaces.
- The lint rules are the recommended set, plus these errors: unused imports, variables and parameters, `any`, non-null assertions, floating promises, hook dependencies, `console`, import cycles and shadowed names. `console` is allowed in `scripts/`, in `e2e/` and in `src/main/index.ts`, because they print on purpose.
- A rule that does not fit one place can be turned off there with a `biome-ignore` comment. The comment must give the reason after the colon.
- Husky runs the hook `.husky/pre-commit` before each commit. The hook runs `biome check --staged`, so it checks only the files in the commit, and it never changes a file. If it finds a problem, the commit stops and the message says to run `npm run lint:fix`. `npm install` sets the hook up, through the `prepare` script, and it sets `core.hooksPath` to `.husky/_` for this clone. `git commit --no-verify` skips the hook. The CI runs the same lint on each pull request, so a skipped hook cannot reach `main`.
- Every text file uses LF line endings. `.gitattributes` and `.editorconfig` set this, and Git does not convert line endings on this repository. The `.editorconfig` sets UTF-8, two spaces for the indent, a final newline and no trailing spaces for all files. It has a section for each file type of the repository (TypeScript, JSON, YAML, Markdown, HTML, CSS and shell) and for the types that a project often gets (Makefile, Go, Python, Rust, Java, Kotlin, C#, PowerShell and Git files). The line width of 80 applies to code. Markdown, patches, snapshots and the license keep their own layout. Most editors read it. It matches the values of `biome.json`.

## 12. Tests with the real window

### 12.1 Test seams

- `HIVE_DEBUG=1`: puts `window.__hive` in the page with all actions, `getState`, `terminalText` and `pointOf`.
- `HIVE_PTY_COMMAND`: runs this command in each terminal instead of Claude. `{id}` in the command becomes the session id.
- `HIVE_SCREENSHOT=<file.png>`: saves a picture of the window and quits. Other windows get `<file>.window1.png` and so on.
- `HIVE_EXEC_JS`, `HIVE_WAIT_MS` and `HIVE_PROBE_JS`: run a script in the page, wait, then run a probe and print its result.
- `HIVE_OPEN_LOG=<file>`: writes links to a file instead of an open in the browser.
- `HIVE_UPDATE_URL=<address>`: makes an app that is not installed check for updates at this address, which the tests answer with a local server. `HIVE_UPDATE_DELAY_MS`, `HIVE_UPDATE_INTERVAL_MS` and `HIVE_UPDATE_RETRY_MS` change the times. `HIVE_UPDATE_CURRENT_VERSION` replaces the version of the app, because an app that is not installed reports the version of Electron, or "0.0" on Linux. `HIVE_UPDATE_LOG=<file>` writes a line for each step of the check.

### 12.2 Lessons

- Run the Electron binary from `node_modules` directly, with `--user-data-dir=<temp folder>`. Never share the data folder with a running Hive.
- Remove `ELECTRON_RENDERER_URL` from the environment of a test run, with `env -u ELECTRON_RENDERER_URL`. A shell inside the dev app inherits it. Then the test loads the dev server and not the build.
- A window that other windows cover does not paint, and its picture shows an old frame. Test mode sets the Chromium switches that make the window paint at all times.
- On macOS, `date +%N` does not work. Use plain `date` in fake commands.
- After a new selection, the app moves the keyboard to the terminal at 0, 80 and 300 ms. A test that moves the focus itself must call `settleFocus()` from `e2e/app.ts` first. A text field in use keeps the focus.
- An app that is not installed reports the version of Electron, and on Linux it reports "0.0". Do not rely on `app.getVersion()` in a test. Use `HIVE_UPDATE_CURRENT_VERSION`.
- Run a test that fails now and then 10 or 20 times in a loop before you call it fixed. `Emulation.setCPUThrottlingRate` of the Chrome DevTools protocol slows the page and makes a race show.
- `npm run test:e2e:docker` runs the end-to-end tests in a container, on a virtual screen (`scripts/e2e-docker.ts`, `e2e/docker/Dockerfile` and `e2e/docker/run.sh`). The window of the app never opens on your desktop, so the run does not take the focus from your work. It copies the sources into the container without `node_modules`, installs the packages there (with an npm cache volume) and runs `xvfb-run npm run test:e2e`. The image uses Node 26, like the CI.
- To run the Linux jobs of the CI on a Windows or macOS machine by hand, use Docker. Start a container from `node:24-bookworm`. Copy the sources into it without `node_modules`, `out` and `dist`. Install the system libraries of Electron (`xvfb`, `libgtk-3-0`, `libnss3`, `libgbm1`, `libasound2` and a few more) with `apt-get`, run `npm ci`, and then run `xvfb-run --auto-servernum npm run test:e2e` with `SHELL=/bin/bash`. This found a fault that only Linux showed.

### 12.3 End-to-end tests

The tests in `e2e/` start the built app (`out/main/index.js`) with Playwright and use it like a user. They click, type and press keys, and they read the page. There is one file for each area: the left panel, the tabs and panes, the agents, and the keyboard and menus.

- Each test file starts its own copy of Hive with a fresh fixture. The fixture is a throw-away home folder with four fake sessions, and it can hold fake agents. The run sets `HOME`, `USERPROFILE` and `CLAUDE_CONFIG_DIR` to this folder, and it uses its own `--user-data-dir`. A test never touches your real sessions and never disturbs a Hive that runs at the same time.
- `fake-claude.cjs` replaces `claude` through `HIVE_PTY_COMMAND`. It prints `HIVE-E2E-READY` and echoes each input, so a test can see what the terminal sends.
- The tests read the state of the page with `window.__hive`. This needs `HIVE_DEBUG=1`, which the launcher sets.
- Use `eventually()` from `e2e/app.ts` for anything that changes after a delay, such as the list of agents, which refreshes every 2 seconds. Do not use fixed sleeps.
- The files run one at a time. Each file starts and closes its own app, and a run takes about 10 seconds on a developer machine.
- On Linux, the tests need a screen. Run them with `xvfb-run`. The launcher adds `--no-sandbox` on Linux.
- The path of the repository must not contain a space, because the fake command is part of a shell command line.

### 12.4 Pictures for the documentation

- Run `npm run screenshots` to take the pictures again. The command builds the app, starts it with `e2e/screenshots.ts` and saves the pictures in `docs/images`. It needs a screen.
- The pictures show demo data only. The home folder is made up and has the name `acme-shop`. The sessions, the agents, the usage numbers and the terminals are made up. A picture never shows a real session, folder or file.
- `e2e/demo-claude.cjs` replaces `claude` through `HIVE_PTY_COMMAND` with `{id}`. The last character of the session id chooses the scene that it draws.
- Take the pictures again after a change that you can see in the interface, and commit the new files. A picture that no longer matches the app is worse than none.
- A picture is a PNG of about 50 to 200 KB. Keep the number of pictures small, because each new version of a picture stays in the history of git.

## 13. Pipelines and updates

- `.github/workflows/ci.yml` runs on each push to `main` and on each pull request. The job "Typecheck, test and build" runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` on Ubuntu and on Windows. The install skips the Electron binary, because these steps do not need it. The job "End-to-end tests" runs `npm run test:e2e` on both systems, with the Electron binary and, on Linux, with `xvfb-run`.
- `.github/workflows/audit.yml` runs `npm audit`. It runs when `package.json` or `package-lock.json` changes, and every Monday at 05:00 UTC. A finding of high severity or more in the packages that ship in the app fails the run. A finding in the build tools only gives a warning, because a fix does not always exist.
- `renovate.json` configures Renovate. Renovate opens pull requests for updates on Monday before 06:00 (Amsterdam time). It groups the minor and patch updates of the dev packages and of the GitHub Actions. It waits 3 days after a release. The next bullets say which updates merge on their own. A major update of `electron`, `node-pty`, `electron-builder` or `@xterm/xterm` gets its own pull request with the label `needs-manual-test`.
- Renovate needs the Renovate GitHub App on the repository. The file alone does nothing until the owner installs the app.
- The ruleset "Protect main" protects the branch `main`. A change reaches `main` only through a pull request. The pull request needs three things before it can merge. The four CI jobs must pass: "Typecheck, test and build" and "End-to-end tests", each on Ubuntu and on Windows. The branch must contain the current `main` (the "strict" setting), so the checks run on the result of the merge. The owner must approve it, which the file `.github/CODEOWNERS` names. A new commit in the pull request removes the approval. No one can force-push to `main` or delete it.
- Two actors can bypass the ruleset, both in the mode "pull request" only. This mode lets them merge a pull request without the approval. It does not let them push to `main`. The repository admin (the owner) uses it, because GitHub does not let you approve your own pull request. The Renovate app uses it for its own pull requests. The owner brings `main` into the pull request first (`gh pr update-branch <number>` or the button on the page), waits for the checks and then merges.
- `.github/workflows/pr-title.yml` checks the title of each pull request. The title must have the form `type: description` with a known type. This check is not in the required checks of the ruleset yet.
- The steps of a change: make a branch, commit there (the pre-commit hook runs), push it, open a pull request with a title in the form `type: description`, wait for the checks, bring `main` into the branch and squash merge. The squash commit takes the title of the pull request as its message. The release workflow reads that message (section 14).
- Renovate merges these updates on its own, after the CI jobs pass: minor and patch updates of the dev packages and of the GitHub Actions, patch updates of the app packages, and the monthly lock file update. Every other update waits for the approval of the owner. `electron`, `node-pty`, `electron-builder` and the `@xterm` packages never merge on their own.
- Do not accept the `--force` fixes of `npm audit`. They downgrade Vite and electron-builder.

## 14. Releases

The workflow `.github/workflows/release.yml` gives each merge to `main` a version, a tag and a release on GitHub. The release has notes and no installers, except a major release. The workflow `.github/workflows/installers.yml` builds the installers and adds them to a release. It starts by itself for a major release, and by hand for any other.

### 14.1 Versions

- The version follows Semantic Versioning. The commit types decide it, as in Conventional Commits. A `feat` commit gives a minor version (2.0.0 to 2.1.0). A `fix` or `perf` commit gives a patch version (2.0.0 to 2.0.1). A `!` before the colon, as in `feat!: ...`, or a line that starts with `BREAKING CHANGE:` in the message, gives a major version (2.0.0 to 3.0.0).
- Every other type (`docs`, `test`, `chore`, `ci`, `build`, `style`, `refactor`) gives a patch version, because each merge makes a release. This includes the dependency updates of Renovate, which use `chore`.
- The job "Choose the version" runs `scripts/release-version.ts`, which reads git through `scripts/git-version.ts`. It finds the highest tag `vX.Y.Z`, reads all commit messages since that tag and takes the biggest change. The rules are in `scripts/next-version.ts`, and `scripts/next-version.test.ts` tests them.
- The tag is the version. The file `package.json` keeps its old number in the repository, and nothing is committed to `main`. Inside the installer build, `npm version` sets the new number. The installers and the app itself then report the new version, and the update notice (section 9 of `docs/FEATURES.md`) compares against it.
- The commit message is the title of the pull request when you squash merge. Squash merge the pull requests. The workflow `.github/workflows/pr-title.yml` fails if the title is not `type: description` with a known type. Add that check to the required checks of the ruleset if you want to enforce it.

### 14.2 The release

- The `release` job of `release.yml` runs on each push to `main`. It creates the release "Hive <version>" with the tag `v<version>` on the commit of the push, and marks it as the latest release. The notes list the commits since the last tag, without the `chore`, `ci`, `docs`, `test`, `build` and `style` commits. The release has no installer files. It takes seconds, so each merge can have one.
- The drafts of the old flow (a draft with installers for each change, with the marker `hive-auto-release` in the notes) are removed by this job. A draft that the owner made by hand stays.

### 14.3 The installers

- The build is costly, so it runs by itself only for a major release. The `installers` job of `release.yml` calls it with the new tag after the release exists. For any other release it runs on demand. In the Actions tab, choose the workflow "Installers" and "Run workflow". Give the tag of a release (for example `v2.2.0`), or leave it empty for the latest release. The workflow checks out the code of that tag, so the installers match the release.
- The workflow builds on two runners. The Windows runner makes an NSIS installer (`Hive-<version>-win-x64.exe`). The macOS runner makes a `.dmg` and a `.zip` for Apple Silicon (`arm64`) and for Intel (`x64`). `npm version` sets the number of the tag inside the build, so the app reports the version of the release.
- After the build, each runner starts the unpacked app and runs `e2e/packaged.e2e.ts`. This test proves that the app starts, that the native module `node-pty` loads from the packaged files and that the app reports the version of the build. The tests of the code itself run on each pull request, so the installer build does not repeat them.
- The `upload` job adds the files to the release. `--clobber` replaces the files of an earlier build of the same release. The files also stay as workflow artifacts for 7 days.
- A local `npm run dist` does the same version choice, with `scripts/dist.ts`. It builds with the next version and the mark `-draft.<n>`, where n is the number of commits since the last release, for example `Hive-2.1.0-draft.3-win-x64.exe`. It passes the version to electron-builder with `-c.extraMetadata.version`, so `package.json` does not change. A draft is older than the release with the same numbers, so a draft build still shows the update notice when the real release exists. Other arguments go to electron-builder, for example `npm run dist -- --win --dir`. The workflow uses `npm run dist:release`, which builds with the version that `npm version` set.
- To run the packaged test against a local draft build, set `HIVE_EXPECT_VERSION` to the draft version that `npm run dist` prints, and `HIVE_E2E_PACKAGED` to the unpacked app.
- A tag that the owner pushes by hand starts nothing. The release workflow starts only on a push to `main`, and the installer workflow only by hand.
- `electron-builder` does not rebuild `node-pty` (`npmRebuild` is `false`), because the package has prebuilt binaries for all systems. A rebuild needs a C++ toolchain, and it fails on a plain Windows machine.
- The installers are not signed with a trusted certificate. Windows SmartScreen warns about an unknown publisher. On macOS, the hook `scripts/ad-hoc-sign.cjs` gives the app an ad hoc signature, because Apple Silicon reports an unsigned app as damaged. The app is not notarized, so the user must open it once with a right click and "Open".
- To sign the installers later, add the certificate as repository secrets and set the `CSC_LINK` and `CSC_KEY_PASSWORD` variables in the build step. The hook then does nothing on macOS. Notarization needs more settings.
- The app does not update itself. An installed app checks the public list of releases of this repository (`https://api.github.com/repos/calielc/ClaudeCode-Hive/releases/latest`) 15 seconds after the start and every 4 hours. The call needs no token. GitHub allows 60 calls an hour for each address, which is far more than this needs. A failed check tries again after one minute, up to three times in a row. If the latest release has a higher version than `app.getVersion()`, the top bar shows a notice with a link to the page of the release. The check skips drafts and pre-releases. A release counts as soon as it exists, also when it has no installers yet, so the notice can show a version whose installers are not built. The page of the release then says how to build them.
- A real self-update needs `electron-updater`. On macOS it also needs a Developer ID signature, which the app does not have. See the signing note above.

## 15. Decisions and why

- Husky for the pre-commit hook. It is the common tool, and `.husky/pre-commit` is a plain file in the repository. Biome checks the staged files itself with `--staged`, so lint-staged is not needed.
- Changes go through pull requests and are squash merged. The title of the pull request is the commit message, and its type chooses the version. This gives one commit for each change and a version rule that needs no extra file.
- Each merge makes a release (trunk-based), and the installers are built only for a major release or on demand. The build costs a Windows and a macOS runner, and most merges do not need it. A major release is one that users must get, so it is built at once. The owner starts the build for any other release that users should get.
- The version lives in the tag and not in `package.json`. A bot must not commit to a protected `main`, so the build sets the number for itself.
- The app shows a notice for a new release and does not update itself. A self-update needs a signed macOS app, and none exists yet.
- The MIT license. It is short, common and permissive, and the OSI approves it, which the free signing program SignPath Foundation needs. The main dependencies (Electron, React, xterm.js, node-pty) are MIT or similar, so they do not limit the choice. The file `LICENSE` has the text, and `package.json` has the `license` field. The installers must carry the licenses of the bundled packages. Electron adds its own. A generated notices file for the other packages is not made yet.
- Biome, not ESLint. TypeScript 7 is the native compiler and has no JavaScript API. `typescript-eslint` needs that API, so it cannot run on this project. Biome has its own parser, needs no other package, and does both lint and format. It has no rules that use the full type information. The compiler covers that part.
- Electron, not Tauri. The terminal needs a pseudo terminal. `node-pty` has prebuilt binaries, so there is no Rust and no compile step. The owner knows TypeScript.
- Hive replaces Swift in the same repository. The owner wanted one code base for all systems. The `swift-v1` tag keeps the old app.
- The placement rules are pure functions. The rules are tricky. The pure form makes them testable and stable.
- Hive has its own search. The system `grep` was too slow. A buffer search in a worker takes about 1 second and needs no external tool.
- The hooks are Node scripts. Windows can have no Python. A machine without Node still runs the scripts, because Hive can use its own binary.
- Processes outlive the page. A hot reload must not end the sessions of a developer who runs Hive inside Hive.
