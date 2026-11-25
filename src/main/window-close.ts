/** What Hive does when an undocked window has closed. */
export type ClosedWindowAction = "dock" | "close" | "none";

/** Hive quitting closes nothing. A dock request docks the tab again. Any other close of the window closes the session. */
export function closedWindowAction(
  quitting: boolean,
  dockRequested: boolean,
): ClosedWindowAction {
  if (quitting) {
    return "none";
  }
  return dockRequested ? "dock" : "close";
}
