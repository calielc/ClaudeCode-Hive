import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BackgroundSummary } from "@shared/types";
import { MAX_BYTES, SAFE_ID, STALE_MS } from "./agents";
import { projectDirectory } from "./paths";

type Json = Record<string, unknown>;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CRON_LIFETIME_MS = 7 * DAY;
const MAX_EVENTS = 200;
const MAX_EVENT_CHARS = 500;
const MAX_DETAIL_CHARS = 60000;
const KINDS: readonly string[] = ["monitor", "cron", "wakeup"];
const TOOLS = [
  "Monitor",
  "CronCreate",
  "CronDelete",
  "TaskStop",
  "ScheduleWakeup",
];
/** The part of a row id after the prefix. Real tool call ids hold an underscore, which SAFE_ID rejects. */
const SAFE_PART = /^[A-Za-z0-9_-]+$/;
const LOOP_SENTINEL = "<<autonomous-loop-dynamic>>";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface Ending {
  at: number;
  reason: string;
}

interface MonitorData {
  kind: "monitor";
  id: string;
  title: string;
  source: string;
  started: number;
  /** Milliseconds after the start. Null for a persistent monitor. */
  expiry: number | null;
  events: { at: number; text: string }[];
  ending?: Ending;
}

interface CronData {
  kind: "cron";
  id: string;
  title: string;
  cron: string;
  prompt: string;
  recurring: boolean;
  created: number;
  ending?: Ending;
}

interface WakeupData {
  kind: "wakeup";
  id: string;
  title: string;
  prompt: string;
  created: number;
  due: number;
  ending?: Ending;
}

type Data = MonitorData | CronData | WakeupData;

const cache = new Map<
  string,
  { modified: number; size: number; rows: Data[] }
>();

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local time as `YYYY-MM-DD HH:MM:SS`. */
function formatTime(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** `10:01` on the day of `now`, otherwise `Nov 25 09:00`. */
function formatNext(epoch: number, now: number): string {
  const date = new Date(epoch);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toDateString() === new Date(now).toDateString()
    ? clock
    : `${MONTHS[date.getMonth()]} ${date.getDate()} ${clock}`;
}

/** The text of a tool result: a string, or the text blocks joined by a line break. */
function resultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content
        .map((block) => text((block as Json | null)?.text))
        .filter(Boolean)
        .join("\n")
    : "";
}

interface Call {
  name: string;
  input: Json;
}

