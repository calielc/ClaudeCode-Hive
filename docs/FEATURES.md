# Hive: product features

This file describes what Hive does for the user. The technical side is in `docs/TECH-STACK.md`. Working rules for agents are in `CLAUDE.md`. The text matches the code at commit `f525f08`.

## 1. What Hive is

Hive lists the Claude Code sessions of a folder on the left. It runs the real `claude` command in terminal panes on the right. It shows which sessions work, which wait for you, and which are ready. It runs on macOS, Windows and Linux. Only macOS is tested.

The owner is a developer who runs many sessions in parallel. The goals are a view of all sessions at a glance and fast switching. The app also arranges sessions side by side and signals a session that needs attention.

## 2. The left panel

- **Folder menu.** It selects the folder whose sessions are listed. The plus button adds a folder. The minus button removes the selected one from the list. The list and the selection are saved. The first start uses `~/code` as the folder. The home folder is the fallback for a machine without it.
- **Search.** The field searches the names of the sessions and the full text of their conversations, including the work of sub agents. Names match at once. The conversation search starts 300 ms after the last key and needs 2 characters. A result that matches only in a conversation carries the note "found in the conversation". Escape clears the field.
- **Status counts.** Three numbers: working, waiting, ready. They count the open sessions and the sessions of the last 24 hours.
- **Open section.** It has no heading and comes first. One card for each session open in a tab, in tab order. It also holds a new session that has no file yet, and a tab from another folder.
- **Last 24 hours section.** The sessions of the selected folder from the last day that are not open. One plain row for each session, with its age. A click on the heading folds the section. It starts open.
- **Older section.** The rest of the sessions, as plain rows. A click on the heading folds the section. It starts folded. Both headings show the number of sessions.
- **One place for each session.** A session is never in two sections. Opening a session moves it up to Open. Closing its tab moves it back.
- **Card content.** The state dot, the name and the age. Two chips for the repository (the folder that holds `.git`) and the branch. A chip for the model, for example "Sonnet 5.5", on the same line. The agent list (see section 3). The last prompt in two lines.
- **Card marks.** A window icon marks a session in its own window. A blue border marks the selected card. A thin orange or red border marks a working or waiting session.
- **State dots.** Orange and pulsing means working. Red means waiting for you. Green means ready.
- **Right-click menu.** Colour for every session. For an open session also: go to tab, undock or dock, close tab.
- **Usage footer.** See section 8.

## 3. Terminals and panes

- **Real terminals.** Each session runs `claude` in a pseudo terminal. A new session runs `claude --session-id <id>`. An old one runs `claude --resume <id>`. The login shell of the user runs the command, so a shell function named `claude` works.
- **Layouts.** Single, side by side, stacked, and a 2 by 2 grid. The buttons are at the top right. The layout is saved. The dividers between panes can be dragged, and their positions are saved.
- **Selected pane.** One pane has a blue border. It gets the next session that you pick. A click in a pane or on its header selects it.
- **Tab bar.** Each tab shows the pane number in a split layout, a window icon for an undocked session, the name, and a close button. The bar scrolls sideways only for tabs that do not fit. Its scroll stops at the ends.
- **New session.** The "New Session" button and Cmd+N start a session in the selected folder.
- **Process exit.** The tab closes after Claude ends, for example after `/exit`. A process that fails within 3 seconds keeps its tab, so the error stays readable.
- **Agent view.** The card of an open session lists its agents under the repository, branch and model chips. The first row is Main, the session itself, and every other row is an agent with its type and description. A dot shows if the agent still runs (orange) or is done (green). A click on an agent replaces the terminal in the pane of that session with its transcript, and a click on Main brings the terminal back. The terminal keeps running. Finished agents fold behind a "+N done" row, and a small cross on a finished agent hides it for as long as the page stays open. A finished agent leaves the list 30 minutes after it finished. The agent that you have open stays in the list. The transcript is read only. It shows the prompt, the thinking and the results folded, the tool calls in one line, and the answers. It updates while the agent runs and follows the end unless you scroll up. A session without agents shows no list.
- **Keyboard focus.** The terminal of the selected pane gets the keyboard after a new selection or a layout change. It gets it again after the window returns to the front. A search field in use keeps the focus.
- **Colour themes.** Six terminal themes: Tokyo Night (default), Dracula, Nord, Gruvbox Dark, Solarized Dark and Paper (light). The Theme menu in the menu bar picks one, and a mark shows the current theme. The choice is saved and applies to all open terminals at once.
- **Links.** A click on a web address in the terminal opens it in the default browser of the system. This works for addresses that wrap over several lines, and for links that a program marks itself (OSC 8). Only `http`, `https` and `mailto` links open. A link never opens a window of the app.

## 4. Placement rules

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

## 5. Undock and dock

A session can live in its own window, for example on another display. The Claude process keeps running. The new window opens on a second display, or on the main display for a machine with one display. It has a "Next display" button and a "Dock" button. Closing the window docks the session again. The undocked window shows the screen of the process by replaying its output. The process then redraws after a small resize. Theme and colour tags follow the main window.

## 6. Colour tags

Eight colours mark sessions: red, orange, yellow, green, teal, blue, purple and pink. They show as a stripe and a tint on the card or row, on the tab, and on the pane header. The right-click menu sets them. They are saved by session id.

## 7. Notifications

The system shows a notification with the session name in two cases. A session open in Hive finishes (working to ready), or it needs input (it becomes waiting). It shows nothing while a Hive window has the focus. The text of a toast for a waiting session is the question that Claude Code asks. A permission question also gets "Yes" and "No" buttons. "Yes" sends 1 to the terminal, and "No" sends Escape. The buttons act only while the session still waits. A click on the toast brings the window to the front and selects the session. A tray icon opens Hive with a click. Its tooltip, a red badge on the taskbar icon (Windows) and the badge of the dock icon (macOS) show how many open sessions wait for you. Sessions that run outside Hive do not notify. The state comes from the hooks. `docs/TECH-STACK.md` describes them in section 8.

## 8. Usage limits

The footer shows the 5 hour window and the weekly limit, and one bar for each model limit of the account. Each bar shows the percent used and the time until reset. Bars turn orange at 60 percent and red at 85 percent. After the reset time of a window, the bar shows a dash and "reset" until the next update. A note appears for numbers older than 10 minutes. The numbers refresh only while a Claude Code session is open, because only the status line receives them. Without the hooks, the footer shows "Install hooks".

## 9. Keys

- Next tab and previous tab: Ctrl+Tab and Ctrl+Shift+Tab, on every system.
- New session: Cmd+N on macOS, Ctrl+N elsewhere.
- Search: Cmd+F on macOS, Ctrl+F elsewhere.
- Copy, cut and paste: Ctrl+C, Ctrl+X and Ctrl+V on every system, and also Cmd+C, Cmd+X and Cmd+V on macOS. A terminal cannot cut, so cut copies. Ctrl+C and Ctrl+X without a selection still go to Claude Code. With an image on the clipboard, paste goes to Claude Code as its own image paste key (Ctrl+V, and Alt+V on Windows).
- Cards, session rows, agent rows and tabs take the keyboard focus. Tab moves between them, and Enter or Space does what a click does. A ring shows the focused item.
- Plain Shift+Tab goes to Claude Code. The code is in `src/renderer/shortcuts.ts`.

