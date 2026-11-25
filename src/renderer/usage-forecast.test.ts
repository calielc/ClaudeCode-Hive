import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { UsageWindow } from "../shared/types.ts";
import {
  addWorkTime,
  forecastUsage,
  workTimeBetween,
} from "./usage-forecast.ts";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FIVE_HOURS = 5 * HOUR;
const WEEK = 7 * DAY;
/** The weekly forecast counts working time: Monday to Friday, 09:00 to 17:00 local time, so 8 hours a day and 40 a week. */
const WORK_WEEK = 40 * HOUR;

/** A window with `remaining` ms until the reset. */
function windowWith(
  label: string,
  percent: number | null,
  remaining: number | null,
): UsageWindow {
  return {
    label,
    percent,
    resetsAt: remaining === null ? null : NOW + remaining,
  };
}

/** A window that resets at an exact instant. */
function windowResettingAt(
  label: string,
  percent: number | null,
  resetsAt: number,
): UsageWindow {
  return { label, percent, resetsAt };
}

/** An instant given in local time. The test file fixes the time zone, so the expectations hold on any machine. */
function local(
  month: number,
  day: number,
  hour: number,
  minute = 0,
  year = 2025,
): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

// The 5 hour window keeps its continuous pace in every time zone, so these tests run once.
test("the 5 hour window runs out before the reset at a fast pace", () => {
  // 75% in 2h of 5h: 37.5% per hour, so the last 25% takes 40 minutes.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 75, 3 * HOUR), NOW), {
    kind: "runs-out",
    msLeft: 2_400_000,
  });
  // 70% in 2h: the last 30% takes 30 * 7_200_000 / 70 = 3_085_714.28 ms.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 70, 3 * HOUR), NOW), {
    kind: "runs-out",
    msLeft: 3_085_714,
  });
});

test("the 5 hour window counts nights and weekends as normal time", () => {
  // NOW is a Tuesday evening in UTC, and the 5 hour pace does not care.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 33, 2 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 55,
  });
});

test("the usage at the reset of the 5 hour window is rounded to the nearest whole percent", () => {
  // 17 * 5 / 3 = 28.33
  assert.deepEqual(forecastUsage(windowWith("5 hours", 17, 2 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 28,
  });
  // 19 * 5 / 3 = 31.67
  assert.deepEqual(forecastUsage(windowWith("5 hours", 19, 2 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 32,
  });
  // 25 * 5 / 4 = 31.25
  assert.deepEqual(forecastUsage(windowWith("5 hours", 25, HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 31,
  });
});

test("a 5 hour pace that reaches 100% exactly at the reset lasts", () => {
  // 50% in 2.5h of 5h.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 50, 2.5 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 100,
  });
  // 20% in 1h of 5h.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 20, 4 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 100,
  });
});

test("a 5 hour pace a little above the exact boundary runs out", () => {
  // 50.01% in 2.5h: the last 49.99% takes 49.99 * 9_000_000 / 50.01 = 8_996_400.72 ms, which is before the reset.
  assert.deepEqual(
    forecastUsage(windowWith("5 hours", 50.01, 2.5 * HOUR), NOW),
    { kind: "runs-out", msLeft: 8_996_401 },
  );
});

test("a 5 hour pace a little below the exact boundary lasts", () => {
  // 49.99% in 2.5h: 49.99 * 5 / 2.5 = 99.98, which rounds to 100.
  assert.deepEqual(
    forecastUsage(windowWith("5 hours", 49.99, 2.5 * HOUR), NOW),
    { kind: "lasts", percentAtReset: 100 },
  );
  // 49% in 2.5h: 98%.
  assert.deepEqual(forecastUsage(windowWith("5 hours", 49, 2.5 * HOUR), NOW), {
    kind: "lasts",
    percentAtReset: 98,
  });
});

test("exactly 5% of the 5 hour window elapsed gives a forecast", () => {
  // 5% of 5h is 900_000 ms. 10% in 900_000 ms: the last 90% takes 8_100_000 ms.
  assert.deepEqual(
    forecastUsage(windowWith("5 hours", 10, FIVE_HOURS - 900_000), NOW),
    { kind: "runs-out", msLeft: 8_100_000 },
  );
});

