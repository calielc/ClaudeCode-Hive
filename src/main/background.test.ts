import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  listBackground,
  nextCronRun,
  readBackgroundDetail,
} from "./background.ts";
import { projectDirectory } from "./paths.ts";

// The expected times below are written in UTC, so the whole file runs in UTC.
process.env.TZ = "UTC";

const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION = "33333333-3333-4333-8333-333333333333";
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A Tuesday. */
const BASE = Date.parse("2026-11-24T10:00:00.000Z");
const line = (value: object): string => `${JSON.stringify(value)}\n`;
const iso = (epoch: number): string => new Date(epoch).toISOString();

interface Context {
  folder: string;
  transcript: string;
}

function setup(): Context {
  const root = mkdtempSync(join(tmpdir(), "hive-background-"));
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  const folder = join(root, "work");
  const directory = projectDirectory(folder);
  mkdirSync(directory, { recursive: true });
  return { folder, transcript: join(directory, `${SESSION}.jsonl`) };
}

function toolUse(at: number, id: string, name: string, input: object): string {
  return line({
    type: "assistant",
    timestamp: iso(at),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
    },
  });
}

function toolResult(
  at: number,
  id: string,
  content: string | string[],
  isError?: boolean,
): string {
  return line({
    type: "user",
    timestamp: iso(at),
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content:
            typeof content === "string"
              ? content
              : content.map((text) => ({ type: "text", text })),
          ...(isError ? { is_error: true } : {}),
        },
      ],
    },
  });
}

const EXPIRY_NOTE =
  "You will be notified on each event. Keep working — do not poll or sleep. Events may arrive while you are waiting for the user — an event is not their reply.";

/** The start of a monitor: the call and its result. `expires` is the text after "expires in", or null for a persistent monitor. */
function monitorStart(
  at: number,
  task: string,
  input: {
    description: string;
    command?: string;
    ws?: string;
    persistent?: boolean;
  },
  expires: string | null = "10m",
  toolId = `toolu_m_${task}`,
): string {
  const where =
    expires === null
      ? "runs until the source ends"
      : `expires in ${expires} unless the source ends first; you get one notice at expiry — re-arm if you still need the watch`;
  return (
    toolUse(at, toolId, "Monitor", input) +
    toolResult(
      at + 500,
      toolId,
      `Monitor started (task ${task}, ${where}). ${EXPIRY_NOTE}`,
    )
  );
}

function notification(
  at: number,
  task: string,
  event: string,
  status?: string,
): string {
  return line({
    type: "user",
    timestamp: iso(at),
    message: {
      role: "user",
      content: `<task-notification>\n<task-id>${task}</task-id>\n${
        status === undefined ? "" : `<status>${status}</status>\n`
      }<summary>Monitor event: "x"</summary>\n<event>${event}</event>\nIf this event is something the user would act on now, send a PushNotification.\n</task-notification>`,
    },
  });
}

function queueEcho(at: number, task: string, event: string): string {
  return line({
    type: "queue-operation",
    operation: "enqueue",
    timestamp: iso(at),
    content: `<task-notification>\n<task-id>${task}</task-id>\n<summary>Monitor event: "x"</summary>\n<event>${event}</event>\n</task-notification>`,
  });
}

function cronCreate(
  at: number,
  job: string,
  input: { cron: string; prompt: string; recurring: boolean },
): string {
  const id = `toolu_c_${job}`;
  const text = input.recurring
    ? `Scheduled recurring job ${job} (${input.cron}). Next run: Nov 24 10:01am. Session-only (not written to disk, dies when Claude exits). Auto-expires after 7 days. Use CronDelete to cancel sooner.`
    : `Scheduled one-shot task ${job} (${input.cron}). Next run: Nov 24 2:29pm. Session-only (not written to disk, dies when Claude exits). It will fire once then auto-delete.`;
  return toolUse(at, id, "CronCreate", input) + toolResult(at + 100, id, text);
}

function cronDelete(at: number, job: string, error = false): string {
  const id = `toolu_d_${job}_${at}`;
  return (
    toolUse(at, id, "CronDelete", { id: job }) +
    toolResult(
      at + 100,
      id,
      error ? `No scheduled job with id ${job}` : `Cancelled job ${job}.`,
      error,
    )
  );
}

function wakeup(
  at: number,
  toolId: string,
  seconds: number,
  extra: { reason?: string; prompt?: string } = {},
): string {
  return (
    toolUse(at, toolId, "ScheduleWakeup", {
      delaySeconds: seconds,
      reason: extra.reason ?? "Waiting on 3 more agents",
      prompt: extra.prompt ?? "<<autonomous-loop-dynamic>>",
    }) +
    toolResult(
      at + 100,
      toolId,
      `Next wakeup scheduled for 11:49:00 (in ${seconds}s). If you owe the user a reply, send it now.`,
    )
  );
}

function stopLoop(at: number, toolId: string): string {
  return (
    toolUse(at, toolId, "ScheduleWakeup", { stop: true }) +
    toolResult(at + 100, toolId, "Loop stopped. No further wakeups.")
  );
}

