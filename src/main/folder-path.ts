import { statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * A folder path that the user typed, as the absolute path of a folder that exists. `~` means the home folder, and a
 * relative path starts in the home folder. Quotes around a pasted path are removed. A path that is not a folder gives
 * null.
 */
export function resolveFolder(input: unknown, home: string): string | null {
  if (typeof input !== "string") {
    return null;
  }
  let text = input
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  if (text === "") {
    return null;
  }
  if (text === "~") {
    text = home;
  } else if (/^~[\\/]/.test(text)) {
    text = join(home, text.slice(2));
  }
  const full = isAbsolute(text) ? resolve(text) : resolve(home, text);
  try {
    return statSync(full).isDirectory() ? full : null;
  } catch {
    return null;
  }
}