function parseRows(raw: string): Data[] {
  const rows: Data[] = [];
  const calls = new Map<string, Call>();
  const monitor = (id: string) =>
    rows.find(
      (row): row is MonitorData => row.kind === "monitor" && row.id === id,
    );

  const finishCall = (call: Call, id: string, output: string, at: number) => {
    if (call.name === "Monitor") {
      const task = /Monitor started \(task ([^,)]+)/.exec(output)?.[1];
      if (!task || !SAFE_PART.test(task) || monitor(task)) {
        return;
      }
      const expires = /expires in (\d+)([mh])/.exec(output);
      rows.push({
        kind: "monitor",
        id: task,
        title: text(call.input.description) || "Monitor",
        source: call.input.command
          ? `Command: ${text(call.input.command)}`
          : `Watch: ${text(call.input.ws ?? call.input.url)}`,
        started: at,
        expiry: expires
          ? Number(expires[1]) * (expires[2] === "h" ? HOUR : MINUTE)
          : null,
        events: [],
      });
    } else if (call.name === "CronCreate") {
      const made = /Scheduled (recurring job|one-shot task) (\S+) \(/.exec(
        output,
      );
      const job = made?.[2];
      if (!made || !job || !SAFE_PART.test(job)) {
        return;
      }
      if (rows.some((row) => row.kind === "cron" && row.id === job)) {
        return;
      }
      rows.push({
        kind: "cron",
        id: job,
        title: text(call.input.prompt) || text(call.input.cron),
        cron: text(call.input.cron),
        prompt: text(call.input.prompt),
        recurring: made[1] === "recurring job",
        created: at,
      });
    } else if (call.name === "CronDelete") {
      const row = rows.find(
        (item) => item.kind === "cron" && item.id === call.input.id,
      );
      if (row && !row.ending) {
        row.ending = { at, reason: "cancelled" };
      }
    } else if (call.name === "TaskStop") {
      const row = monitor(text(call.input.task_id));
      if (row && !row.ending) {
        row.ending = { at, reason: "stopped" };
      }
    } else if (call.name === "ScheduleWakeup") {
      const last = rows.findLast((row) => row.kind === "wakeup");
      if (call.input.stop === true) {
        if (output.startsWith("Loop stopped") && last && !last.ending) {
          last.ending = { at, reason: "cancelled" };
        }
        return;
      }
      const seconds = /\(in (\d+)s\)/.exec(output)?.[1];
      if (!output.includes("Next wakeup scheduled") || !seconds) {
        return;
      }
      if (last) {
        rows.splice(rows.indexOf(last), 1);
      }
      rows.push({
        kind: "wakeup",
        id,
        title: text(call.input.reason) || "Wake-up",
        prompt: text(call.input.prompt),
        created: at,
        due: at + Number(seconds) * SECOND,
      });
    }
  };

  for (const row of raw.split("\n")) {
    const isNotice = row.includes("<task-notification>");
    const isCall = !isNotice && row.includes('"tool_use"');
    const isResult =
      !isNotice &&
      !isCall &&
      row.includes('"tool_result"') &&
      [...calls.keys()].some((id) => row.includes(id));
    if (
      !(
        isNotice ||
        isResult ||
        (isCall && TOOLS.some((tool) => row.includes(tool)))
      )
    ) {
      continue;
    }
    let entry: Json;
    try {
      entry = JSON.parse(row) as Json;
    } catch {
      continue;
    }
    const at = Date.parse(text(entry.timestamp));
    const content = (entry.message as Json | undefined)?.content;
    if (entry.type === "user" && typeof content === "string") {
      const task = /<task-id>([^<]*)<\/task-id>/.exec(content)?.[1];
      const event = /<event>([\s\S]*?)<\/event>/.exec(content)?.[1];
      const status = /<status>([^<]*)<\/status>/.exec(content)?.[1]?.trim();
      const target = task === undefined ? undefined : monitor(task);
      if (!target || event === undefined || Number.isNaN(at)) {
        continue;
      }
      if (event.startsWith("[Monitor")) {
        const reason = event.includes("expired")
          ? "expired"
          : /ended|stopped/.test(event)
            ? "stopped"
            : undefined;
        if (reason && !target.ending) {
          target.ending = { at, reason };
        }
        continue;
      }
      target.events.push({ at, text: event.replace(/\s*\n\s*/g, " ") });
      if (status && status !== "running" && !target.ending) {
        target.ending = { at, reason: "stopped" };
      }
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content as (Json | null)[]) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const id = text(block.id) || text(block.tool_use_id);
      if (block.type === "tool_use" && text(block.id) && isCall) {
        const name = text(block.name);
        if (TOOLS.includes(name)) {
          calls.set(id, { name, input: (block.input as Json | null) ?? {} });
        }
      } else if (block.type === "tool_result" && isResult) {
        const call = calls.get(id);
        if (call && block.is_error !== true && !Number.isNaN(at)) {
          calls.delete(id);
          finishCall(call, id, resultText(block.content), at);
        }
      }
    }
  }
  return rows;
}

async function loadRows(file: string): Promise<Data[]> {
  const info = await stat(file);
  const cached = cache.get(file);
  // A file that changes twice within one tick of the clock keeps its time, so the size is part of the key.
  if (cached && cached.modified === info.mtimeMs && cached.size === info.size) {
    return cached.rows;
  }
  let raw = await readFile(file, "utf8");
  if (raw.length > MAX_BYTES) {
    // Drop the first partial line of the cut.
    raw = raw.slice(raw.length - MAX_BYTES);
    raw = raw.slice(raw.indexOf("\n") + 1);
  }
  const rows = parseRows(raw);
  cache.set(file, { modified: info.mtimeMs, size: info.size, rows });
  return rows;
}

interface Resolved {
  status: "running" | "ended";
  /** How it ended, for an ended row. */
  reason: string;
  updatedAt: number;
  /** The next run of a cron job, while it runs. */
  next: number | null;
}