function put(context: Context, ...parts: string[]): void {
  writeFileSync(context.transcript, parts.join(""));
}

// ---------------------------------------------------------------- monitors

test("a started monitor is a running row with its description, zero events and the start time", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "b094clax3", {
      command: "tail -f app.log",
      description: "Grafana check timers",
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + MINUTE);

  // Assert
  assert.deepEqual(list, [
    {
      id: "monitor:b094clax3",
      kind: "monitor",
      title: "Grafana check timers",
      status: "running",
      updatedAt: BASE + 500,
      note: "0 events",
    },
  ]);
});

test("every event notification counts once, the queue-operation copy is ignored and updatedAt is the last event", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "m1", { command: "watch x", description: "Watch x" }),
    notification(BASE + 1 * MINUTE, "m1", "first (14:26)"),
    queueEcho(BASE + 1 * MINUTE, "m1", "first (14:26)"),
    notification(BASE + 2 * MINUTE, "m1", "second"),
    queueEcho(BASE + 2 * MINUTE, "m1", "second"),
    notification(BASE + 3 * MINUTE, "m1", "third"),
    notification(BASE + 4 * MINUTE, "other", "not mine"),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 5 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.note, item.updatedAt]),
    [["monitor:m1", "3 events", BASE + 3 * MINUTE]],
  );
});

test("one event reads as 1 event", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "m1", { command: "c", description: "D" }),
    notification(BASE + MINUTE, "m1", "only"),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 2 * MINUTE);

  // Assert
  assert.equal(list[0]?.note, "1 event");
});

test("the expiry notice ends the monitor as expired and is not an event", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "m1", { command: "c", description: "D" }),
    notification(BASE + 2 * MINUTE, "m1", "tick"),
    notification(
      BASE + 4 * MINUTE,
      "m1",
      "[Monitor expired after 10m with 1 events delivered. Re-arm it if you still need the watch.]",
    ),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 5 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "expired", BASE + 4 * MINUTE]],
  );
  const detail = await readBackgroundDetail(
    context.folder,
    SESSION,
    "monitor:m1",
    BASE + 5 * MINUTE,
  );
  assert.match(detail ?? "", /^Events: 1$/m);
});

test("a notice that starts with [Monitor and says ended or stopped ends the monitor as stopped", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "e1", { command: "c", description: "Ended one" }),
    monitorStart(BASE, "e2", { command: "c", description: "Stopped one" }),
    notification(
      BASE + MINUTE,
      "e1",
      "[Monitor ended: the source exited with 0]",
    ),
    notification(BASE + 2 * MINUTE, "e2", "[Monitor stopped by the user]"),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 3 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.status, item.note, item.updatedAt]),
    [
      ["monitor:e1", "ended", "stopped", BASE + MINUTE],
      ["monitor:e2", "ended", "stopped", BASE + 2 * MINUTE],
    ],
  );
});

test("a notification with a terminal status tag ends the monitor as stopped", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "s1", { command: "c", description: "D" }),
    notification(BASE + 90 * SECOND, "s1", "done", "completed"),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 2 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "stopped", BASE + 90 * SECOND]],
  );
});

test("TaskStop with a good result stops the monitor, with an error result it does not", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "k1", { command: "c", description: "Stopped" }),
    monitorStart(BASE, "k2", { command: "c", description: "Stop failed" }),
    toolUse(BASE + MINUTE, "toolu_stop1", "TaskStop", { task_id: "k1" }),
    toolResult(BASE + MINUTE + 200, "toolu_stop1", "Task k1 stopped."),
    toolUse(BASE + 2 * MINUTE, "toolu_stop2", "TaskStop", { task_id: "k2" }),
    toolResult(BASE + 2 * MINUTE + 200, "toolu_stop2", "No task found", true),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 3 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.status, item.note, item.updatedAt]),
    [
      ["monitor:k1", "ended", "stopped", BASE + MINUTE + 200],
      ["monitor:k2", "running", "0 events", BASE + 500],
    ],
  );
});

test("a monitor with an expiry ends by the clock at exactly start plus expiry, even without a notice", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "x1", { command: "c", description: "D" }, "10m"),
  );
  const start = BASE + 500;

  // Act
  const before = await listBackground(
    context.folder,
    SESSION,
    start + 10 * MINUTE - 1,
  );
  const exact = await listBackground(
    context.folder,
    SESSION,
    start + 10 * MINUTE,
  );

  // Assert
  assert.deepEqual(
    before.map((item) => [item.status, item.note]),
    [["running", "0 events"]],
  );
  assert.deepEqual(
    exact.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "expired", start + 10 * MINUTE]],
  );
});

test("the expiry is read in minutes and in hours", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "h1", { command: "c", description: "Hours" }, "2h"),
    monitorStart(BASE, "n1", { command: "c", description: "Minutes" }, "45m"),
  );
  const start = BASE + 500;

  // Act
  const list = await listBackground(
    context.folder,
    SESSION,
    start + 45 * MINUTE,
  );

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.status]),
    [
      ["monitor:h1", "running"],
      ["monitor:n1", "ended"],
    ],
  );
});