test("just under 5% of the 5 hour window elapsed gives no forecast", () => {
  assert.equal(
    forecastUsage(windowWith("5 hours", 10, FIVE_HOURS - 899_999), NOW),
    null,
  );
});

test("100% or more in the 5 hour window is a limit that is reached", () => {
  assert.deepEqual(forecastUsage(windowWith("5 hours", 100, 2 * HOUR), NOW), {
    kind: "runs-out",
    msLeft: 0,
  });
  assert.deepEqual(forecastUsage(windowWith("5 hours", 120, 2 * HOUR), NOW), {
    kind: "runs-out",
    msLeft: 0,
  });
});

test("100% too early in the 5 hour window still gives no forecast", () => {
  assert.equal(
    forecastUsage(windowWith("5 hours", 100, FIVE_HOURS - 60_000), NOW),
    null,
  );
});

test("no forecast without usage", () => {
  assert.equal(forecastUsage(windowWith("5 hours", 0, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("5 hours", -3, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("5 hours", null, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", 0, 2 * DAY), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", -3, 2 * DAY), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", null, 2 * DAY), NOW), null);
});

test("no forecast without a reset time, or when the reset is not ahead", () => {
  assert.equal(forecastUsage(windowWith("Week", 40, null), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", 40, 0), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", 40, -1), NOW), null);
  assert.equal(forecastUsage(windowWith("5 hours", 40, -HOUR), NOW), null);
});

test("no forecast when the reset is further away than the window is long", () => {
  assert.equal(
    forecastUsage(windowWith("5 hours", 40, FIVE_HOURS + 1), NOW),
    null,
  );
  assert.equal(forecastUsage(windowWith("5 hours", 40, 6 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("Week", 40, WEEK + 1), NOW), null);
  // A reset one week away does not fit the 5 hour window.
  assert.equal(forecastUsage(windowWith("5 hours", 40, WEEK), NOW), null);
});

test("no forecast for a label that is not a known window", () => {
  assert.equal(forecastUsage(windowWith("Month", 40, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("5 hour", 40, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("", 40, 2 * HOUR), NOW), null);
  assert.equal(forecastUsage(windowWith("week", 40, 2 * HOUR), NOW), null);
});

// The working time and the weekly forecast read the local time, so they run in two zones.
// Node reads the TZ variable again each time it changes, so the hooks switch the zone for one block.
// Every expectation is written in local time, and the Amsterdam block adds the days of the change to summer time.
for (const zone of ["UTC", "Europe/Amsterdam"]) {
  describe(`working time in ${zone}`, () => {
    let savedZone: string | undefined;
    before(() => {
      savedZone = process.env.TZ;
      process.env.TZ = zone;
    });
    after(() => {
      if (savedZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = savedZone;
      }
    });

    // March 2025: Mon 3, Mon 10, Mon 17, Mon 24, Mon 31. The 15th is a Saturday and the 16th a Sunday.

    test("workTimeBetween counts the hours inside one working day", () => {
      assert.equal(
        workTimeBetween(local(3, 12, 10), local(3, 12, 13, 30)),
        3.5 * HOUR,
      );
      assert.equal(
        workTimeBetween(local(3, 12, 9, 15), local(3, 12, 9, 16)),
        MINUTE,
      );
    });

    test("workTimeBetween skips the night over the 17:00 boundary", () => {
      // Wednesday 16:00 to 17:00 is 1h, and Thursday 09:00 to 10:00 is 1h.
      assert.equal(
        workTimeBetween(local(3, 12, 16), local(3, 13, 10)),
        2 * HOUR,
      );
      // A whole night in between counts nothing: Wednesday 17:00 to Thursday 09:00.
      assert.equal(workTimeBetween(local(3, 12, 17), local(3, 13, 9)), 0);
    });

    test("workTimeBetween skips the weekend", () => {
      // Friday 16:00 to 17:00 is 1h, and Monday 09:00 to 10:00 is 1h.
      assert.equal(
        workTimeBetween(local(3, 14, 16), local(3, 17, 10)),
        2 * HOUR,
      );
    });

    test("workTimeBetween from a Saturday counts only the Monday", () => {
      // Saturday 12:00 to Monday 11:00 is the Monday 09:00 to 11:00.
      assert.equal(
        workTimeBetween(local(3, 15, 12), local(3, 17, 11)),
        2 * HOUR,
      );
      // Saturday to Sunday counts nothing.
      assert.equal(workTimeBetween(local(3, 15, 12), local(3, 16, 20)), 0);
    });

    test("workTimeBetween at exactly 09:00 and exactly 17:00", () => {
      assert.equal(
        workTimeBetween(local(3, 17, 9), local(3, 17, 17)),
        8 * HOUR,
      );
      // From 17:00 on, the rest of the day is nothing.
      assert.equal(workTimeBetween(local(3, 17, 17), local(3, 18, 9)), 0);
      // Tuesday 17:00 to Wednesday 10:00 is only the Wednesday hour.
      assert.equal(workTimeBetween(local(3, 18, 17), local(3, 19, 10)), HOUR);
      // Monday 08:00 to 09:00 is before the work starts.
      assert.equal(workTimeBetween(local(3, 17, 8), local(3, 17, 9)), 0);
    });

    test("workTimeBetween of a zero length span is zero", () => {
      assert.equal(workTimeBetween(local(3, 12, 11), local(3, 12, 11)), 0);
      assert.equal(workTimeBetween(local(3, 15, 11), local(3, 15, 11)), 0);
      assert.equal(workTimeBetween(local(3, 12, 20), local(3, 12, 20)), 0);
    });

    test("workTimeBetween of a span of several weeks", () => {
      // Three whole weeks, Monday 00:00 to Monday 00:00: 3 * 40h.
      assert.equal(
        workTimeBetween(local(3, 3, 0), local(3, 24, 0)),
        3 * WORK_WEEK,
      );
      // Wednesday 5th 12:00 to Thursday 20th 10:00:
      // Wednesday 5h, Thursday 8h and Friday 8h = 21h.
      // Week of the 10th: 40h.
      // Monday 17th, Tuesday 18th and Wednesday 19th: 24h.
      // Thursday 20th 09:00 to 10:00: 1h. Total 86h.
      assert.equal(
        workTimeBetween(local(3, 5, 12), local(3, 20, 10)),
        86 * HOUR,
      );
    });

    test("workTimeBetween adds up over a split point", () => {
      const a = local(3, 12, 13);
      const b = local(3, 15, 3);
      const c = local(3, 18, 16, 30);
      assert.equal(
        workTimeBetween(a, c),
        workTimeBetween(a, b) + workTimeBetween(b, c),
      );
      // Wednesday 13:00 to 17:00 is 4h, and Thursday and Friday are 16h. After the weekend, Tuesday 09:00 to 16:30 is 7.5h.
      assert.equal(workTimeBetween(a, c), 20 * HOUR + 8 * HOUR + 7.5 * HOUR);
    });

    test("addWorkTime moves inside one working day", () => {
      assert.equal(addWorkTime(local(3, 12, 10), 2 * HOUR), local(3, 12, 12));
      assert.equal(addWorkTime(local(3, 12, 10), 1), local(3, 12, 10) + 1);
    });

    test("addWorkTime jumps over the 17:00 boundary to the next morning", () => {
      // Wednesday 15:00 + 3h: 2h until 17:00, then 1h on Thursday from 09:00.
      assert.equal(addWorkTime(local(3, 12, 15), 3 * HOUR), local(3, 13, 10));
    });

    test("addWorkTime jumps over the weekend", () => {
      // Friday 16:00 + 3h: 1h until 17:00, then 2h on Monday from 09:00.
      assert.equal(addWorkTime(local(3, 14, 16), 3 * HOUR), local(3, 17, 11));
    });

    test("addWorkTime from a Saturday starts on the Monday", () => {
      assert.equal(addWorkTime(local(3, 15, 12), HOUR), local(3, 17, 10));
      // From a Sunday night as well.
      assert.equal(
        addWorkTime(local(3, 16, 23), 30 * MINUTE),
        local(3, 17, 9, 30),
      );
    });

    test("addWorkTime from exactly 09:00 and exactly 17:00", () => {
      // A full day of work from 09:00 ends at 17:00 of the same day, not at 09:00 of the next day.
      assert.equal(addWorkTime(local(3, 17, 9), 8 * HOUR), local(3, 17, 17));
      assert.equal(
        addWorkTime(local(3, 17, 9), 8 * HOUR + 1),
        local(3, 18, 9) + 1,
      );
      // From 17:00 the work starts at 09:00 of the next working day.
      assert.equal(addWorkTime(local(3, 17, 17), HOUR), local(3, 18, 10));
      // From Friday 17:00 it starts on Monday.
      assert.equal(addWorkTime(local(3, 14, 17), 8 * HOUR), local(3, 17, 17));
    });

    test("addWorkTime of zero returns the start, in the night and in the weekend too", () => {
      assert.equal(addWorkTime(local(3, 12, 11), 0), local(3, 12, 11));
      assert.equal(addWorkTime(local(3, 12, 22), 0), local(3, 12, 22));
      assert.equal(addWorkTime(local(3, 15, 12), 0), local(3, 15, 12));
    });

    test("addWorkTime over several weeks", () => {
      // Monday 3rd 09:00 + 120h of work: 15 working days end on Friday 21st at 17:00.
      assert.equal(
        addWorkTime(local(3, 3, 9), 3 * WORK_WEEK),
        local(3, 21, 17),
      );
      // The reverse of the 86h span above.
      assert.equal(addWorkTime(local(3, 5, 12), 86 * HOUR), local(3, 20, 10));
    });

    test("addWorkTime and workTimeBetween agree with each other", () => {
      const starts = [
        local(3, 12, 13),
        local(3, 14, 16, 45),
        local(3, 15, 5),
        local(3, 17, 17),
        local(3, 18, 8, 59),
      ];
      const amounts = [1, 7 * MINUTE, 3 * HOUR, 8 * HOUR, 29 * HOUR, 83 * HOUR];
      for (const start of starts) {
        for (const amount of amounts) {
          assert.equal(
            workTimeBetween(start, addWorkTime(start, amount)),
            amount,
          );
        }
      }
    });

    test("the zone decides which hours are working hours", () => {
      // 08:00 to 10:00 UTC on Wednesday 12 March is 09:00 to 11:00 in Amsterdam, which has not started summer time.
      const span = workTimeBetween(
        Date.UTC(2025, 2, 12, 8),
        Date.UTC(2025, 2, 12, 10),
      );
      assert.equal(span, zone === "UTC" ? HOUR : 2 * HOUR);
    });

    describe("the forecast of the week window", () => {
      // Week of Monday 10 to Monday 17 March, from 09:00 to 09:00. It holds 40h of work.
      const reset = local(3, 17, 9);

      test("runs out before the reset when the work pace is too fast", () => {
        // Wednesday 12th 13:00: elapsed Monday and Tuesday 16h + Wednesday 4h = 20h, and the remaining work is 20h as well.
        // 80% in 20h is 4% per hour, so the last 20% takes 5h of work.
        // The 5h are 4h on Wednesday until 17:00 and 1h on Thursday, so the limit ends on Thursday 10:00, 21h from now.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 80, reset), local(3, 12, 13)),
          { kind: "runs-out", msLeft: 21 * HOUR },
        );
      });

      test("a slow work pace lasts, with the usage at the reset", () => {
        // 20% in 20h of 40h: 40% at the reset. The continuous rule gives 20 * 168 / 84 = 40, so the numbers differ below.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 20, reset), local(3, 12, 13)),
          { kind: "lasts", percentAtReset: 40 },
        );
        // 30% in 20h: 30 * 40 / 20 = 60.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 30, reset), local(3, 12, 13)),
          { kind: "lasts", percentAtReset: 60 },
        );
      });

      test("a model week label counts as a week", () => {
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week Opus", 80, reset),
            local(3, 12, 13),
          ),
          { kind: "runs-out", msLeft: 21 * HOUR },
        );
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week Sonnet", 30, reset),
            local(3, 12, 13),
          ),
          { kind: "lasts", percentAtReset: 60 },
        );
      });

      test("the night does not count as time that passes", () => {
        // Tuesday 22:00: the elapsed work is Monday and Tuesday, 16h, and 24h remain.
        // 32% in 16h is 2% per hour, so 100% takes 34h more, which is more than 24h: lasts, with 32 * 40 / 16 = 80%.
        // The continuous rule would see 37h of 168h, predict 32 * 168 / 37 = 145% and say runs out.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 32, reset), local(3, 11, 22)),
          { kind: "lasts", percentAtReset: 80 },
        );
        // 60% in 16h is 3.75% per hour, so the last 40% takes 10h40m of work.
        // Wednesday 09:00 to 17:00 is 8h, and the rest 2h40m ends on Thursday at 11:40.
        // From Tuesday 22:00 that is 37h40m.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 60, reset), local(3, 11, 22)),
          { kind: "runs-out", msLeft: 37 * HOUR + 40 * MINUTE },
        );
      });

      test("in the weekend no work time remains, so the window lasts", () => {
        // Saturday 15th 12:00: the elapsed work is the 40h of the whole week, and 0h remain.
        // 50% in 40h is 1.25% per hour, so the last 50% would take 40h, which is more than 0h: lasts, with 50 * 40 / 40 = 50%.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 50, reset), local(3, 15, 12)),
          { kind: "lasts", percentAtReset: 50 },
        );
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 99, reset), local(3, 15, 12)),
          { kind: "lasts", percentAtReset: 99 },
        );
      });

      test("a work pace that reaches 100% exactly at the reset lasts", () => {
        // 50% in 20h: the last 50% takes 20h, which is exactly the 20h that remain.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 50, reset), local(3, 12, 13)),
          { kind: "lasts", percentAtReset: 100 },
        );
      });

      test("a work pace a little above the exact boundary runs out", () => {
        // 50.01% in 20h: the last 49.99% takes 49.99 * 72_000_000 / 50.01 = 71_971_205.76 ms of work.
        // Wednesday gives 14_400_000 and Thursday 28_800_000, so 28_771_205.76 ms of Friday remain from 09:00.
        // From Wednesday 13:00 to Friday 09:00 is 44h = 158_400_000 ms, so msLeft is 187_171_205.76 ms.
        const forecast = forecastUsage(
          windowResettingAt("Week", 50.01, reset),
          local(3, 12, 13),
        );
        assert.equal(forecast?.kind, "runs-out");
        assert.ok(
          forecast?.kind === "runs-out" &&
            Math.abs(forecast.msLeft - 187_171_205.76) <= 1,
          JSON.stringify(forecast),
        );
      });

      test("a work pace a little below the exact boundary lasts", () => {
        // 49.99% in 20h: 49.99 * 40 / 20 = 99.98, which rounds to 100.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 49.99, reset),
            local(3, 12, 13),
          ),
          { kind: "lasts", percentAtReset: 100 },
        );
        // 49% in 20h: 98%.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 49, reset), local(3, 12, 13)),
          { kind: "lasts", percentAtReset: 98 },
        );
      });

      test("exactly 5% of the working time elapsed gives a forecast", () => {
        // 5% of 40h is 2h. Monday 11:00 is exactly 2h after the start.
        // 4% in 2h: 4 * 40 / 2 = 80% at the reset.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 4, reset), local(3, 10, 11)),
          { kind: "lasts", percentAtReset: 80 },
        );
        // 10% in 2h is 5% per hour, so the last 90% takes 18h of work: Monday 6h, Tuesday 8h and Wednesday 4h.
        // That ends on Wednesday 13:00, which is 50h after Monday 11:00.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 10, reset), local(3, 10, 11)),
          { kind: "runs-out", msLeft: 50 * HOUR },
        );
      });

      test("just under 5% of the working time elapsed gives no forecast", () => {
        assert.equal(
          forecastUsage(
            windowResettingAt("Week", 4, reset),
            local(3, 10, 11) - 1,
          ),
          null,
        );
        assert.equal(
          forecastUsage(
            windowResettingAt("Week", 100, reset),
            local(3, 10, 11) - 1,
          ),
          null,
        );
      });

      test("the early hours of the week give no forecast, because no work has passed", () => {
        // Sunday night and Monday before 09:00 have 0h of elapsed work.
        assert.equal(
          forecastUsage(windowResettingAt("Week", 5, reset), local(3, 10, 8)),
          null,
        );
        assert.equal(
          forecastUsage(windowResettingAt("Week", 5, reset), local(3, 9, 23)),
          null,
        );
      });

      test("100% or more is a limit that is reached", () => {
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 100, reset),
            local(3, 12, 13),
          ),
          { kind: "runs-out", msLeft: 0 },
        );
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 130, reset),
            local(3, 12, 13),
          ),
          { kind: "runs-out", msLeft: 0 },
        );
      });

      test("no forecast when the reset is further away than a week", () => {
        const now = local(3, 12, 13);
        assert.equal(
          forecastUsage(windowResettingAt("Week", 40, now + WEEK + 1), now),
          null,
        );
        // A reset exactly one week away has no elapsed work.
        assert.equal(
          forecastUsage(windowResettingAt("Week", 40, now + WEEK), now),
          null,
        );
      });

      test("a reset a few hours away uses the working hours before it", () => {
        // The window ends on Friday 14th 17:00 and starts on Friday 7th 17:00.
        // Friday 14th 11:00: 34h elapsed and 6h remain. 40% in 34h: 40 * 40 / 34 = 47.06, so 47%.
        // The last 60% would take 51h, which is more than 6h.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 40, local(3, 14, 17)),
            local(3, 14, 11),
          ),
          { kind: "lasts", percentAtReset: 47 },
        );
      });
    });
  });
}

