import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SessionState } from "@shared/types";
import { hiveDirectory } from "./paths.ts";
import { readUsage, readWaitingInfo, StatusMonitor } from "./status.ts";

/** A made-up home folder. Node reads HOME on macOS and Linux, and USERPROFILE on Windows. */
function home(): void {
  const root = mkdtempSync(join(tmpdir(), "hive-status-"));
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  mkdirSync(join(hiveDirectory(), "status"), { recursive: true });
}

function writeStatus(id: string, value: object): void {
  writeFileSync(
    join(hiveDirectory(), "status", `${id}.json`),
    JSON.stringify(value),
  );
}

test("a waiting session gives its question, and a permission question is marked", async () => {
  home();
  writeStatus("a", {
    state: "waiting",
    message: "  Run this command?  ",
    type: "permission_prompt",
  });
  writeStatus("b", { state: "waiting", message: "   ", type: "other" });
  assert.deepEqual(await readWaitingInfo("a"), {
    message: "Run this command?",
    permission: true,
  });
  assert.deepEqual(await readWaitingInfo("b"), {
    message: undefined,
    permission: false,
  });
});

test("a session that does not wait, or has no file, gives nothing", async () => {
  home();
  writeStatus("ready", { state: "ready" });
  writeFileSync(join(hiveDirectory(), "status", "broken.json"), "{not json");
  assert.equal(await readWaitingInfo("ready"), undefined);
  assert.equal(await readWaitingInfo("broken"), undefined);
  assert.equal(await readWaitingInfo("missing"), undefined);
});

test("the usage has the windows of the account, with times in milliseconds", async () => {
  home();
  writeFileSync(
    join(hiveDirectory(), "usage.json"),
    JSON.stringify({
      five_hour: { used_percentage: 42, resets_at: 1_800_000_000 },
      seven_day: { used_percentage: 68, resets_at: "2030-01-01T00:00:00Z" },
      model_scoped: [
        { display_name: "Opus", utilization: 88, resets_at: 1_800_000_100 },
        { utilization: 10 },
      ],
      updated_at: 1_700_000_000,
    }),
  );
  const usage = await readUsage();
  assert.deepEqual(usage?.windows, [
    { label: "5 hours", percent: 42, resetsAt: 1_800_000_000_000 },
    {
      label: "Week",
      percent: 68,
      resetsAt: Date.parse("2030-01-01T00:00:00Z"),
    },
    { label: "Week Opus", percent: 88, resetsAt: 1_800_000_100_000 },
    { label: "Week Model", percent: 10, resetsAt: null },
  ]);
  assert.equal(usage?.updatedAt, 1_700_000_000_000);
});

test("a window without a number or a time is left out, and a missing file gives null", async () => {
  home();
  assert.equal(await readUsage(), null);
  writeFileSync(
    join(hiveDirectory(), "usage.json"),
    JSON.stringify({ five_hour: {}, seven_day: "x", model_scoped: "no" }),
  );
  assert.deepEqual(await readUsage(), { windows: [], updatedAt: 0 });
  writeFileSync(join(hiveDirectory(), "usage.json"), "not json");
  assert.equal(await readUsage(), null);
});

test("the monitor reports a change, but not the first snapshot", async () => {
  home();
  writeStatus("s1", { state: "working" });
  const changes: [string, SessionState | undefined, SessionState][] = [];
  const monitor = new StatusMonitor((id, previous, next) => {
    changes.push([id, previous, next]);
  });
  // Calls the poll once, without the timer.
  const poll = (): Promise<void> =>
    (monitor as unknown as { poll(): Promise<void> }).poll();
  await poll();
  assert.deepEqual(changes, [], "old sessions must not notify");
  writeStatus("s1", { state: "ready" });
  writeStatus("s2", { state: "waiting" });
  await poll();
  assert.deepEqual(changes, [
    ["s1", "working", "ready"],
    ["s2", undefined, "waiting"],
  ]);
  await poll();
  assert.equal(changes.length, 2, "no change gives no report");
});