test("a persistent monitor has no expiry and keeps running", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(
      BASE,
      "p1",
      { ws: "wss://example.test/feed", description: "Feed", persistent: true },
      null,
    ),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 30 * DAY);
  const detail = await readBackgroundDetail(
    context.folder,
    SESSION,
    "monitor:p1",
    BASE + 30 * DAY,
  );

  // Assert
  assert.deepEqual(
    list.map((item) => [item.status, item.note]),
    [["running", "0 events"]],
  );
  assert.match(detail ?? "", /^Expires: never$/m);
  assert.match(detail ?? "", /^Watch: wss:\/\/example\.test\/feed$/m);
});

test("a failed monitor start is not a task, and neither is a start without a result", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    toolUse(BASE, "toolu_bad", "Monitor", {
      command: "nope",
      description: "Bad",
    }),
    toolResult(
      BASE + 100,
      "toolu_bad",
      "<tool_use_error>Command not allowed</tool_use_error>",
      true,
    ),
    toolUse(BASE + MINUTE, "toolu_pending", "Monitor", {
      command: "c",
      description: "Pending",
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 2 * MINUTE);

  // Assert
  assert.deepEqual(list, []);
});

test("a result whose content is an array of text blocks is read like a string", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    toolUse(BASE, "toolu_arr", "Monitor", {
      command: "c",
      description: "Array result",
    }),
    toolResult(BASE + 100, "toolu_arr", [
      "Monitor started (task arr1, expires in 10m unless the source ends first).",
      EXPIRY_NOTE,
    ]),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.title]),
    [["monitor:arr1", "Array result"]],
  );
});

test("the monitor detail lists description, command, times, expiry, the count and the events, newest last", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(
      BASE,
      "d1",
      { command: "tail -f app.log", description: "Grafana check timers" },
      "10m",
    ),
    notification(BASE + 3 * MINUTE, "d1", "grafana check due (14:26)"),
    notification(
      BASE + 6 * MINUTE + 30 * SECOND,
      "d1",
      "grafana check due (14:29)",
    ),
  );

  // Act
  const detail =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "monitor:d1",
      BASE + 7 * MINUTE,
    )) ?? "";

  // Assert
  assert.match(detail, /^Monitor: Grafana check timers$/m);
  assert.match(detail, /^Status: running$/m);
  assert.match(detail, /^Command: tail -f app\.log$/m);
  assert.match(detail, /^Started: 2026-11-24 10:00:00$/m);
  assert.match(detail, /^Expires: 2026-11-24 10:10:00$/m);
  assert.match(detail, /^Events: 2$/m);
  const first = detail.indexOf(
    "2026-11-24 10:03:00  grafana check due (14:26)",
  );
  const second = detail.indexOf(
    "2026-11-24 10:06:30  grafana check due (14:29)",
  );
  assert.ok(first > 0 && second > first, detail);
});

test("an ended monitor detail names how it ended", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "d2", { command: "c", description: "D" }),
    notification(
      BASE + MINUTE,
      "d2",
      "[Monitor expired after 10m with 0 events delivered.]",
    ),
  );

  // Act
  const detail = await readBackgroundDetail(
    context.folder,
    SESSION,
    "monitor:d2",
    BASE + 2 * MINUTE,
  );

  // Assert
  assert.match(detail ?? "", /^Status: ended \(expired\)$/m);
});

test("the monitor detail shows the last 200 events, says how many were left out and cuts a long event at 500 characters", async () => {
  // Arrange
  const context = setup();
  const events = Array.from({ length: 250 }, (_, index) =>
    notification(
      BASE + (index + 1) * SECOND,
      "big",
      `event number ${index + 1} ${index === 249 ? "x".repeat(3000) : ""}`,
    ),
  );
  put(
    context,
    monitorStart(BASE, "big", { command: "c", description: "Busy" }, null),
    ...events,
  );

  // Act
  const detail =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "monitor:big",
      BASE + HOUR,
    )) ?? "";

  // Assert
  assert.match(detail, /^Events: 250$/m);
  assert.match(detail, /\(50 earlier events not shown\)/);
  assert.ok(!detail.includes("event number 50 "));
  assert.ok(detail.includes("event number 51 "));
  assert.ok(detail.includes("event number 250 "));
  assert.ok(!/x{501}/.test(detail));
  assert.ok(detail.length < 64 * 1024, `detail is ${detail.length} characters`);
});

// -------------------------------------------------------------------- cron

test("a recurring job is a running cron row titled with its prompt and a note with the next run", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "25f91794", {
      cron: "1,6,11 9-18 * * 1-5",
      prompt: "/nudge-mr-reviews",
      recurring: true,
    }),
  );

  // Act
  const list = await listBackground(
    context.folder,
    SESSION,
    BASE + 30 * SECOND,
  );

  // Assert
  assert.deepEqual(list, [
    {
      id: "cron:25f91794",
      kind: "cron",
      title: "/nudge-mr-reviews",
      status: "running",
      updatedAt: BASE + 100,
      note: "next run 10:01",
    },
  ]);
});

