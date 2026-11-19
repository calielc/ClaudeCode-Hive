export function relativeAge(date: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - date) / 1000));
  if (seconds < 60) {
    return "now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

/** "claude-sonnet-5-5" becomes "Sonnet 5.5". "claude-opus-4-1-20250805" becomes "Opus 4.1". */
export function shortModelName(raw: string): string {
  const parts = raw.replace("claude-", "").split("-");
  const family = parts.find((part) => /^[a-z]+$/i.test(part)) ?? raw;
  const version = parts
    .filter((part) => /^\d+$/.test(part) && part.length < 6)
    .join(".");
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return version ? `${name} ${version}` : name;
}

export function countdown(
  target: number | null,
  now: number = Date.now(),
): string {
  if (target === null) {
    return "";
  }
  const minutes = Math.max(0, Math.floor((target - now) / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

export function abbreviatePath(path: string, home: string): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
