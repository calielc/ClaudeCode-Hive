import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { PtyExit } from "@shared/types";
import { DEFAULT_FONT_SIZE } from "./font-size";
import { shortcutFor } from "./shortcuts";
import { type TerminalTheme, toXtermTheme } from "./themes";

/** The font size of all terminals. A new terminal starts with it. */
let fontSize = DEFAULT_FONT_SIZE;

/** One terminal per session. It lives as long as the tab, also while no pane shows it. */
export interface TerminalEntry {
  id: string;
  folder: string;
  resume: boolean;
  term: Terminal;
  fit: FitAddon;
  element: HTMLDivElement;
  opened: boolean;
  started: boolean;
  ready: boolean;
}

const entries = new Map<string, TerminalEntry>();
let exitHandler: ((exit: PtyExit) => void) | undefined;
let listening = false;

const FONT =
  'Menlo, Monaco, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';

function listenOnce(): void {
  if (listening) {
    return;
  }
  listening = true;
  window.hive.pty.onData((id, data) => {
    // Data that comes before the first answer of `attach` is already in its buffer.
    const entry = entries.get(id);
    if (entry?.ready) {
      entry.term.write(data);
    }
  });
  window.hive.pty.onExit((exit) => {
    if (window.hive.debug) {
      // biome-ignore lint/suspicious/noConsole: A debug trace. It shows only when HIVE_DEBUG is set.
      console.log("[pty exit]", JSON.stringify(exit));
    }
    entries
      .get(exit.id)
      ?.term.write(
        `\r\n\x1b[2m[process ended with code ${exit.exitCode}]\x1b[0m\r\n`,
      );
    exitHandler?.(exit);
  });
}

export function onProcessExit(handler: (exit: PtyExit) => void): void {
  exitHandler = handler;
  listenOnce();
}

export function getEntry(id: string): TerminalEntry | undefined {
  return entries.get(id);
}

export function createEntry(
  id: string,
  folder: string,
  resume: boolean,
  theme: TerminalTheme,
): TerminalEntry {
  const existing = entries.get(id);
  if (existing) {
    return existing;
  }
  listenOnce();
  const term = new Terminal({
    fontFamily: FONT,
    fontSize,
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
    theme: toXtermTheme(theme),
    // Links that the program marks itself (OSC 8) open in the browser of the system too.
    linkHandler: { activate: (_event, text) => window.hive.openExternal(text) },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  // Web addresses in the text, also when they wrap over several lines, open in the browser of the system.
  term.loadAddon(
    new WebLinksAddon((_event, url) => window.hive.openExternal(url)),
  );
  const element = document.createElement("div");
  element.className = "terminal-host";
  const entry: TerminalEntry = {
    id,
    folder,
    resume,
    term,
    fit,
    element,
    opened: false,
    started: false,
    ready: false,
  };
  entries.set(id, entry);

  // Keys that Hive handles itself must not reach the terminal.
  term.attachCustomKeyEventHandler((event) => {
    if (isNewLineKey(event)) {
      event.preventDefault();
      term.input(NEW_LINE);
      return false;
    }
    const handled = clipboardKey(term, event);
    return handled === undefined ? shortcutFor(event) === undefined : !handled;
  });
  term.onData((data) => {
    if (entry.started) {
      window.hive.pty.write(id, data);
    }
  });
  term.onResize(({ cols, rows }) => {
    if (entry.started) {
      window.hive.pty.resize(id, cols, rows);
    }
  });
  return entry;
}

/** Claude Code reads Escape and Enter as a new line in the prompt. A terminal sends a plain Enter for Shift+Enter and Ctrl+Enter, which submits. */
const NEW_LINE = "\x1b\r";

/** Shift, Ctrl, Alt or Cmd with Enter. Only the key press counts, and an Enter that confirms an input method does not. */
function isNewLineKey(event: KeyboardEvent): boolean {
  return (
    event.type === "keydown" &&
    event.key === "Enter" &&
    !event.isComposing &&
    (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
  );
}

/**
 * On macOS, Cmd and Ctrl both copy, cut and paste with C, X and V. On the other systems, Ctrl does. A terminal cannot cut, so X copies.
 * Ctrl+C and Ctrl+X without a selection still reach the program, because they interrupt and cancel.
 * Ctrl+V with an image on the clipboard still reaches Claude Code, which pastes images with it.
 * Returns true when Hive handled the key, and undefined when the terminal must see it.
 */
function clipboardKey(
  term: Terminal,
  event: KeyboardEvent,
): boolean | undefined {
  if (event.type !== "keydown" || event.altKey || event.shiftKey) {
    return undefined;
  }
  if (event.metaKey === event.ctrlKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "c" || key === "x") {
    if (term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection());
      event.preventDefault();
      return true;
    }
    return event.metaKey ? true : undefined;
  }
  if (key === "v") {
    event.preventDefault();
    void pasteInto(term);
    return true;
  }
  return undefined;
}

async function pasteInto(term: Terminal): Promise<void> {
  try {
    const items = await navigator.clipboard.read();
    if (
      items.some((item) => item.types.some((type) => type.startsWith("image/")))
    ) {
      // Claude Code pastes an image with Ctrl+V, and with Alt+V on Windows.
      term.input(window.hive?.platform === "win32" ? "\x1bv" : "\x16");
      return;
    }
  } catch {
    // The clipboard has no rich content, or the page may not read it. Paste the text.
  }
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      term.paste(text);
    }
  } catch {
    // Nothing to paste.
  }
}

