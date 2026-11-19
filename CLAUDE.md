# CLAUDE.md

This file is the guide for any agent or person who starts new work on Hive. It gives the working rules, the state of the repository and the known gaps. The product features and the tech stack have their own files, which this file imports. The text matches the code at commit `94ac888`. Keep all three files in step with the code.

## 1. Working rules

- Hive is a desktop app for many Claude Code sessions. The owner runs it with `npm run dev`, and often runs the Claude session that edits the code inside Hive itself.
- A restart of the app ends every terminal in it. The session that edits the code ends too. Do the work in a git worktree, for example `~/projects/hive-wt`, and test there.
- Never run `pkill` on `electron` or `electron-vite`. It ends the running app and the session in it.
- Do not edit files in the folder of the running dev app. A change to a React or CSS file reloads the interface only. A change to a file that holds the app state reloads the page, and the tabs come back. A change under `src/main` restarts the app in `npm run dev:watch` only.
- Never commit or push to `main`. Make a branch, commit there, push the branch and open a pull request. The title of the pull request must have the form `type: description`, because the squash merge makes it the commit message. The ruleset "Protect main" blocks a direct push. Bring `main` into the branch before the merge, so that the checks run on the result. Do not merge a pull request unless the owner asks. `docs/TECH-STACK.md`, section 13, describes the rules.
- Commit and push only after the owner asks. Commit messages use the form `type: description`, and the type chooses the next version (`feat` minor, `fix` and `perf` patch, `!` major, the rest no release). `docs/TECH-STACK.md`, section 14, has the rules. The repository author is the personal address in the local git identity.
- Documentation and comments use plain English: short sentences, no contractions, no semicolons, no em-dashes, and the condition first. Do not use the modal verbs that the linter bans. Use `can`, `will` and `must`.
- Write tests for new rules. Run `npm test`, `npm run typecheck` and `npm run lint` before you finish. `npm run lint:fix` formats the code and applies the safe fixes. A pre-commit hook (Husky) runs the lint on the staged files. Do not skip it with `--no-verify`. If you change the interface, also run `npm run test:e2e`, and add a test there for a new behavior. The e2e tests use their own data folder and do not disturb a running Hive.
- Tests use fake terminal commands, not the real `claude` command. `docs/TECH-STACK.md` explains how, in section 12.

## 2. The specs

Hive is a desktop app that lists the Claude Code sessions of a folder and runs the real `claude` command in terminal panes. It runs on macOS, Windows and Linux. The CI runs the automated tests on Windows and Linux. The release build checks macOS. Two files hold the details.

- `docs/FEATURES.md` describes what the app does for the user, with the exact placement rules for panes and tabs.
- `docs/TECH-STACK.md` describes the stack, the processes, the files, the data formats, the terminal lifecycle, the hooks, the tests and the decisions.

@docs/FEATURES.md
@docs/TECH-STACK.md

## 3. Repository and workflow state

- GitHub: `calielc/ClaudeCode-Hive`, public. The branch `main` is protected, and it changes only through pull requests. `docs/TECH-STACK.md`, section 13, describes the ruleset and the pipelines.
- History: the first versions were a native macOS app in Swift. The tag `swift-v1` keeps that version. The Electron rewrite replaced it on `main`.
- `~/projects/claude-sessions-app` is the main project, and it can run `npm run dev`. `~/projects/hive-wt` is a git worktree on the branch `fix/survive-reload`. It exists to change code without a restart of a dev app that hosts a session.
- The local `main` of the main project can be behind GitHub. The script `~/projects/apply-hive-fix.sh` stashes old uncommitted copies, moves `main` forward to the branch and runs `npm install`.

## 4. Known gaps and ideas

- macOS has no automated test run in the CI. The release workflow builds the macOS app and starts it once. Terminals use `cmd.exe` on Windows. The hook command of the fallback runner uses POSIX syntax.
- No real Claude session was driven in the Electron version. Tests use fake commands.
- Notifications, real mouse drag and drop, and the Ctrl+Tab key press are not tested live. Synthetic events cover drag and drop and the link clicks.
- The installers are not signed with a trusted certificate, and the macOS app is not notarized. The macOS build has an ad hoc signature only. The Windows installer is tested here, and the macOS build is checked only by the release workflow. `docs/TECH-STACK.md`, section 14, describes the release pipeline.
- `npm audit` lists no findings on 2026-11-18. The audit workflow runs it on each change of the package files and every Monday. Run `npm audit` after each update. Do not accept the `--force` fixes, because they downgrade Vite and electron-builder.
- The app shows a notice for a newer release, but it does not update itself. A self-update needs `electron-updater` and, on macOS, a Developer ID signature. The check needs a published (not draft) release.
- Renovate opens the update pull requests. It needs the Renovate GitHub App on the repository. `docs/TECH-STACK.md`, section 13, describes the pipelines.
- The settings of the former Swift app do not carry over.
- A restart of the app ends all terminals. A separate long-lived process that owns the terminals will remove this limit and allow `dev:watch` inside Hive.
- Tabs come back after a page reload, not after an app restart.
- A plain click opens a link. A Cmd-click rule will avoid accidental opens.
- Ideas: `/rename` from inside Hive, a layout for each folder, a command palette, and a setting for the notification triggers.
