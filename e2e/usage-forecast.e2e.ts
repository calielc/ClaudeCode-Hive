import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { Locator } from "playwright-core";
import { eventually, type Hive, launchHive } from "./app";
import { createFixture, MINUTE } from "./fixture";

const HOUR = 60 * MINUTE;
/** The app reads the real clock, so each run pins it. Wednesday 12 March 2025, 15:00 in UTC, and the app runs with TZ=UTC. */
const PINNED_NOW = Date.UTC(2025, 2, 12, 15);
// The weekly window of every run: Monday 10 March 09:00 to Monday 17 March 09:00 UTC. It has 60h of work.
// At the pinned time, 30h of work have passed (Monday 12h, Tuesday 12h, Wednesday 6h) and 30h remain.
const WEEK_RESET = Date.UTC(2025, 2, 17, 9);
const WORK_WEEK_NOTE = "(based on a 5 day, 12 hour work week)";

const seconds = (instant: number): number => Math.floor(instant / 1000);

interface UsageSeed {
  /** [percent used, ms until the reset] of the 5 hour window. */
  five: [number, number];
  /** Percent used of the weekly window. */
  week: number;
  /** Percent used of the weekly window of a model. */
  opus?: number;
}

/** The words on the label of each level. */
const LEVEL_WORDS = { green: "On track", yellow: "Tight", red: "At risk" };

const levelColors = new Map<string, string>();

const launches: Hive[] = [];
after(async () => {
  for (const hive of launches) {
    await hive.close();
  }
});

/** Starts Hive with a usage file, in UTC, with the clock of the page pinned to `PINNED_NOW`. */
async function launchWithUsage(seed: UsageSeed): Promise<Hive> {
  const fixture = createFixture();
  const hiveDirectory = join(fixture.home, ".claude-sessions");
  mkdirSync(hiveDirectory, { recursive: true });
  writeFileSync(
    join(hiveDirectory, "usage.json"),
    JSON.stringify({
      five_hour: {
        used_percentage: seed.five[0],
        resets_at: seconds(PINNED_NOW + seed.five[1]),
      },
      seven_day: {
        used_percentage: seed.week,
        resets_at: seconds(WEEK_RESET),
      },
      ...(seed.opus === undefined
        ? {}
        : {
            model_scoped: [
              {
                display_name: "Opus",
                utilization: seed.opus,
                resets_at: seconds(WEEK_RESET),
              },
            ],
          }),
      updated_at: seconds(PINNED_NOW),
    }),
  );
  const hive = await launchHive({ fixture, env: { TZ: "UTC" } });
  launches.push(hive);
  await hive.page.clock.setFixedTime(PINNED_NOW);
  await hive.page.reload();
  await hive.page.locator(".usage-row").first().waitFor();
  return hive;
}

function row(hive: Hive, label: string): Locator {
  return hive.page.locator(".usage-row", {
    has: hive.page.locator(".usage-label", {
      hasText: new RegExp(`^${label}$`),
    }),
  });
}

interface Expected {
  kind: "runs-out" | "lasts";
  level: "green" | "yellow" | "red";
  tooltip: string;
}

/** Checks the one label at the end of a row: attributes, tooltip, words and place. */
async function assertIcon(
  hive: Hive,
  label: string,
  expected: Expected,
): Promise<void> {
  const usageRow = row(hive, label);
  const icon = usageRow.locator('[data-testid="usage-forecast"]');
  await eventually(async () => assert.equal(await icon.count(), 1));
  assert.equal(await icon.getAttribute("data-kind"), expected.kind);
  assert.equal(await icon.getAttribute("data-level"), expected.level);
  assert.equal(await icon.getAttribute("title"), expected.tooltip);
  assert.equal(await icon.getAttribute("aria-label"), expected.tooltip);
  assert.equal(await icon.getAttribute("role"), "img");
  assert.equal(await icon.textContent(), LEVEL_WORDS[expected.level]);
  // The label is the last cell of the row, after the reset countdown, in its own column.
  assert.equal(
    await usageRow.evaluate(
      (element, id) =>
        element.lastElementChild?.getAttribute("data-testid") === id,
      "usage-forecast",
    ),
    true,
  );
  const iconBox = await icon.boundingBox();
  const resetBox = await usageRow.locator(".usage-reset").boundingBox();
  assert.ok(iconBox && resetBox);
  assert.ok(iconBox.x >= resetBox.x + resetBox.width - 0.5);
  // The text takes the color of its level.
  const color = await icon.evaluate(
    (element) => getComputedStyle(element).color,
  );
  const known = levelColors.get(expected.level);
  assert.ok(known === undefined || known === color);
  levelColors.set(expected.level, color);
}

/** The old forecast line is gone: no text of it is visible anywhere in the usage block. */
async function assertNoForecastLine(hive: Hive): Promise<void> {
  const text = (await hive.page.locator(".usage").innerText()).toLowerCase();
  assert.ok(!text.includes("on pace"), text);
  assert.ok(!text.includes("runs out"), text);
  assert.ok(!text.includes("limit reached"), text);
  // Each row is one line high, with the same height whether it has an icon or not.
  const heights = await hive.page
    .locator(".usage-row")
    .evaluateAll((rows) => rows.map((element) => element.clientHeight));
  assert.ok(
    heights.every((height) => height === heights[0]),
    `${heights}`,
  );
}

