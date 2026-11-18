const isMac = window.hive?.platform === 'darwin'

export type ShortcutAction =
  | { type: 'cycle'; backwards: boolean }
  | { type: 'newSession' }
  | { type: 'addFolder' }
  | { type: 'search' }
  | { type: 'layout'; index: number }
  | { type: 'undock' }

/**
 * The keys Hive handles itself. On macOS the modifier is Cmd. On other systems it is Ctrl+Shift,
 * because plain Ctrl+letter belongs to the terminal. Ctrl+Tab works everywhere.
 */
export function shortcutFor(event: KeyboardEvent): ShortcutAction | undefined {
  if (event.key === 'Tab' && event.ctrlKey && !event.metaKey && !event.altKey) {
    return { type: 'cycle', backwards: event.shiftKey }
  }
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && event.shiftKey
  if (!mod) {
    return undefined
  }
  if (event.altKey && /^Digit[1-4]$/.test(event.code)) {
    return { type: 'layout', index: Number(event.code.slice(-1)) - 1 }
  }
  if (event.altKey) {
    return undefined
  }
  const key = event.key.toLowerCase()
  if (isMac) {
    if (key === 'n' && !event.shiftKey) {
      return { type: 'newSession' }
    }
    if (key === 'o' && !event.shiftKey) {
      return { type: 'addFolder' }
    }
    if (key === 'f' && !event.shiftKey) {
      return { type: 'search' }
    }
    if (key === 'd' && event.shiftKey) {
      return { type: 'undock' }
    }
    return undefined
  }
  const letters: Record<string, ShortcutAction> = {
    n: { type: 'newSession' },
    o: { type: 'addFolder' },
    f: { type: 'search' },
    u: { type: 'undock' }
  }
  return letters[key]
}