function resolve(row: Data, now: number): Resolved {
  const ended = (at: number, reason: string): Resolved => ({
    status: "ended",
    reason,
    updatedAt: at,
    next: null,
  });
  if (row.ending) {
    return ended(row.ending.at, row.ending.reason);
  }
  if (row.kind === "monitor") {
    if (row.expiry !== null && now >= row.started + row.expiry) {
      return ended(row.started + row.expiry, "expired");
    }
    const last = row.events.at(-1)?.at ?? row.started;
    return { status: "running", reason: "", updatedAt: last, next: null };
  }
  if (row.kind === "wakeup") {
    return now >= row.due
      ? ended(row.due, "fired")
      : { status: "running", reason: "", updatedAt: row.created, next: null };
  }
  if (row.recurring && now >= row.created + CRON_LIFETIME_MS) {
    return ended(row.created + CRON_LIFETIME_MS, "expired");
  }
  const after = row.recurring ? now : row.created;
  const run = nextCronRun(row.cron, new Date(after))?.getTime() ?? null;
  if (!row.recurring && run !== null && now >= run) {
    return ended(run, "fired");
  }
  return { status: "running", reason: "", updatedAt: row.created, next: run };
}

function wakeNote(row: WakeupData, now: number): string {
  const left = Math.ceil((row.due - now) / SECOND);
  if (left < 60) {
    return `wakes in ${left}s`;
  }
  return left < 3600
    ? `wakes in ${Math.ceil(left / 60)}m`
    : `wakes in ${Math.ceil(left / 3600)}h`;
}

function noteOf(row: Data, state: Resolved, now: number): string {
  if (state.status === "ended") {
    return state.reason;
  }
  if (row.kind === "monitor") {
    return `${row.events.length} ${row.events.length === 1 ? "event" : "events"}`;
  }
  if (row.kind === "wakeup") {
    return wakeNote(row, now);
  }
  return state.next === null ? "" : `next run ${formatNext(state.next, now)}`;
}

/** The monitors, cron jobs and wake-ups of a session, in the order they first appear. An ended one leaves the list after 15 minutes. */
export async function listBackground(
  folder: string,
  sessionId: string,
  now = Date.now(),
): Promise<BackgroundSummary[]> {
  if (!SAFE_ID.test(sessionId)) {
    return [];
  }
  try {
    const rows = await loadRows(
      join(projectDirectory(folder), `${sessionId}.jsonl`),
    );
    const list: BackgroundSummary[] = [];
    for (const row of rows) {
      const state = resolve(row, now);
      if (state.status === "ended" && now - state.updatedAt >= STALE_MS) {
        continue;
      }
      list.push({
        id: `${row.kind}:${row.id}`,
        kind: row.kind,
        title: row.title,
        status: state.status,
        updatedAt: state.updatedAt,
        note: noteOf(row, state, now),
      });
    }
    return list;
  } catch {
    return [];
  }
}

function statusLine(state: Resolved): string {
  return state.status === "running" ? "running" : `ended (${state.reason})`;
}

function monitorDetail(row: MonitorData, state: Resolved): string {
  const head = [
    `Monitor: ${row.title}`,
    `Status: ${statusLine(state)}`,
    row.source,
    `Started: ${formatTime(row.started)}`,
    `Expires: ${row.expiry === null ? "never" : formatTime(row.started + row.expiry)}`,
    `Events: ${row.events.length}`,
  ];
  let shown = row.events
    .slice(-MAX_EVENTS)
    .map(
      (event) =>
        `${formatTime(event.at)}  ${event.text.slice(0, MAX_EVENT_CHARS)}`,
    );
  const size = (items: string[]) =>
    items.reduce((sum, item) => sum + item.length + 1, 0);
  while (shown.length > 1 && size(shown) > MAX_DETAIL_CHARS) {
    shown = shown.slice(1);
  }
  const skipped = row.events.length - shown.length;
  return [
    ...head,
    "",
    ...(skipped > 0 ? [`(${skipped} earlier events not shown)`] : []),
    ...shown,
  ].join("\n");
}

function cronDetail(row: CronData, state: Resolved): string {
  return [
    `Cron: ${row.cron}`,
    `Prompt: ${row.prompt}`,
    `Type: ${row.recurring ? "recurring" : "one-shot"}`,
    `Created: ${formatTime(row.created)}`,
    `Status: ${statusLine(state)}`,
    ...(state.next === null ? [] : [`Next run: ${formatTime(state.next)}`]),
  ].join("\n");
}

