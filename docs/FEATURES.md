# Hive: product features

This file describes what Hive does for the user. `docs/TECH-STACK.md` describes the technical side. `CLAUDE.md` has the working rules for agents. The text matches the code at commit `f525f08`.

## 1. What Hive is

Hive lists the Claude Code sessions of a folder on the left. It runs the real `claude` command in terminal panes on the right. It shows which sessions work, which sessions wait for you, and which sessions are ready. It runs on macOS, Windows and Linux. Only macOS is tested.

The owner is a developer who runs many sessions in parallel. The goals are a view of all sessions at a glance and fast switching. The app also puts sessions side by side. It signals a session that needs attention.

## 2. The left panel

- **Folder menu.** It selects the folder whose sessions are on the list. The plus button adds a folder. The minus button removes the selected folder from the list. Hive saves the list and the selection. The first start uses the home folder of the user. The menu shows the home folder as its own name. It shows other folders with "~" for the home folder.
- **Search.** The field searches the names of the sessions. It also searches the full text of the conversations, with the work of sub-agents. Names match at once. The search of conversations starts 300 ms after the last key. It needs 2 characters. A result that matches only in a conversation shows the note "found in the conversation". Escape clears the field.
- **Status counts.** Three numbers show the sessions that work, wait and are ready. They count the open sessions and the sessions of the last 24 hours.
- **Open section.** This section has no heading and comes first. It has one card for each session that is open in a tab, in tab order. It also holds a new session that has no file yet. It also holds a tab from another folder.
- **Last 24 hours section.** It lists the sessions of the selected folder from the last day that are not open. Each session has one plain row with its age. A click on the heading folds the section. The section starts open.
- **Older section.** It lists the rest of the sessions as plain rows. A click on the heading folds the section. The section starts folded. Both headings show the number of sessions.
- **One place for each session.** A session is never in two sections. When you open a session, it moves up to Open. When you close its tab, it moves back.
- **Card content.** A card shows the state dot, the name and the age. It shows a chip for the repository (the folder that holds `.git`), a chip for the branch, and a chip for the model, for example "Sonnet 5.5". The three chips are on one line. Then the card shows the agent list (see section 3) and the last prompt in two lines.
- **Card marks.** A window icon marks a session in its own window. A blue ring marks the selected card. A thin orange or red border marks a session that works or waits.
- **State dots.** An orange dot that pulses means working. A red dot means waiting for you. A green dot means ready.
- **Right-click menu.** The menu sets the color of every session. For an open session, it also has these items: go to tab, undock or dock, close tab.
- **Usage footer.** See section 8.

## 3. Terminals and panes

- **Real terminals.** Each session runs `claude` in a pseudo terminal. A new session runs `claude --session-id <id>`. An old session runs `claude --resume <id>`. The login shell of the user runs the command. Because of this, a shell function with the name `claude` works.
- **Layouts.** The layouts are single, side by side, stacked, and a 2 by 2 grid. The buttons are at the top right. Hive saves the layout. You can drag the dividers between panes. Hive saves their positions.
- **Selected pane.** A blue ring marks the selected pane. It gets the next session that you pick. A click in a pane selects it.
- **Tab bar.** Each tab shows the pane number in a split layout, the state dot, the name, a button to undock, and a close button. A window icon marks an undocked tab. The bar scrolls sideways only when the tabs do not fit. Its scroll stops at the ends. The selected tab scrolls into view.
- **New session.** The "New Session" button starts a session in the selected folder. The keys for this are in section 9.
- **Process exit.** After Claude ends, for example after `/exit`, the tab closes. A process that fails within 3 seconds keeps its tab. Then the error stays readable.
- **Agent list.** The card of an open session lists its agents under the chips. The first row is Main, the session itself. Each other row is an agent. It shows an icon for the type of the agent, the description, and the model. A session without agents shows no list. A list of more than about five rows scrolls inside the card.
- **Agent status.** A dot shows if the agent still runs (orange) or is done (green). Done agents fold behind a row with the text "+N done". A small cross on a done agent hides it until the page reloads. A done agent leaves the list 30 minutes after it finishes. The agent that you have open stays in the list.
- **Agent transcript.** A click on an agent replaces the terminal in the pane of that session with the transcript of the agent. A click on Main brings the terminal back. The terminal keeps running. The transcript is read only. It shows the prompt, the thinking, the results (folded), the tool calls (one line each) and the answers. It updates while the agent runs. It follows the end, unless you scroll up.
- **Keyboard focus.** After a new selection or a layout change, the terminal of the selected pane gets the keyboard. It gets the keyboard again after the window returns to the front. A search field in use keeps the focus.
- **Color themes.** Six terminal themes exist: Tokyo Night (default), Dracula, Nord, Gruvbox Dark, Solarized Dark and Paper (light). The Theme menu in the menu bar selects a theme. A mark shows the current theme. Hive saves the choice. It applies to all open terminals at once.
- **Links.** A click on a web address in the terminal opens it in the default browser of the system. This works for addresses that wrap over several lines. It also works for links that a program marks itself (OSC 8). Only `http`, `https` and `mailto` links open. A link never opens a window of the app.

