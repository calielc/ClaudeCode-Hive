# CLAUDE.md

This file is the guide for any agent or person who starts new work on Hive. It gives the working rules, the state of the repository and the known gaps. The product features and the tech stack have their own files, which this file imports. The text matches the code at commit `f525f08`. Keep all three files in step with the code.

## 1. Working rules

- Hive is a desktop app for many Claude Code sessions. The owner runs it with `npm run dev`, and often runs the Claude session that edits the code inside Hive itself.
- A restart of the app ends every terminal in it. The session that edits the code ends too. Do the work in a git worktree, for example `~/projects/hive-wt`, and test there.
- Never run `pkill` on `electron` or `electron-vite`. It ends the running app and the session in it.
- Do not edit files in the folder of the running dev app. A change to a React or CSS file reloads the interface only. A change to a file that holds the app state reloads the page, and the tabs come back. A change under `src/main` restarts the app in `npm run dev:watch` only.
- Commit and push only after the owner asks. Commit messages use the form `type: description`. The repository author is the personal address in the local git identity.
- Documentation and comments use plain English: short sentences, no contractions, no semicolons, no em-dashes, and the condition first. Do not use the modal verbs that the linter bans. Use `can`, `will` and `must`.
- Write tests for new rules. Run `npm test` and `npm run typecheck` before you finish. If you change the interface, also run `npm run test:e2e`, and add a test there for a new behavior. The e2e tests use their own data folder and do not disturb a running Hive.
- Tests use fake terminal commands, not the real `claude` command. `docs/TECH-STACK.md` explains how, in section 12.

## 2. The specs

Hive is a desktop app that lists the Claude Code sessions of a folder and runs the real `claude` command in terminal panes. It runs on macOS, Windows and Linux. Only macOS is tested. Two files hold the details.

- `docs/FEATURES.md` describes what the app does for the user, with the exact placement rules for panes and tabs.
- `docs/TECH-STACK.md` describes the stack, the processes, the files, the data formats, the terminal lifecycle, the hooks, the tests and the decisions.

@docs/FEATURES.md
@docs/TECH-STACK.md

## 3. Repository and workflow state

- GitHub: `calielc/ClaudeCode-Hive`, private. The branch `main` is at `ddf426d`.
- History: the first versions were a native macOS app in Swift. The tag `swift-v1` keeps that version. The Electron rewrite replaced it on `main`.
- `~/projects/claude-sessions-app` is the main project, and it can run `npm run dev`. `~/projects/hive-wt` is a git worktree on the branch `fix/survive-reload`. It exists to change code without a restart of a dev app that hosts a session.
- The local `main` of the main project can be behind GitHub. The script `~/projects/apply-hive-fix.sh` stashes old uncommitted copies, moves `main` forward to the branch and runs `npm install`.

## 4. Known gaps and ideas

- Windows and Linux are not tested. Terminals use `cmd.exe` on Windows. The hook command of the fallback runner uses POSIX syntax.
- No real Claude session was driven in the Electron version. Tests use fake commands.
- Notifications, real mouse drag and drop, and the Ctrl+Tab key press are not tested live. Synthetic events cover drag and drop and the link clicks.
- The macOS builds are unsigned and not notarized.
- `npm audit` lists no findings on 2026-11-18. The audit workflow runs it on each change of the package files and every Monday. Run `npm audit` after each update. Do not accept the `--force` fixes, because they downgrade Vite and electron-builder.
- Renovate opens the update pull requests. It needs the Renovate GitHub App on the repository. `docs/TECH-STACK.md`, section 13, describes the pipelines.
- The settings of the former Swift app do not carry over.
- A restart of the app ends all terminals. A separate long-lived process that owns the terminals will remove this limit and allow `dev:watch` inside Hive.
- Tabs come back after a page reload, not after an app restart.
- A plain click opens a link. A Cmd-click rule will avoid accidental opens.
- Ideas: `/rename` from inside Hive, a layout for each folder, a command palette, and a setting for the notification triggers.