/** Puts the terminal into a container. The first time, it also starts the process with the real size. */
export function mountEntry(entry: TerminalEntry, container: HTMLElement): void {
  container.appendChild(entry.element);
  if (!entry.opened) {
    entry.term.open(entry.element);
    entry.opened = true;
  }
  // A timer, not requestAnimationFrame: a covered or minimized window does not run animation frames,
  // and the session must start anyway.
  setTimeout(() => {
    fitEntry(entry);
    void start(entry);
  }, 0);
}

export function unmountEntry(
  entry: TerminalEntry,
  container: HTMLElement,
): void {
  if (entry.element.parentElement === container) {
    container.removeChild(entry.element);
  }
}

export function fitEntry(entry: TerminalEntry): void {
  if (
    entry.element.isConnected &&
    entry.element.clientWidth > 0 &&
    entry.element.clientHeight > 0
  ) {
    try {
      entry.fit.fit();
    } catch {
      // The terminal is not ready to measure yet.
    }
  }
}

async function start(entry: TerminalEntry): Promise<void> {
  if (entry.started) {
    return;
  }
  entry.started = true;
  const size = entry.fit.proposeDimensions();
  const cols = size?.cols ?? 100;
  const rows = size?.rows ?? 30;
  let result: Awaited<ReturnType<typeof window.hive.pty.attach>>;
  try {
    result = await window.hive.pty.attach(entry.id, {
      folder: entry.folder,
      resume: entry.resume,
      cols,
      rows,
    });
  } catch (error) {
    // Say why in the terminal, so the user is not left with an empty pane.
    entry.term.write(
      `\r\n\x1b[31mCould not start the session: ${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`,
    );
    return;
  }
  if (result.buffer) {
    entry.term.write(result.buffer);
  }
  entry.ready = true;
  if (!result.created) {
    // A second window shows a process that already runs. Changing the size once makes Claude Code draw the screen again.
    window.hive.pty.resize(entry.id, Math.max(cols - 1, 2), rows);
    setTimeout(() => window.hive.pty.resize(entry.id, cols, rows), 60);
  }
}

export function disposeEntry(id: string): void {
  const entry = entries.get(id);
  if (entry) {
    entries.delete(id);
    entry.element.remove();
    entry.term.dispose();
  }
}

export function applyTheme(theme: TerminalTheme): void {
  for (const entry of entries.values()) {
    entry.term.options.theme = toXtermTheme(theme);
  }
}

/** Gives every terminal this font size and fits it again, because the number of columns and rows changes. */
export function applyFontSize(size: number): void {
  if (size === fontSize) {
    return;
  }
  fontSize = size;
  for (const entry of entries.values()) {
    entry.term.options.fontSize = size;
    fitEntry(entry);
  }
}

export function focusEntry(id: string): void {
  const entry = entries.get(id);
  if (entry?.element.isConnected) {
    entry.term.focus();
  }
}

/** The font size that a terminal draws with. Used by tests. */
export function terminalFontSize(id: string): number | undefined {
  return entries.get(id)?.term.options.fontSize;
}

/** The text on the screen and in the scrollback of a terminal. Used by tests. */
export function terminalText(id: string): string {
  const entry = entries.get(id);
  if (!entry) {
    return "";
  }
  const buffer = entry.term.buffer.active;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
  }
  return lines.join("\n").trim();
}

/** Where a text is on the screen of a terminal, in window coordinates. Used by tests to click a link. */
export function pointOf(
  id: string,
  needle: string,
  offset = 0,
): { x: number; y: number } | null {
  const entry = entries.get(id);
  const screen = entry?.term.element?.querySelector(".xterm-screen");
  if (!entry || !screen) {
    return null;
  }
  const buffer = entry.term.buffer.active;
  for (let row = 0; row < entry.term.rows; row += 1) {
    const line =
      buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "";
    const column = line.indexOf(needle);
    if (column >= 0) {
      const rect = screen.getBoundingClientRect();
      const cellWidth = rect.width / entry.term.cols;
      const cellHeight = rect.height / entry.term.rows;
      return {
        x: rect.left + (column + offset + 0.5) * cellWidth,
        y: rect.top + (row + 0.5) * cellHeight,
      };
    }
  }
  return null;
}