test("the next run of a recurring job moves with the clock, and a run on another day names the date", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "r1", {
      cron: "0 9 * * *",
      prompt: "daily",
      recurring: true,
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE);

  // Assert
  assert.equal(list[0]?.note, "next run Nov 25 09:00");
});

test("the title is the cron expression when the prompt is empty", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "e1", {
      cron: "*/10 * * * *",
      prompt: "",
      recurring: true,
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE);

  // Assert
  assert.equal(list[0]?.title, "*/10 * * * *");
});

test("a one-shot task is running until its run time and fired from exactly that time", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "o1", {
      cron: "30 14 24 11 *",
      prompt: "remind me",
      recurring: false,
    }),
  );
  const run = Date.parse("2026-11-24T14:30:00.000Z");

  // Act
  const before = await listBackground(context.folder, SESSION, run - 1);
  const exact = await listBackground(context.folder, SESSION, run);

  // Assert
  assert.deepEqual(
    before.map((item) => [item.status, item.note]),
    [["running", "next run 14:30"]],
  );
  assert.deepEqual(
    exact.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "fired", run]],
  );
});

test("a one-shot task whose run time is already past when listed is fired", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "o2", {
      cron: "5 10 24 11 *",
      prompt: "p",
      recurring: false,
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 6 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.status, item.note]),
    [["ended", "fired"]],
  );
});

test("CronDelete cancels a job, with the time of its result, and an error result does not", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "c1", {
      cron: "*/5 * * * *",
      prompt: "gone",
      recurring: true,
    }),
    cronCreate(BASE, "c2", {
      cron: "*/5 * * * *",
      prompt: "stays",
      recurring: true,
    }),
    cronDelete(BASE + MINUTE, "c1"),
    cronDelete(BASE + 2 * MINUTE, "c2", true),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 3 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.status, item.note, item.updatedAt]),
    [
      ["cron:c1", "ended", "cancelled", BASE + MINUTE + 100],
      ["cron:c2", "running", "next run 10:05", BASE + 100],
    ],
  );
});

test("a recurring job expires 7 days after its creation, exactly at 7 times 24 hours", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "w1", {
      cron: "0 12 * * *",
      prompt: "weekly",
      recurring: true,
    }),
  );
  const created = BASE + 100;

  // Act
  const before = await listBackground(
    context.folder,
    SESSION,
    created + 7 * DAY - 1,
  );
  const exact = await listBackground(
    context.folder,
    SESSION,
    created + 7 * DAY,
  );

  // Assert
  assert.equal(before[0]?.status, "running");
  assert.deepEqual(
    exact.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "expired", created + 7 * DAY]],
  );
});

test("a result that is an error is not a job", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    toolUse(BASE, "toolu_bad", "CronCreate", {
      cron: "bad",
      prompt: "p",
      recurring: true,
    }),
    toolResult(BASE + 100, "toolu_bad", "Invalid cron expression", true),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + MINUTE);

  // Assert
  assert.deepEqual(list, []);
});

test("the cron detail has the expression, prompt, type, created time and the next run", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "25f91794", {
      cron: "1,6,11 9-18 * * 1-5",
      prompt: "/nudge-mr-reviews",
      recurring: true,
    }),
  );

  // Act
  const detail =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "cron:25f91794",
      BASE + 30 * SECOND,
    )) ?? "";

  // Assert
  assert.match(detail, /^Cron: 1,6,11 9-18 \* \* 1-5$/m);
  assert.match(detail, /^Prompt: \/nudge-mr-reviews$/m);
  assert.match(detail, /^Type: recurring$/m);
  assert.match(detail, /^Created: 2026-11-24 10:00:00$/m);
  assert.match(detail, /^Status: running$/m);
  assert.match(detail, /^Next run: 2026-11-24 10:01:00$/m);
});

test("the detail of a one-shot task says one-shot, and an ended job has its end and no next run", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "o1", {
      cron: "30 14 24 11 *",
      prompt: "remind me",
      recurring: false,
    }),
    cronCreate(BASE, "c1", {
      cron: "*/5 * * * *",
      prompt: "gone",
      recurring: true,
    }),
    cronDelete(BASE + MINUTE, "c1"),
  );

  // Act
  const oneShot =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "cron:o1",
      BASE + MINUTE,
    )) ?? "";
  const cancelled =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "cron:c1",
      BASE + 2 * MINUTE,
    )) ?? "";

  // Assert
  assert.match(oneShot, /^Type: one-shot$/m);
  assert.match(oneShot, /^Next run: 2026-11-24 14:30:00$/m);
  assert.match(cancelled, /^Status: ended \(cancelled\)$/m);
  assert.doesNotMatch(cancelled, /^Next run:/m);
});

// ----------------------------------------------------------------- wake-ups

test("a pending wake-up is a running row titled with its reason, due at the result time plus the seconds in (in 114s)", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_w1", 114));

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 100);

  // Assert
  assert.deepEqual(list, [
    {
      id: "wakeup:toolu_w1",
      kind: "wakeup",
      title: "Waiting on 3 more agents",
      status: "running",
      updatedAt: BASE + 100,
      note: "wakes in 2m",
    },
  ]);
});

