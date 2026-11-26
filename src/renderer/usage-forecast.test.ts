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
/** The weekly forecast counts working time: every day, 09:00 to 21:00 local time, so 12 hours a day and 84 a week. */
const WORK_WEEK = 84 * HOUR;

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

    // March 2025: Mon 3, Mon 10, Mon 17, Mon 24, Mon 31. The 15th is a Saturday and the 16th a Sunday, and they count as work days.

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

    test("workTimeBetween skips the night over the 21:00 boundary", () => {
      // Wednesday 20:00 to 21:00 is 1h, and Thursday 09:00 to 10:00 is 1h.
      assert.equal(
        workTimeBetween(local(3, 12, 20), local(3, 13, 10)),
        2 * HOUR,
      );
      // A whole night in between counts nothing: Wednesday 21:00 to Thursday 09:00.
      assert.equal(workTimeBetween(local(3, 12, 21), local(3, 13, 9)), 0);
    });

    test("workTimeBetween counts the weekend", () => {
      // Friday 20:00 to 21:00 is 1h, Saturday and Sunday are 12h each, and Monday 09:00 to 10:00 is 1h.
      assert.equal(
        workTimeBetween(local(3, 14, 20), local(3, 17, 10)),
        26 * HOUR,
      );
    });

    test("workTimeBetween from a Saturday counts the rest of the weekend", () => {
      // Saturday 12:00 to 21:00 is 9h, Sunday is 12h and Monday 09:00 to 11:00 is 2h.
      assert.equal(
        workTimeBetween(local(3, 15, 12), local(3, 17, 11)),
        23 * HOUR,
      );
      // Saturday 12:00 to Sunday 20:00 is 9h and 11h.
      assert.equal(
        workTimeBetween(local(3, 15, 12), local(3, 16, 20)),
        20 * HOUR,
      );
    });

    test("workTimeBetween at exactly 09:00 and exactly 21:00", () => {
      assert.equal(
        workTimeBetween(local(3, 17, 9), local(3, 17, 21)),
        12 * HOUR,
      );
      // From 21:00 on, the rest of the day is nothing.
      assert.equal(workTimeBetween(local(3, 17, 21), local(3, 18, 9)), 0);
      // Tuesday 21:00 to Wednesday 10:00 is only the Wednesday hour.
      assert.equal(workTimeBetween(local(3, 18, 21), local(3, 19, 10)), HOUR);
      // Monday 08:00 to 09:00 is before the work starts.
      assert.equal(workTimeBetween(local(3, 17, 8), local(3, 17, 9)), 0);
    });

    test("workTimeBetween of a zero length span is zero", () => {
      assert.equal(workTimeBetween(local(3, 12, 11), local(3, 12, 11)), 0);
      assert.equal(workTimeBetween(local(3, 15, 11), local(3, 15, 11)), 0);
      assert.equal(workTimeBetween(local(3, 12, 20), local(3, 12, 20)), 0);
    });

    test("workTimeBetween of a span of several weeks", () => {
      // Three whole weeks, Monday 00:00 to Monday 00:00: 3 * 84h.
      assert.equal(
        workTimeBetween(local(3, 3, 0), local(3, 24, 0)),
        3 * WORK_WEEK,
      );
      // Wednesday 5th 12:00 to Thursday 20th 10:00:
      // Wednesday 12:00 to 21:00 is 9h.
      // The 6th to the 19th are 14 whole days: 168h.
      // Thursday 20th 09:00 to 10:00: 1h. Total 178h.
      assert.equal(
        workTimeBetween(local(3, 5, 12), local(3, 20, 10)),
        178 * HOUR,
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
      // Wednesday 13:00 to 21:00 is 8h. Thursday to Monday are 5 whole days: 60h. Tuesday 09:00 to 16:30 is 7.5h.
      assert.equal(workTimeBetween(a, c), 8 * HOUR + 60 * HOUR + 7.5 * HOUR);
    });

    test("addWorkTime moves inside one working day", () => {
      assert.equal(addWorkTime(local(3, 12, 10), 2 * HOUR), local(3, 12, 12));
      assert.equal(addWorkTime(local(3, 12, 10), 1), local(3, 12, 10) + 1);
    });

    test("addWorkTime jumps over the 21:00 boundary to the next morning", () => {
      // Wednesday 19:00 + 3h: 2h until 21:00, then 1h on Thursday from 09:00.
      assert.equal(addWorkTime(local(3, 12, 19), 3 * HOUR), local(3, 13, 10));
    });

    test("addWorkTime goes on into the weekend", () => {
      // Friday 20:00 + 3h: 1h until 21:00, then 2h on Saturday from 09:00.
      assert.equal(addWorkTime(local(3, 14, 20), 3 * HOUR), local(3, 15, 11));
    });

    test("addWorkTime inside the weekend", () => {
      assert.equal(addWorkTime(local(3, 15, 12), HOUR), local(3, 15, 13));
      // From a Saturday night it starts on Sunday at 09:00.
      assert.equal(
        addWorkTime(local(3, 15, 23), 30 * MINUTE),
        local(3, 16, 9, 30),
      );
    });

    test("addWorkTime from exactly 09:00 and exactly 21:00", () => {
      // A full day of work from 09:00 ends at 21:00 of the same day, not at 09:00 of the next day.
      assert.equal(addWorkTime(local(3, 17, 9), 12 * HOUR), local(3, 17, 21));
      assert.equal(
        addWorkTime(local(3, 17, 9), 12 * HOUR + 1),
        local(3, 18, 9) + 1,
      );
      // From 21:00 the work starts at 09:00 of the next working day.
      assert.equal(addWorkTime(local(3, 17, 21), HOUR), local(3, 18, 10));
      // From Friday 21:00 it starts on Saturday.
      assert.equal(addWorkTime(local(3, 14, 21), 12 * HOUR), local(3, 15, 21));
    });

    test("addWorkTime of zero returns the start, in the night and in the weekend too", () => {
      assert.equal(addWorkTime(local(3, 12, 11), 0), local(3, 12, 11));
      assert.equal(addWorkTime(local(3, 12, 22), 0), local(3, 12, 22));
      assert.equal(addWorkTime(local(3, 15, 12), 0), local(3, 15, 12));
    });

    test("addWorkTime over several weeks", () => {
      // Monday 3rd 09:00 + 252h of work: 21 days end on Sunday 23rd at 21:00.
      assert.equal(
        addWorkTime(local(3, 3, 9), 3 * WORK_WEEK),
        local(3, 23, 21),
      );
      // The reverse of the 178h span above.
      assert.equal(addWorkTime(local(3, 5, 12), 178 * HOUR), local(3, 20, 10));
    });

    test("addWorkTime and workTimeBetween agree with each other", () => {
      const starts = [
        local(3, 12, 13),
        local(3, 14, 20, 45),
        local(3, 15, 5),
        local(3, 17, 21),
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
      // Week of Monday 10 to Monday 17 March, from 09:00 to 09:00. It holds 84h of work.
      // The reset is set in a hook, after the outer hook has switched the zone. A value made while the block is defined would use the zone of the process.
      let reset = 0;
      before(() => {
        reset = local(3, 17, 9);
      });

      test("runs out before the reset when the work pace is too fast", () => {
        // Wednesday 12th 15:00: elapsed Monday and Tuesday 24h + Wednesday 6h = 30h, and 54h of work remain.
        // 80% in 30h is 2.67% per hour, so the last 20% takes 7.5h of work.
        // The 7.5h are 6h on Wednesday until 21:00 and 1.5h on Thursday, so the limit ends on Thursday 10:30, 19.5h from now.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 80, reset), local(3, 12, 15)),
          { kind: "runs-out", msLeft: 19 * HOUR + 30 * MINUTE },
        );
      });

      test("a slow work pace lasts, with the usage at the reset", () => {
        // 20% in 30h of 84h: 20 * 84 / 30 = 56% at the reset.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 20, reset), local(3, 12, 15)),
          { kind: "lasts", percentAtReset: 56 },
        );
        // 30% in 30h: 30 * 84 / 30 = 84.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 30, reset), local(3, 12, 15)),
          { kind: "lasts", percentAtReset: 84 },
        );
      });

      test("a model week label counts as a week", () => {
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week Opus", 80, reset),
            local(3, 12, 15),
          ),
          { kind: "runs-out", msLeft: 19 * HOUR + 30 * MINUTE },
        );
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week Sonnet", 30, reset),
            local(3, 12, 15),
          ),
          { kind: "lasts", percentAtReset: 84 },
        );
      });

      test("the night does not count as time that passes", () => {
        // Tuesday 22:00: the elapsed work is Monday and Tuesday, 24h, and 60h remain.
        // 24% in 24h is 1% per hour, so the last 76% takes 76h, which is more than 60h: lasts, with 24 * 84 / 24 = 84%.
        // The continuous rule would see 37h of 168h, predict 24 * 168 / 37 = 109% and say runs out.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 24, reset), local(3, 11, 22)),
          { kind: "lasts", percentAtReset: 84 },
        );
        // 60% in 24h is 2.5% per hour, so the last 40% takes 16h of work.
        // Wednesday 09:00 to 21:00 is 12h, and the rest 4h ends on Thursday at 13:00.
        // From Tuesday 22:00 that is 39h.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 60, reset), local(3, 11, 22)),
          { kind: "runs-out", msLeft: 39 * HOUR },
        );
      });

      test("the weekend counts as work time", () => {
        // Saturday 15th 12:00: Monday to Friday are 60h and Saturday 09:00 to 12:00 is 3h, so 63h elapsed and 21h remain.
        // 50% in 63h: the last 50% takes 63h, which is more than 21h: lasts, with 50 * 84 / 63 = 66.67, so 67%.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 50, reset), local(3, 15, 12)),
          { kind: "lasts", percentAtReset: 67 },
        );
        // 70% in 63h: the last 30% takes 27h, which is more than 21h: lasts, with 70 * 84 / 63 = 93.33, so 93%.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 70, reset), local(3, 15, 12)),
          { kind: "lasts", percentAtReset: 93 },
        );
        // 80% in 63h: the last 20% takes 15.75h. Saturday has 9h left and Sunday 09:00 to 15:45 gives the rest, so the limit ends 27h 45m from now.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 80, reset), local(3, 15, 12)),
          { kind: "runs-out", msLeft: 27 * HOUR + 45 * MINUTE },
        );
      });

      test("a work pace that reaches 100% exactly at the reset lasts", () => {
        // Thursday 13th 15:00: elapsed Monday to Wednesday 36h + Thursday 6h = 42h, and 42h remain.
        // 50% in 42h: the last 50% takes 42h, which is exactly the 42h that remain.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 50, reset), local(3, 13, 15)),
          { kind: "lasts", percentAtReset: 100 },
        );
      });

      test("a work pace a little above the exact boundary runs out", () => {
        // Thursday 13th 15:00, 42h elapsed. 50.01% in 42h: the last 49.99% takes 49.99 * 151_200_000 / 50.01 = 151_139_532.09 ms of work.
        // That is 60_467.91 ms less than the 42h of work that remain, and the 42h end on Sunday 21:00.
        // From Thursday 15:00 to Sunday 21:00 is 78h = 280_800_000 ms, so msLeft is 280_739_532.09 ms.
        const forecast = forecastUsage(
          windowResettingAt("Week", 50.01, reset),
          local(3, 13, 15),
        );
        assert.equal(forecast?.kind, "runs-out");
        assert.ok(
          forecast?.kind === "runs-out" &&
            Math.abs(forecast.msLeft - 280_739_532.09) <= 1,
          JSON.stringify(forecast),
        );
      });

      test("a work pace a little below the exact boundary lasts", () => {
        // Thursday 13th 15:00, 42h elapsed. 49.99% in 42h: 49.99 * 84 / 42 = 99.98, which rounds to 100.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 49.99, reset),
            local(3, 13, 15),
          ),
          { kind: "lasts", percentAtReset: 100 },
        );
        // 49% in 42h: 98%.
        assert.deepEqual(
          forecastUsage(windowResettingAt("Week", 49, reset), local(3, 13, 15)),
          { kind: "lasts", percentAtReset: 98 },
        );
      });

      test("exactly 5% of the working time elapsed gives a forecast", () => {
        // 5% of 84h is 4.2h. Monday 13:12 is exactly 4.2h after the start.
        // 4% in 4.2h: 4 * 84 / 4.2 = 80% at the reset.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 4, reset),
            local(3, 10, 13, 12),
          ),
          { kind: "lasts", percentAtReset: 80 },
        );
        // 10% in 4.2h, so the last 90% takes 37.8h of work: 7.8h on Monday, 24h on Tuesday and Wednesday, and 6h on Thursday.
        // That ends on Thursday 15:00, which is 73.8h after Monday 13:12.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 10, reset),
            local(3, 10, 13, 12),
          ),
          { kind: "runs-out", msLeft: 73.8 * HOUR },
        );
      });

      test("just under 5% of the working time elapsed gives no forecast", () => {
        assert.equal(
          forecastUsage(
            windowResettingAt("Week", 4, reset),
            local(3, 10, 13, 12) - 1,
          ),
          null,
        );
        assert.equal(
          forecastUsage(
            windowResettingAt("Week", 100, reset),
            local(3, 10, 13, 12) - 1,
          ),
          null,
        );
      });

      test("the early hours of the week give no forecast, because no work has passed", () => {
        // Monday before 09:00 has 0h of elapsed work, and Sunday night is before the window.
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
            local(3, 12, 15),
          ),
          { kind: "runs-out", msLeft: 0 },
        );
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 130, reset),
            local(3, 12, 15),
          ),
          { kind: "runs-out", msLeft: 0 },
        );
      });

      test("no forecast when the reset is further away than a week", () => {
        const now = local(3, 12, 15);
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
        // The window ends on Friday 14th 21:00 and starts on Friday 7th 21:00.
        // Friday 14th 15:00: 78h elapsed and 6h remain. 40% in 78h: 40 * 84 / 78 = 43.08, so 43%.
        // The last 60% would take 117h, which is more than 6h.
        assert.deepEqual(
          forecastUsage(
            windowResettingAt("Week", 40, local(3, 14, 21)),
            local(3, 14, 15),
          ),
          { kind: "lasts", percentAtReset: 43 },
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
    // Friday 28th 12:00 to Monday 31st 12:00: Friday 9h, Saturday 12h, Sunday 12h and Monday 3h.
    assert.equal(
      workTimeBetween(local(3, 28, 12), local(3, 31, 12)),
      36 * HOUR,
    );
    // The week from Monday 24th to Monday 31st is a full 84h, although the wall clock has only 167h.
    assert.equal(workTimeBetween(local(3, 24, 0), local(3, 31, 0)), WORK_WEEK);
  });

  test("addWorkTime across the change to summer time returns 10:00 local time, one hour less on the wall clock", () => {
    // Saturday 29th 20:00 + 2h: 1h until 21:00 and 1h on Sunday from 09:00, so Sunday 30th 10:00 local time.
    const result = addWorkTime(local(3, 29, 20), 2 * HOUR);
    assert.equal(result, local(3, 30, 10));
    // From Saturday 20:00 to Sunday 10:00 is 14h on the clock face, and 13h really passed because 02:00 became 03:00.
    assert.equal(result - local(3, 29, 20), 13 * HOUR);
  });

  test("addWorkTime across the change back to winter time takes one hour more on the wall clock", () => {
    // Saturday 25 October 20:00 + 2h ends on Sunday 26th 10:00 local time. On the clock face that is 14h and really 15h passed.
    const result = addWorkTime(local(10, 25, 20), 2 * HOUR);
    assert.equal(result, local(10, 26, 10));
    assert.equal(result - local(10, 25, 20), 15 * HOUR);
  });

  test("the week window across the change still holds 84h of work", () => {
    // The reset is Monday 31 March 09:00 summer time, which is 07:00 UTC. The start is 7 x 24h earlier, Monday 24th 07:00 UTC, which is 08:00 local time.
    // Wednesday 26th 15:00: Monday 12h, Tuesday 12h and Wednesday 6h are 30h elapsed, and 54h remain.
    const reset = local(3, 31, 9);
    assert.deepEqual(
      forecastUsage(windowResettingAt("Week", 80, reset), local(3, 26, 15)),
      { kind: "runs-out", msLeft: 19 * HOUR + 30 * MINUTE },
    );
    assert.deepEqual(
      forecastUsage(windowResettingAt("Week", 20, reset), local(3, 26, 15)),
      { kind: "lasts", percentAtReset: 56 },
    );
  });
});