function timeLeft(row: WakeupData, now: number): string {
  const left = Math.ceil((row.due - now) / SECOND);
  if (left < 60) {
    return `${left}s`;
  }
  return left < 3600
    ? `${Math.floor(left / 60)}m ${left % 60}s`
    : `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`;
}

function wakeupDetail(row: WakeupData, state: Resolved, now: number): string {
  return [
    `Wake-up: ${row.title}`,
    `Prompt: ${row.prompt === LOOP_SENTINEL ? "autonomous loop" : row.prompt}`,
    `Due: ${formatTime(row.due)}`,
    `Status: ${statusLine(state)}`,
    ...(state.status === "running" ? [`Time left: ${timeLeft(row, now)}`] : []),
  ].join("\n");
}

/** The detail text of one background task, or null when the session, the id or the task is unknown. An ended task answers for as long as the transcript holds it. */
export async function readBackgroundDetail(
  folder: string,
  sessionId: string,
  id: string,
  now = Date.now(),
): Promise<string | null> {
  const colon = id.indexOf(":");
  const kind = id.slice(0, colon);
  const part = id.slice(colon + 1);
  if (
    !SAFE_ID.test(sessionId) ||
    colon < 0 ||
    !KINDS.includes(kind) ||
    !SAFE_PART.test(part)
  ) {
    return null;
  }
  try {
    const rows = await loadRows(
      join(projectDirectory(folder), `${sessionId}.jsonl`),
    );
    const row = rows.find((item) => item.kind === kind && item.id === part);
    if (!row) {
      return null;
    }
    const state = resolve(row, now);
    if (row.kind === "monitor") {
      return monitorDetail(row, state);
    }
    return row.kind === "cron"
      ? cronDetail(row, state)
      : wakeupDetail(row, state, now);
  } catch {
    return null;
  }
}

const FIELD_RANGES: readonly [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** The values that one cron field allows, or null when the field is invalid. */
function parseField(field: string, [min, max]: [number, number]) {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const match = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!match || (match[1] === undefined && part.includes("-"))) {
      return null;
    }
    const step = match[3] === undefined ? 1 : Number(match[3]);
    const low = match[1] === undefined ? min : Number(match[1]);
    const high =
      match[1] === undefined
        ? max
        : match[2] === undefined
          ? match[3] === undefined
            ? low
            : max
          : Number(match[2]);
    if (step < 1 || low < min || high > max || low > high) {
      return null;
    }
    for (let value = low; value <= high; value += step) {
      values.add(value);
    }
  }
  return values;
}

/** The first time after `after` that a 5-field cron expression fires, in local time, or null when the expression is invalid or nothing fires within 366 days. */
export function nextCronRun(expression: string, after: Date): Date | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  const sets = fields.map((field, index) =>
    parseField(field, FIELD_RANGES[index] as [number, number]),
  );
  const [minutes, hours, days, months, weekdays] = sets;
  if (!minutes || !hours || !days || !months || !weekdays) {
    return null;
  }
  if (weekdays.has(7)) {
    weekdays.add(0);
  }
  const bothRestricted =
    !fields[2]?.startsWith("*") && !fields[4]?.startsWith("*");
  const start = Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE;
  const limit = after.getTime() + 366 * DAY;
  const first = new Date(start);
  const hourList = [...hours].sort((a, b) => a - b);
  const minuteList = [...minutes].sort((a, b) => a - b);
  for (let offset = 0; offset <= 367; offset++) {
    const day = new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() + offset,
    );
    const dayMatch = days.has(day.getDate());
    const weekdayMatch = weekdays.has(day.getDay());
    if (
      !months.has(day.getMonth() + 1) ||
      !(bothRestricted ? dayMatch || weekdayMatch : dayMatch && weekdayMatch)
    ) {
      continue;
    }
    for (const hour of hourList) {
      for (const minute of minuteList) {
        const run = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hour,
          minute,
        );
        if (run.getHours() !== hour || run.getTime() < start) {
          continue;
        }
        return run.getTime() <= limit ? run : null;
      }
    }
  }
  return null;
}