test("the wake-up note counts down in seconds, minutes and hours", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_w1", 7200));
  const created = BASE + 100;
  const due = created + 7200 * SECOND;

  // Act
  const notes: (string | undefined)[] = [];
  for (const left of [
    7200 * SECOND,
    121 * SECOND,
    120 * SECOND,
    114 * SECOND,
    45 * SECOND,
    1 * SECOND,
  ]) {
    notes.push(
      (await listBackground(context.folder, SESSION, due - left))[0]?.note,
    );
  }

  // Assert
  assert.deepEqual(notes, [
    "wakes in 2h",
    "wakes in 3m",
    "wakes in 2m",
    "wakes in 2m",
    "wakes in 45s",
    "wakes in 1s",
  ]);
});

test("a wake-up is fired from exactly its due time", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_w1", 114));
  const due = BASE + 100 + 114 * SECOND;

  // Act
  const before = await listBackground(context.folder, SESSION, due - 1);
  const exact = await listBackground(context.folder, SESSION, due);

  // Assert
  assert.equal(before[0]?.status, "running");
  assert.deepEqual(
    exact.map((item) => [item.status, item.note, item.updatedAt]),
    [["ended", "fired", due]],
  );
});

test("a later wake-up replaces the pending one, so only the last one has a row", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    wakeup(BASE, "toolu_w1", 300, { reason: "First" }),
    wakeup(BASE + MINUTE, "toolu_w2", 120, { reason: "Second" }),
  );

  // Act
  const list = await listBackground(
    context.folder,
    SESSION,
    BASE + 90 * SECOND,
  );

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.title, item.note]),
    [["wakeup:toolu_w2", "Second", "wakes in 2m"]], // due at BASE + 60 s + 120 s, so 90 s are left at the check: rounded up it is 2 minutes
  );
});

test("a stop input, with its result starting Loop stopped, cancels the pending wake-up", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    wakeup(BASE, "toolu_w1", 600),
    stopLoop(BASE + MINUTE, "toolu_w2"),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 2 * MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.status, item.note, item.updatedAt]),
    [["wakeup:toolu_w1", "ended", "cancelled", BASE + MINUTE + 100]],
  );
});

test("a stop without a pending wake-up gives no row, and a wake-up after a stop is pending again", async () => {
  // Arrange
  const context = setup();
  put(context, stopLoop(BASE, "toolu_s0"));
  const alone = await listBackground(context.folder, SESSION, BASE + MINUTE);
  put(
    context,
    stopLoop(BASE, "toolu_s0"),
    wakeup(BASE + MINUTE, "toolu_w9", 300, { reason: "Again" }),
  );

  // Act
  const again = await listBackground(
    context.folder,
    SESSION,
    BASE + 2 * MINUTE,
  );

  // Assert
  assert.deepEqual(alone, []);
  assert.deepEqual(
    again.map((item) => [item.id, item.status]),
    [["wakeup:toolu_w9", "running"]],
  );
});

test("a wake-up call without a scheduled result gives no row", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    toolUse(BASE, "toolu_n1", "ScheduleWakeup", {
      delaySeconds: 60,
      reason: "r",
      prompt: "p",
      noop: true,
    }),
    toolResult(BASE + 100, "toolu_n1", "Nothing scheduled.", true),
  );

  // Act
  const list = await listBackground(
    context.folder,
    SESSION,
    BASE + 10 * SECOND,
  );

  // Assert
  assert.deepEqual(list, []);
});

test("the wake-up detail has reason, prompt, due time and the time left, and hides the loop sentinel", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    wakeup(BASE, "toolu_w1", 114),
    wakeup(BASE + 10 * MINUTE, "toolu_w2", 60, {
      reason: "Check the build",
      prompt: "/babysit-prs",
    }),
  );

  // Act
  const loop =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "wakeup:toolu_w2",
      BASE + 10 * MINUTE + 100,
    )) ?? "";
  const sentinel = await (async () => {
    const other = setup();
    put(other, wakeup(BASE, "toolu_w1", 114));
    return (
      (await readBackgroundDetail(
        other.folder,
        SESSION,
        "wakeup:toolu_w1",
        BASE + 100,
      )) ?? ""
    );
  })();

  // Assert
  assert.match(loop, /^Wake-up: Check the build$/m);
  assert.match(loop, /^Prompt: \/babysit-prs$/m);
  assert.match(loop, /^Due: 2026-11-24 10:11:00$/m);
  assert.match(loop, /^Time left: 1m 0s$/m);
  assert.match(sentinel, /^Prompt: autonomous loop$/m);
  assert.match(sentinel, /^Time left: 1m 54s$/m);
  assert.ok(!sentinel.includes("<<autonomous-loop-dynamic>>"));
});

test("a fired wake-up detail says fired and has no time left", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_w1", 60));

  // Act
  const detail =
    (await readBackgroundDetail(
      context.folder,
      SESSION,
      "wakeup:toolu_w1",
      BASE + HOUR,
    )) ?? "";

  // Assert
  assert.match(detail, /^Status: ended \(fired\)$/m);
  assert.doesNotMatch(detail, /^Time left:/m);
});