## 4. Placement rules

These rules are the most important behavior. Pure functions in `src/renderer/panes.ts` implement them. Tests cover them.

1. A click on a visible tab (tab bar, left panel or Ctrl+Tab) selects its pane only. Nothing moves. The divider sizes stay the same.
2. A click on a hidden tab replaces the session in the selected pane. The replaced session stays open in the tab bar.
3. A click on a tab in its own window selects the tab. It brings the window to the front.
4. A new session goes into the selected pane if that pane is empty. Otherwise it goes into the first empty pane. If no pane is empty, it replaces the session in the selected pane.
5. When you switch to a split layout, the current session stays first (left or top). The other panes fill with the next tabs in tab order. The order wraps around at the end.
6. When you switch to a smaller layout and the selected pane disappears, its session goes to the first pane.
7. When you close a visible tab, its pane fills with the next hidden tab. A pane stays empty only when no hidden tab is left.
8. When you drop a session on a pane (drag from the left panel or the tab bar), the session goes into that pane. A visible tab swaps places with the current tab of the pane. A tab in its own window docks into the pane.
9. When you undock a tab, it leaves its pane and a hidden tab fills the pane. When you dock a tab, it goes into an empty pane. If no pane is empty, it goes into the selected pane.
10. You can drag a tab, or a card in the Open section, onto another one. It lands before or after the target, by the half where you drop. A line shows the place. A drop on free space in the bar moves it to the end. The panes keep their sessions. Ctrl+Tab and the fill rule in point 5 follow the new order.

## 5. Undock and dock

A session can live in its own window, for example on another display. The Claude process keeps running. The new window opens on a second display. On a machine with one display, it opens on the main display. The window has a "Next display" button and a "Dock" button. When you close the window, the session docks again.

The undocked window shows the screen of the process by a replay of its output. Then the process redraws after a small resize. Theme and color tags follow the main window.

## 6. Color tags

Eight colors mark sessions: red, orange, yellow, green, teal, blue, purple and pink. A color shows as a stripe and a tint on the card or row. It also shows on the tab and as the border of the pane. The right-click menu sets the color. Hive saves the colors by session id.

## 7. Notifications

- The system shows a notification with the session name in two cases. In the first case, a session that is open in Hive finishes (working to ready). In the second case, it needs input (it becomes waiting).
- No notification shows while a Hive window has the focus.
- The notification of a waiting session shows the question that Claude Code asks.
- A permission question also gets "Yes" and "No" buttons. "Yes" sends 1 to the terminal. "No" sends Escape. The buttons act only while the session still waits.
- A click on the notification brings the window to the front and selects the session.
- A tray icon opens Hive with a click. Its tooltip shows how many open sessions wait for you. A red badge on the taskbar icon (Windows) and the badge of the dock icon (macOS) show the same number.
- Sessions that run outside Hive do not notify.
- The state comes from the hooks. Section 8 of `docs/TECH-STACK.md` describes them.

## 8. Usage limits

- The footer shows the 5 hour window and the weekly limit. It also shows one bar for each model limit of the account.
- Each bar shows the percent used and the time until the reset. A tooltip on the row gives the real date and time of the reset, in the time zone of the computer.
- A bar turns orange at 60 percent and red at 85 percent.
- After the reset time of a window, the bar shows a dash and "reset" until the next update.
- A note appears for numbers that are older than 10 minutes.
- The numbers refresh only while a Claude Code session is open, because only the status line receives them.
- Without the hooks, the footer shows "Install hooks".

## 9. Keys

- Next tab and previous tab: Ctrl+Tab and Ctrl+Shift+Tab, on every system.
- New session: Cmd+N on macOS and Ctrl+N on other systems.
- Search: Cmd+F on macOS and Ctrl+F on other systems.
- Copy, cut and paste: Ctrl+C, Ctrl+X and Ctrl+V work on every system. On macOS, Cmd+C, Cmd+X and Cmd+V also work. A terminal cannot cut, so cut copies. Ctrl+C and Ctrl+X without a selection still go to Claude Code. If an image is on the clipboard, paste goes to Claude Code as its own image paste key (Ctrl+V, and Alt+V on Windows).
- Cards, session rows, agent rows and tabs take the keyboard focus. Tab moves the focus between them. Enter or Space does what a click does. A ring shows the focused item.
- Plain Shift+Tab goes to Claude Code. The code is in `src/renderer/shortcuts.ts`.
