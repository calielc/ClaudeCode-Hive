const isMac = window.hive?.platform === "darwin";

export type ShortcutAction =
  | { type: "cycle"; backwards: boolean }
  | { type: "newSession" }
  | { type: "search" }
  | { type: "toggleSidebar" };

/**
 * The keys Hive handles itself. On macOS the modifier is Cmd. On other systems, new session and search use
 * plain Ctrl. Ctrl+Tab works everywhere.
 */
export function shortcutFor(event: KeyboardEvent): ShortcutAction | undefined {
  if (event.key === "Tab" && event.ctrlKey && !event.metaKey && !event.altKey) {
    return { type: "cycle", backwards: event.shiftKey };
  }
  if (
    !isMac &&
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    const plain = event.key.toLowerCase();
    if (plain === "n") {
      return { type: "newSession" };
    }
    if (plain === "f") {
      return { type: "search" };
    }
    if (plain === "b") {
      return { type: "toggleSidebar" };
    }
  }
  if (
    isMac &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    const key = event.key.toLowerCase();
    if (key === "n") {
      return { type: "newSession" };
    }
    if (key === "f") {
      return { type: "search" };
    }
    if (key === "b") {
      return { type: "toggleSidebar" };
    }
  }
  return undefined;
}