// ------------------------------------------------------- list wide behavior

test("rows of every kind come in order of first appearance, with ids that cannot clash", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "same1", { command: "c", description: "Monitor" }, null),
    cronCreate(BASE + SECOND, "same1", {
      cron: "*/5 * * * *",
      prompt: "Cron",
      recurring: true,
    }),
    wakeup(BASE + 2 * SECOND, "same1", 600, { reason: "Wakeup" }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + 3 * SECOND);

  // Assert
  assert.deepEqual(
    list.map((item) => [item.id, item.kind, item.title]),
    [
      ["monitor:same1", "monitor", "Monitor"],
      ["cron:same1", "cron", "Cron"],
      ["wakeup:same1", "wakeup", "Wakeup"],
    ],
  );
});

test("an ended row stays listed for 15 minutes after it ended and a running row stays as long as it runs", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    cronCreate(BASE, "end", {
      cron: "*/5 * * * *",
      prompt: "ended",
      recurring: true,
    }),
    cronCreate(BASE, "run", {
      cron: "*/5 * * * *",
      prompt: "running",
      recurring: true,
    }),
    cronDelete(BASE + MINUTE, "end"),
  );
  const ended = BASE + MINUTE + 100;

  // Act
  const justUnder = await listBackground(
    context.folder,
    SESSION,
    ended + 15 * MINUTE - 1,
  );
  const exact = await listBackground(
    context.folder,
    SESSION,
    ended + 15 * MINUTE,
  );
  const over = await listBackground(
    context.folder,
    SESSION,
    ended + 15 * MINUTE + 1,
  );
  const detail = await readBackgroundDetail(
    context.folder,
    SESSION,
    "cron:end",
    ended + 2 * HOUR,
  );

  // Assert
  assert.deepEqual(
    justUnder.map((item) => item.id),
    ["cron:end", "cron:run"],
  );
  assert.deepEqual(
    exact.map((item) => item.id),
    ["cron:run"],
  );
  assert.deepEqual(
    over.map((item) => item.id),
    ["cron:run"],
  );
  assert.match(detail ?? "", /^Status: ended \(cancelled\)$/m);
});

test("malformed lines, blank lines and unrelated entries are skipped", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    "{not json\n\n",
    line({ type: "assistant", message: { content: "plain string" } }),
    line({
      type: "user",
      message: { content: [{ type: "tool_result" }, null, 7] },
    }),
    line({
      type: "assistant",
      timestamp: iso(BASE),
      message: { content: [{ type: "tool_use", name: "Monitor" }] },
    }),
    monitorStart(BASE, "ok1", { command: "c", description: "Survivor" }),
    '{"type":"user","message":{"content":"<task-notification>truncated',
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + MINUTE);

  // Assert
  assert.deepEqual(
    list.map((item) => item.id),
    ["monitor:ok1"],
  );
});

test("a missing transcript, an unsafe session id and an unsafe row id give nothing and never throw", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "../x", { command: "c", description: "Bad id" }),
    monitorStart(BASE, "a b", { command: "c", description: "Space" }),
    cronCreate(BASE, "ok-7", {
      cron: "*/5 * * * *",
      prompt: "Fine",
      recurring: true,
    }),
  );

  // Act
  const list = await listBackground(context.folder, SESSION, BASE + MINUTE);
  const missing = await listBackground(context.folder, OTHER_SESSION, BASE);
  const unsafeSession = await listBackground(context.folder, "../etc", BASE);
  const unsafeSessionDetail = await readBackgroundDetail(
    context.folder,
    "../etc",
    "cron:ok-7",
    BASE,
  );
  const unsafeId = await readBackgroundDetail(
    context.folder,
    SESSION,
    "monitor:../x",
    BASE,
  );
  const unknownKind = await readBackgroundDetail(
    context.folder,
    SESSION,
    "shell:ok-7",
    BASE,
  );
  const noPrefix = await readBackgroundDetail(
    context.folder,
    SESSION,
    "ok-7",
    BASE,
  );
  const unknownId = await readBackgroundDetail(
    context.folder,
    SESSION,
    "cron:nope",
    BASE,
  );
  const missingDetail = await readBackgroundDetail(
    context.folder,
    OTHER_SESSION,
    "cron:ok-7",
    BASE,
  );

  // Assert
  assert.deepEqual(
    list.map((item) => item.id),
    ["cron:ok-7"],
  );
  assert.deepEqual(missing, []);
  assert.deepEqual(unsafeSession, []);
  for (const detail of [
    unsafeSessionDetail,
    unsafeId,
    unknownKind,
    noPrefix,
    unknownId,
    missingDetail,
  ]) {
    assert.equal(detail, null);
  }
});

test("a tool call id with an underscore, as real ids have, is a valid wake-up id", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_01AbC9", 60));

  // Act
  const detail = await readBackgroundDetail(
    context.folder,
    SESSION,
    "wakeup:toolu_01AbC9",
    BASE + SECOND,
  );

  // Assert
  assert.match(detail ?? "", /^Wake-up: Waiting on 3 more agents$/m);
});

