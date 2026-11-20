# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is the guide for any agent or person who starts new work on Hive. It gives the working rules, the state of the repository and the known gaps. The product features and the tech stack have their own files, which this file imports. The text matches the code at commit `94ac888`. Keep all three files in step with the code.

## 1. Working rules

- Hive is a desktop app for many Claude Code sessions. The owner runs it with `npm run dev`, and often runs the Claude session that edits the code inside Hive itself.
- A restart of the app ends every terminal in it. The session that edits the code ends too. Do the work in a git worktree, for example `~/projects/hive-wt`, and test there.
- Never run `pkill` on `electron` or `electron-vite`. It ends the running app and the session in it.
- Do not edit files in the folder of the running dev app. A change to a React or CSS file reloads the interface only. A change to a file that holds the app state reloads the page, and the tabs come back. A change under `src/main` restarts the app in `npm run dev:watch` only.
- Never commit or push to `main`. Every change goes through a pull request, as the "Contribute" section of `README.md` says. Do not merge a pull request unless the owner asks.
- Commit and push only after the owner asks. Commit messages use the form `type: description`. The repository author is the personal address in the local git identity.
- Documentation and comments use plain English: short sentences, no contractions, no semicolons, no em-dashes, and the condition first. Do not use the modal verbs that the linter bans. Use `can`, `will` and `must`.
- Write tests for new rules. Do not skip the pre-commit hook with `--no-verify`. If you change the interface, also run the e2e tests, and add a test there for a new behavior. Run them with `npm run test:e2e:docker`, because `npm run test:e2e` opens windows on the desktop of the owner and takes the focus. The e2e tests use their own data folder and do not disturb a running Hive.
- After a change that you can see in the interface, run `npm run screenshots` and commit the new pictures in `docs/images`. The README has one picture, and `docs/FEATURES.md` has the others. They show demo data only. `docs/TECH-STACK.md`, section 12.4, has the details.
- Tests use fake terminal commands, not the real `claude` command. `docs/TECH-STACK.md` explains how, in section 12.

## 2. Commands and structure

The commands are in the "Develop" section of `README.md`, which this file imports. The architecture is in `docs/TECH-STACK.md`. These points are not there:

- Run one unit test file with `npx tsx --test src/main/paths.test.ts`. Select one test by name with `--test-name-pattern "<text>"`.
- Run one end-to-end file with `npm run build && npx tsx --test e2e/tabs.e2e.ts`. On Linux, put `xvfb-run` in front.
- A new IPC call changes `src/shared/types.ts`, `src/preload/index.ts` and `src/main/index.ts` together.

## 3. The specs

The details are in these files, and `README.md` has the commands.

- `docs/FEATURES.md` has the exact placement rules for panes and tabs.
- `docs/TECH-STACK.md` has the stack, the data formats, the terminal lifecycle, the hooks, the tests, the pipelines and the decisions.

@README.md
@docs/FEATURES.md
@docs/TECH-STACK.md

## 4. Repository and workflow state

- GitHub: `calielc/ClaudeCode-Hive`, public. `docs/TECH-STACK.md`, section 13, describes the ruleset and the pipelines.
- History: the first versions were a native macOS app in Swift. The tag `swift-v1` keeps that version. The Electron rewrite replaced it on `main`.
- `~/projects/claude-sessions-app` is the main project, and it can run `npm run dev`. `~/projects/hive-wt` is a git worktree on the branch `fix/survive-reload`. It exists to change code without a restart of a dev app that hosts a session.
- The local `main` of the main project can be behind GitHub. The script `~/projects/apply-hive-fix.sh` stashes old uncommitted copies, moves `main` forward to the branch and runs `npm install`.

## 5. Known gaps and ideas

- macOS has no automated test run in the CI. The installer workflow builds the macOS app and starts it once. Terminals use `cmd.exe` on Windows. The hook command of the fallback runner uses POSIX syntax.
- No real Claude session was driven in the Electron version. Tests use fake commands.
- Notifications, real mouse drag and drop, and the Ctrl+Tab key press are not tested live. Synthetic events cover drag and drop and the link clicks.
- `npm audit` lists no findings on 2026-11-18. The audit workflow runs it on each change of the package files and every Monday. Run `npm audit` after each update. Do not accept the `--force` fixes, because they downgrade Vite and electron-builder.
- The settings of the former Swift app do not carry over.
- A restart of the app ends all terminals. A separate long-lived process that owns the terminals will remove this limit and allow `dev:watch` inside Hive.
- Tabs come back after a page reload, not after an app restart.
- A plain click opens a link. A Cmd-click rule will avoid accidental opens.
- Ideas: `/rename` from inside Hive, a layout for each folder, a command palette, and a setting for the notification triggers.