describe("the forecast label in the usage limits", () => {
  test("a 5 hour window that runs out is red, and the weekly windows follow the work week", async () => {
    // 5 hours: 75% after 2h of 5h is 37.5% per hour, so the last 25% takes 40 minutes.
    // Week: 20% after 30h of 60h of work is 40% at the reset, which is green.
    // Week Opus: 80% after 30h is 2.67% per hour, so the last 20% takes 7.5h of work: 6h on Wednesday, then 1.5h on Thursday from 09:00.
    // The limit ends on Thursday 10:30, which is 19h 30m from Wednesday 15:00.
    const hive = await launchWithUsage({
      five: [75, 3 * HOUR],
      week: 20,
      opus: 80,
    });
    await assertIcon(hive, "5 hours", {
      kind: "runs-out",
      level: "red",
      tooltip: "Runs out in 40m (before the reset)",
    });
    await assertIcon(hive, "Week", {
      kind: "lasts",
      level: "green",
      tooltip: `On pace for 40% at the reset ${WORK_WEEK_NOTE}`,
    });
    await assertIcon(hive, "Week Opus", {
      kind: "runs-out",
      level: "red",
      tooltip: `Runs out in 19h 30m (before the reset) ${WORK_WEEK_NOTE}`,
    });
    await assertNoForecastLine(hive);
  });

  test("a 5 hour window that lasts below 85% is green, and a reached limit says so", async () => {
    // 5 hours: 33% after 3h of 5h is 33 * 5 / 3 = 55% at the reset.
    // Week: 43% after 30h of 60h is 86%, which is yellow.
    // Week Opus: 100% is a limit that is reached.
    const hive = await launchWithUsage({
      five: [33, 2 * HOUR],
      week: 43,
      opus: 100,
    });
    await assertIcon(hive, "5 hours", {
      kind: "lasts",
      level: "green",
      tooltip: "On pace for 55% at the reset",
    });
    await assertIcon(hive, "Week", {
      kind: "lasts",
      level: "yellow",
      tooltip: `On pace for 86% at the reset ${WORK_WEEK_NOTE}`,
    });
    await assertIcon(hive, "Week Opus", {
      kind: "runs-out",
      level: "red",
      tooltip: `Limit reached ${WORK_WEEK_NOTE}`,
    });
    await assertNoForecastLine(hive);
  });

  test("a 5 hour window that lasts at 85% or more is yellow", async () => {
    // 5 hours: 72% after 4h of 5h is 72 * 5 / 4 = 90% at the reset. The last 28% would take 1.56h, which is more than the 1h that remains.
    // Week: 34% after 30h of 60h is 68%, which is green.
    // Week Opus: 42.5% after 30h of 60h is exactly 85%, which is yellow.
    const hive = await launchWithUsage({
      five: [72, HOUR],
      week: 34,
      opus: 42.5,
    });
    await assertIcon(hive, "5 hours", {
      kind: "lasts",
      level: "yellow",
      tooltip: "On pace for 90% at the reset",
    });
    await assertIcon(hive, "Week", {
      kind: "lasts",
      level: "green",
      tooltip: `On pace for 68% at the reset ${WORK_WEEK_NOTE}`,
    });
    await assertIcon(hive, "Week Opus", {
      kind: "lasts",
      level: "yellow",
      tooltip: `On pace for 85% at the reset ${WORK_WEEK_NOTE}`,
    });
    await assertNoForecastLine(hive);
  });

  test("84% at the reset is still green, and a row without a forecast keeps its column empty", async () => {
    // 5 hours: 33.6% after 2h of 5h is 33.6 * 2.5 = 84% at the reset.
    // Week: 0% has no forecast, so its row has no label, and its cells line up with the row above.
    const hive = await launchWithUsage({ five: [33.6, 3 * HOUR], week: 0 });
    await assertIcon(hive, "5 hours", {
      kind: "lasts",
      level: "green",
      tooltip: "On pace for 84% at the reset",
    });
    assert.equal(
      await row(hive, "Week").locator('[data-testid="usage-forecast"]').count(),
      0,
    );
    const resetBox = async (label: string) =>
      row(hive, label).locator(".usage-reset").boundingBox();
    const five = await resetBox("5 hours");
    const week = await resetBox("Week");
    assert.ok(five && week);
    assert.equal(week.x, five.x);
    assert.equal(week.width, five.width);
    const barBox = async (label: string) =>
      row(hive, label).locator(".bar").boundingBox();
    const fiveBar = await barBox("5 hours");
    const weekBar = await barBox("Week");
    assert.ok(fiveBar && weekBar);
    assert.equal(weekBar.width, fiveBar.width);
    assert.equal(
      await hive.page.locator('[data-testid="usage-forecast"]').count(),
      1,
    );
    await assertNoForecastLine(hive);
  });

  test("the three levels have three different colors", () => {
    // Green and red keep the colors of the bars. Yellow is a third color.
    assert.equal(levelColors.get("green"), "rgb(77, 191, 102)");
    assert.equal(levelColors.get("red"), "rgb(235, 77, 77)");
    const yellow = levelColors.get("yellow");
    assert.ok(yellow);
    assert.notEqual(yellow, levelColors.get("green"));
    assert.notEqual(yellow, levelColors.get("red"));
  });
});