test("a changed transcript gives fresh data, the same unchanged one is served from the cache", async () => {
  // Arrange
  const context = setup();
  put(
    context,
    monitorStart(BASE, "c1", { command: "c", description: "Cached" }, null),
  );
  const first = await listBackground(context.folder, SESSION, BASE + MINUTE);

  // Act
  writeFileSync(
    context.transcript,
    monitorStart(BASE, "c1", { command: "c", description: "Cached" }, null) +
      notification(BASE + MINUTE, "c1", "new event") +
      cronCreate(BASE + 2 * MINUTE, "c9", {
        cron: "*/5 * * * *",
        prompt: "Added",
        recurring: true,
      }),
  );
  const later = new Date(Date.now() + 5000);
  utimesSync(context.transcript, later, later);
  const second = await listBackground(
    context.folder,
    SESSION,
    BASE + 3 * MINUTE,
  );
  const third = await listBackground(
    context.folder,
    SESSION,
    BASE + 3 * MINUTE,
  );

  // Assert
  assert.deepEqual(
    first.map((item) => item.note),
    ["0 events"],
  );
  assert.deepEqual(
    second.map((item) => [item.id, item.note]),
    [
      ["monitor:c1", "1 event"],
      ["cron:c9", "next run 10:05"],
    ],
  );
  assert.deepEqual(third, second);
});

test("the clock is applied on every call even when the transcript is cached", async () => {
  // Arrange
  const context = setup();
  put(context, wakeup(BASE, "toolu_w1", 60));

  // Act
  const early = await listBackground(context.folder, SESSION, BASE + SECOND);
  const late = await listBackground(context.folder, SESSION, BASE + 2 * MINUTE);

  // Assert
  assert.equal(early[0]?.status, "running");
  assert.equal(late[0]?.status, "ended");
});

// ------------------------------------------------------------- nextCronRun

const when = (text: string): Date => new Date(text);
const next = (expression: string, after: string): string | null =>
  nextCronRun(expression, when(after))?.toISOString() ?? null;

test("nextCronRun steps over a star with a step", () => {
  assert.equal(
    next("*/15 * * * *", "2026-11-24T10:07:30.000Z"),
    "2026-11-24T10:15:00.000Z",
  );
  assert.equal(
    next("*/15 * * * *", "2026-11-24T10:46:00.000Z"),
    "2026-11-24T11:00:00.000Z",
  );
  assert.equal(
    next("*/7 * * * *", "2026-11-24T10:22:00.000Z"),
    "2026-11-24T10:28:00.000Z",
  );
});

test("nextCronRun never returns a run at exactly after, and returns the one a millisecond later", () => {
  assert.equal(
    next("*/15 * * * *", "2026-11-24T10:14:59.999Z"),
    "2026-11-24T10:15:00.000Z",
  );
  assert.equal(
    next("*/15 * * * *", "2026-11-24T10:15:00.000Z"),
    "2026-11-24T10:30:00.000Z",
  );
  assert.equal(
    next("*/15 * * * *", "2026-11-24T10:15:00.001Z"),
    "2026-11-24T10:30:00.000Z",
  );
  assert.equal(
    next("0 9 * * *", "2026-11-24T09:00:00.000Z"),
    "2026-11-25T09:00:00.000Z",
  );
});

test("nextCronRun returns a Date with zero seconds and milliseconds", () => {
  const result = nextCronRun("* * * * *", when("2026-11-24T10:07:31.250Z"));
  assert.equal(result?.toISOString(), "2026-11-24T10:08:00.000Z");
});

test("nextCronRun reads lists, ranges and ranges with steps", () => {
  assert.equal(
    next("1,6,11 9-18 * * 1-5", "2026-11-24T10:07:00.000Z"),
    "2026-11-24T10:11:00.000Z",
  );
  assert.equal(
    next("0 9-17/2 * * *", "2026-11-24T10:00:00.000Z"),
    "2026-11-24T11:00:00.000Z",
  );
  assert.equal(
    next("0 9-17/2 * * *", "2026-11-24T17:00:00.000Z"),
    "2026-11-25T09:00:00.000Z",
  );
  assert.equal(
    next("10-40/10 * * * *", "2026-11-24T10:25:00.000Z"),
    "2026-11-24T10:30:00.000Z",
  );
  assert.equal(
    next("10-40/10 * * * *", "2026-11-24T10:40:00.000Z"),
    "2026-11-24T11:10:00.000Z",
  );
  assert.equal(
    next("0,30 */6 * * *", "2026-11-24T18:30:00.000Z"),
    "2026-11-25T00:00:00.000Z",
  );
  assert.equal(
    next("0,30 */6 * * *", "2026-11-24T12:00:00.000Z"),
    "2026-11-24T12:30:00.000Z",
  );
});

test("nextCronRun skips the weekend for 1-5 in the day of week and crosses it on a Friday evening", () => {
  assert.equal(
    next("1,6,11 9-18 * * 1-5", "2026-11-24T18:11:00.000Z"),
    "2026-11-25T09:01:00.000Z",
  );
  assert.equal(
    next("1,6,11 9-18 * * 1-5", "2026-11-27T18:30:00.000Z"),
    "2026-11-30T09:01:00.000Z",
  );
});

