import type { UsageWindow } from "../shared/types.ts";

const HOUR = 3_600_000;
const WINDOW_5_HOURS = 5 * HOUR;
const WINDOW_WEEK = 7 * 24 * HOUR;
/** A forecast needs this share of the window to have passed. Before that, the pace is too noisy. */
const MIN_ELAPSED_SHARE = 0.05;

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 21;

/** The working hours of one local calendar day. Every day of the week counts, so a week holds 84 hours. */
function workDay(
  year: number,
  month: number,
  day: number,
): { start: number; end: number } {
  return {
    start: new Date(year, month, day, WORK_START_HOUR).getTime(),
    end: new Date(year, month, day, WORK_END_HOUR).getTime(),
  };
}

/** The working milliseconds between two instants. Working time is every day, 09:00 to 21:00 in the local time zone. */
export function workTimeBetween(a: number, b: number): number {
  if (b <= a) {
    return 0;
  }
  const first = new Date(a);
  const last = new Date(b);
  const lastDay = new Date(
    last.getFullYear(),
    last.getMonth(),
    last.getDate(),
  ).getTime();
  let total = 0;
  for (
    let day = first.getDate(),
      cursor = new Date(first.getFullYear(), first.getMonth(), day);
    cursor.getTime() <= lastDay;
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    )
  ) {
    const hours = workDay(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
    );
    total += Math.max(0, Math.min(b, hours.end) - Math.max(a, hours.start));
  }
  return total;
}

/** The earliest instant at which `workMs` of working time has passed after `from`. */
export function addWorkTime(from: number, workMs: number): number {
  if (workMs <= 0) {
    return from;
  }
  let remaining = workMs;
  let cursor = new Date(from);
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  for (;;) {
    const hours = workDay(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
    );
    const start = Math.max(from, hours.start);
    if (start < hours.end) {
      const available = hours.end - start;
      if (remaining <= available) {
        return start + remaining;
      }
      remaining -= available;
    }
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
  }
}

/** What the current pace means for a usage window: the limit runs out before the reset, or the usage at the reset. */
export type UsageForecast =
  | { kind: "runs-out"; msLeft: number }
  | { kind: "lasts"; percentAtReset: number };

/** The length of a usage window in milliseconds, or null for a label that Hive does not know. */
function windowLength(label: string): number | null {
  if (label === "5 hours") {
    return WINDOW_5_HOURS;
  }
  return label.startsWith("Week") ? WINDOW_WEEK : null;
}

/** Extends the usage so far in a straight line to the reset. Returns null when the data is too thin to say. */
export function forecastUsage(
  window: UsageWindow,
  now: number,
): UsageForecast | null {
  const length = windowLength(window.label);
  const { percent, resetsAt } = window;
  if (length === null || percent === null || percent <= 0) {
    return null;
  }
  if (resetsAt === null || resetsAt <= now) {
    return null;
  }
  const remaining = resetsAt - now;
  if (remaining > length) {
    return null;
  }
  if (window.label.startsWith("Week")) {
    return forecastWorkWeek(percent, now, resetsAt);
  }
  const elapsed = length - remaining;
  if (elapsed < length * MIN_ELAPSED_SHARE) {
    return null;
  }
  if (percent >= 100) {
    return { kind: "runs-out", msLeft: 0 };
  }
  // The limit is hit before the reset when (100 - percent) / rate < remaining, with rate = percent / elapsed.
  // The cross-multiplied form avoids a float error at the exact boundary.
  if ((100 - percent) * elapsed < percent * remaining) {
    return {
      kind: "runs-out",
      msLeft: Math.round(((100 - percent) * elapsed) / percent),
    };
  }
  return {
    kind: "lasts",
    percentAtReset: Math.min(100, Math.round((percent * length) / elapsed)),
  };
}

/** The forecast of a weekly window. Only working time counts, so the nights do not lower the pace. */
function forecastWorkWeek(
  percent: number,
  now: number,
  resetsAt: number,
): UsageForecast | null {
  const start = resetsAt - WINDOW_WEEK;
  const elapsedWork = workTimeBetween(start, now);
  const remainingWork = workTimeBetween(now, resetsAt);
  const totalWork = workTimeBetween(start, resetsAt);
  if (elapsedWork < totalWork * MIN_ELAPSED_SHARE) {
    return null;
  }
  if (percent >= 100) {
    return { kind: "runs-out", msLeft: 0 };
  }
  if ((100 - percent) * elapsedWork < percent * remainingWork) {
    const workToFull = ((100 - percent) * elapsedWork) / percent;
    return {
      kind: "runs-out",
      msLeft: Math.round(addWorkTime(now, workToFull) - now),
    };
  }
  return {
    kind: "lasts",
    percentAtReset: Math.min(
      100,
      Math.round((percent * totalWork) / elapsedWork),
    ),
  };
}