describe("working time around the change to summer time in Amsterdam", () => {
  let savedZone: string | undefined;
  before(() => {
    savedZone = process.env.TZ;
    process.env.TZ = "Europe/Amsterdam";
  });
  after(() => {
    if (savedZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = savedZone;
    }
  });

  // The clocks go forward on Sunday 30 March 2025 at 02:00. Monday 31 March is the first working day in summer time.
  // Autumn: the clocks go back on Sunday 26 October 2025 at 03:00.

  test("the weekend of the change loses no work time", () => {
    // Friday 28th 12:00 to Monday 31st 12:00: Friday 5h and Monday 3h.
    assert.equal(workTimeBetween(local(3, 28, 12), local(3, 31, 12)), 8 * HOUR);
    // The week from Monday 24th to Monday 31st is a full 40h, although the wall clock has only 167h.
    assert.equal(workTimeBetween(local(3, 24, 0), local(3, 31, 0)), WORK_WEEK);
  });

  test("addWorkTime across the change to summer time returns 10:00 local time, one hour less on the wall clock", () => {
    // Friday 28th 16:00 + 2h: 1h until 17:00 and 1h on Monday from 09:00, so Monday 31st 10:00 local time.
    const result = addWorkTime(local(3, 28, 16), 2 * HOUR);
    assert.equal(result, local(3, 31, 10));
    // From Friday 16:00 to Monday 10:00 is 66h on the clock face, and 65h really passed because 02:00 became 03:00.
    assert.equal(result - local(3, 28, 16), 65 * HOUR);
  });

  test("addWorkTime across the change back to winter time takes one hour more on the wall clock", () => {
    // Friday 24 October 16:00 + 2h ends on Monday 27th 10:00 local time. On the clock face that is 66h and really 67h passed.
    const result = addWorkTime(local(10, 24, 16), 2 * HOUR);
    assert.equal(result, local(10, 27, 10));
    assert.equal(result - local(10, 24, 16), 67 * HOUR);
  });

  test("the week window across the change still holds 40h of work", () => {
    // The reset is Monday 31 March 09:00 summer time, which is 07:00 UTC. The start is 7 x 24h earlier, Monday 24th 07:00 UTC, which is 08:00 local time.
    // Wednesday 26th 13:00: Monday 8h, Tuesday 8h and Wednesday 4h are 20h elapsed, and 20h remain.
    const reset = local(3, 31, 9);
    assert.deepEqual(
      forecastUsage(windowResettingAt("Week", 80, reset), local(3, 26, 13)),
      { kind: "runs-out", msLeft: 21 * HOUR },
    );
    assert.deepEqual(
      forecastUsage(windowResettingAt("Week", 20, reset), local(3, 26, 13)),
      { kind: "lasts", percentAtReset: 40 },
    );
  });
});