test("nextCronRun rolls over the month and the year", () => {
  assert.equal(
    next("30 8 1 * *", "2026-11-24T10:00:00.000Z"),
    "2026-12-01T08:30:00.000Z",
  );
  assert.equal(
    next("0 12 31 * *", "2026-11-24T10:00:00.000Z"),
    "2026-12-31T12:00:00.000Z",
  );
  assert.equal(
    next("0 0 1 1 *", "2026-11-24T10:00:00.000Z"),
    "2027-01-01T00:00:00.000Z",
  );
  assert.equal(
    next("59 23 31 12 *", "2026-12-31T23:59:00.000Z"),
    "2027-12-31T23:59:00.000Z",
  );
  assert.equal(
    next("* * * * *", "2026-12-31T23:59:30.000Z"),
    "2027-01-01T00:00:00.000Z",
  );
});

test("nextCronRun finds 29 February in a leap year and gives null when it is more than 366 days away", () => {
  assert.equal(
    next("0 0 29 2 *", "2027-12-01T00:00:00.000Z"),
    "2028-02-29T00:00:00.000Z",
  );
  assert.equal(next("0 0 29 2 *", "2026-11-24T00:00:00.000Z"), null);
});

test("nextCronRun gives null for a date that never exists", () => {
  assert.equal(next("0 0 30 2 *", "2026-11-24T00:00:00.000Z"), null);
  assert.equal(next("0 0 31 4 *", "2026-11-24T00:00:00.000Z"), null);
});

test("nextCronRun lets either the day of month or the day of week match when both are restricted", () => {
  // The 13th or any Friday. 24 November 2026 is a Tuesday.
  assert.equal(
    next("0 0 13 * 5", "2026-11-24T00:00:00.000Z"),
    "2026-11-27T00:00:00.000Z",
  );
  assert.equal(
    next("0 0 13 * 5", "2026-11-27T00:00:00.000Z"),
    "2026-12-04T00:00:00.000Z",
  );
  // 11 December is a Friday and 13 December is a Sunday.
  assert.equal(
    next("0 0 13 12 5", "2026-12-11T00:00:00.000Z"),
    "2026-12-13T00:00:00.000Z",
  );
  assert.equal(
    next("0 0 13 12 5", "2026-12-13T00:00:00.000Z"),
    "2026-12-18T00:00:00.000Z",
  );
});

test("nextCronRun uses only the restricted one of day of month and day of week when the other is a star", () => {
  // Only the 13th. Not every day, and not only Fridays.
  assert.equal(
    next("0 0 13 * *", "2026-11-24T00:00:00.000Z"),
    "2026-12-13T00:00:00.000Z",
  );
  // Only Fridays.
  assert.equal(
    next("0 0 * * 5", "2026-11-24T00:00:00.000Z"),
    "2026-11-27T00:00:00.000Z",
  );
});

test("nextCronRun reads Sunday as 0 and as 7", () => {
  assert.equal(
    next("0 8 * * 0", "2026-11-24T10:00:00.000Z"),
    "2026-11-29T08:00:00.000Z",
  );
  assert.equal(
    next("0 8 * * 7", "2026-11-24T10:00:00.000Z"),
    "2026-11-29T08:00:00.000Z",
  );
  assert.equal(
    next("0 8 * * 5-7", "2026-11-24T10:00:00.000Z"),
    "2026-11-27T08:00:00.000Z",
  );
  assert.equal(
    next("0 8 * * 6,0", "2026-11-24T10:00:00.000Z"),
    "2026-11-28T08:00:00.000Z",
  );
});

test("nextCronRun accepts extra spaces around the fields", () => {
  assert.equal(
    next("  0   9 * * *  ", "2026-11-24T10:00:00.000Z"),
    "2026-11-25T09:00:00.000Z",
  );
});

test("nextCronRun works in local time", () => {
  const before = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const result = nextCronRun("0 9 * * *", new Date(2026, 10, 24, 10, 0, 0));
    assert.equal(result?.getTime(), new Date(2026, 10, 25, 9, 0, 0).getTime());
  } finally {
    process.env.TZ = before;
  }
});

test("nextCronRun gives null for an invalid expression", () => {
  const invalid = [
    "",
    "   ",
    "* * * *",
    "* * * * * *",
    "60 * * * *",
    "* 24 * * *",
    "* * 0 * *",
    "* * 32 * *",
    "* * * 0 *",
    "* * * 13 *",
    "* * * * 8",
    "a b c d e",
    "*/0 * * * *",
    "5-3 * * * *",
    "1,,2 * * * *",
    "-1 * * * *",
    "*/x * * * *",
    "1-2-3 * * * *",
  ];
  for (const expression of invalid) {
    assert.equal(
      nextCronRun(expression, when("2026-11-24T10:00:00.000Z")),
      null,
      `"${expression}" must be invalid`,
    );
  }
});
