import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row } from "./app";
import {
  bgCronCreate,
  bgMonitorEvent,
  bgMonitorStart,
  bgMonitorStop,
  bgWakeup,
  createFixture,
  IDS,
  MINUTE,
  writeAgent,
  writeBackground,
  writeShell,
} from "./fixture";

const NEXT_RUN = /^next run (\w{3} \d{1,2} )?\d{2}:\d{2}$/;

describe("the monitors and cron jobs of a session", () => {
  let hive: Hive;

  before(async () => {
    const fixture = createFixture();
    writeAgent(fixture, IDS.login, {
      id: "a1",
      type: "Explore",
      description: "Investigate the QR login flow",
      model: "claude-sonnet-5-5",
      done: false,
      prompt: "Find every place that builds the QR address",
    });
    writeShell(fixture, IDS.login, {
      id: "s1",
      description: "Serve the docs",
      command: "npm run docs",
      done: false,
      output: "listening on 4000",
    });
    const now = Date.now();
    writeBackground(fixture, IDS.login, [
      ...bgMonitorStart({
        task: "mon1",
        description: "Grafana check timers",
        command: "tail -f timers.log",
        at: now - 3 * MINUTE,
      }),
      ...bgMonitorEvent("mon1", "grafana check due (14:26)", now - 2 * MINUTE),
      ...bgMonitorEvent("mon1", "grafana check due (14:29)", now - MINUTE),
      ...bgCronCreate({
        job: "cron1",
        cron: "*/5 * * * *",
        prompt: "/nudge-mr-reviews",
        recurring: true,
        at: now - 2 * MINUTE,
      }),
    ]);
    hive = await launchHive({ fixture });
    await row(hive.page, "Fix login flow").click();
    await card(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  const rows = () => card(hive.page, "Fix login flow").locator(".agent-row");
  const agentRow = (text: string) => rows().filter({ hasText: text });

  test("lists the monitor and the cron job after the agent and the shell, each with its kind, icon, title and note", async () => {
    await agentRow("Grafana check timers").waitFor();
    await agentRow("/nudge-mr-reviews").waitFor();
    const texts = await rows().allTextContents();
    assert.equal(texts.length, 5, texts.join(" | "));
    assert.match(texts[0] ?? "", /Main/);
    assert.match(texts[1] ?? "", /Investigate the QR login flow/);
    assert.match(texts[2] ?? "", /Serve the docs/);
    assert.match(texts[3] ?? "", /Grafana check timers/);
    assert.match(texts[4] ?? "", /\/nudge-mr-reviews/);

    const monitor = agentRow("Grafana check timers");
    assert.equal(await monitor.getAttribute("data-kind"), "monitor");
    assert.equal(await monitor.locator(".agent-type").textContent(), "◉");
    assert.equal(
      await monitor.locator(".agent-name").textContent(),
      "Grafana check timers",
    );
    assert.equal(
      await monitor.locator(".agent-note").textContent(),
      "2 events",
    );
    assert.equal(await monitor.locator(".dot.working").count(), 1);

    const cron = agentRow("/nudge-mr-reviews");
    assert.equal(await cron.getAttribute("data-kind"), "cron");
    assert.equal(await cron.locator(".agent-type").textContent(), "⏲");
    assert.match(
      (await cron.locator(".agent-note").textContent()) ?? "",
      NEXT_RUN,
    );
    assert.equal(await cron.locator(".dot.working").count(), 1);
  });

  test("keeps the agent and the shell rows as they were, without a clash of ids", async () => {
    assert.equal(
      await agentRow("Investigate the QR login flow").getAttribute("data-kind"),
      null,
    );
    assert.equal(
      await agentRow("Serve the docs").getAttribute("data-kind"),
      "shell",
    );
    assert.equal(
      await agentRow("Serve the docs").locator(".agent-note").count(),
      0,
    );

    await agentRow("Serve the docs").click();
    const output = hive.page.locator('[data-testid="shell-output"]');
    await output.waitFor();
    await eventually(async () =>
      assert.equal(
        ((await output.textContent()) ?? "").trim(),
        "listening on 4000",
      ),
    );
    assert.equal(
      await hive.page.locator('[data-testid="background-detail"]').count(),
      0,
    );
    await agentRow("Main").click();
    await hive.page.locator(".pane .terminal-container").waitFor();
  });

  test("shows the detail of a monitor in the pane, follows a new event and brings the terminal back", async () => {
    const { page } = hive;
    await agentRow("Grafana check timers").click();
    const detail = page.locator('[data-testid="background-detail"]');
    await detail.waitFor();
    await eventually(async () => {
      const text = (await detail.textContent()) ?? "";
      assert.match(text, /Monitor: Grafana check timers/);
      assert.match(text, /Command: tail -f timers\.log/);
      assert.match(text, /Events: 2/);
      assert.match(text, /grafana check due \(14:29\)/);
    });
    assert.equal(await page.locator(".pane .terminal-container").count(), 0);

    writeBackground(
      hive.fixture,
      IDS.login,
      bgMonitorEvent("mon1", "grafana check due (14:31)"),
    );
    await eventually(async () => {
      assert.match((await detail.textContent()) ?? "", /Events: 3/);
      assert.equal(
        await agentRow("Grafana check timers")
          .locator(".agent-note")
          .textContent(),
        "3 events",
      );
    });
    assert.match(
      (await detail.textContent()) ?? "",
      /grafana check due \(14:31\)/,
    );

    await agentRow("Main").click();
    await page.locator(".pane .terminal-container").waitFor();
    assert.equal(await detail.count(), 0);
  });

  test("shows the detail of a cron job with the expression, the prompt and the next run", async () => {
    await agentRow("/nudge-mr-reviews").click();
    const detail = hive.page.locator('[data-testid="background-detail"]');
    await detail.waitFor();
    await eventually(async () => {
      const text = (await detail.textContent()) ?? "";
      assert.match(text, /^Cron: \*\/5 \* \* \* \*$/m);
      assert.match(text, /^Prompt: \/nudge-mr-reviews$/m);
      assert.match(text, /^Type: recurring$/m);
      assert.match(text, /^Next run: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/m);
    });
    await agentRow("Main").click();
  });

  test("dims the monitor when a TaskStop ends it, and keeps it while it is open", async () => {
    const monitor = agentRow("Grafana check timers");
    await monitor.click();
    writeBackground(hive.fixture, IDS.login, bgMonitorStop("mon1"));
    await eventually(async () => {
      assert.match((await monitor.getAttribute("class")) ?? "", /\bdone\b/);
      assert.equal(
        await monitor.locator(".agent-note").textContent(),
        "stopped",
      );
      assert.equal(await monitor.locator(".dot.ready").count(), 1);
    });
    assert.equal(await monitor.getAttribute("data-kind"), "monitor");
    await eventually(async () =>
      assert.match(
        (await hive.page
          .locator('[data-testid="background-detail"]')
          .textContent()) ?? "",
        /^Status: ended \(stopped\)$/m,
      ),
    );
    // The cron job still runs and is not dimmed.
    assert.doesNotMatch(
      (await agentRow("/nudge-mr-reviews").getAttribute("class")) ?? "",
      /\bdone\b/,
    );
  });

  test("shows a monitor that starts after the launch without a reload", async () => {
    assert.equal(await agentRow("Late watch").count(), 0);
    writeBackground(
      hive.fixture,
      IDS.login,
      bgMonitorStart({
        task: "mon2",
        description: "Late watch",
        expiresMin: null,
      }),
    );
    await eventually(async () =>
      assert.equal(await agentRow("Late watch").count(), 1),
    );
    assert.equal(
      await agentRow("Late watch").getAttribute("data-kind"),
      "monitor",
    );
    assert.equal(
      await agentRow("Late watch").locator(".agent-note").textContent(),
      "0 events",
    );
  });
});

describe("the wake-up of a session", () => {
  let hive: Hive;

  before(async () => {
    const fixture = createFixture();
    writeBackground(
      fixture,
      IDS.login,
      bgWakeup({
        id: "toolu_w1",
        seconds: 14,
        reason: "Waiting on 3 more agents",
      }),
    );
    hive = await launchHive({ fixture });
    await row(hive.page, "Fix login flow").click();
    await card(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  const wake = () =>
    card(hive.page, "Fix login flow").locator(".agent-row", {
      hasText: "Waiting on 3 more agents",
    });

  test("shows a pending wake-up with its kind, icon, reason and a note that counts down", async () => {
    await wake().waitFor();
    assert.equal(await wake().getAttribute("data-kind"), "wakeup");
    assert.equal(await wake().locator(".agent-type").textContent(), "⏰");
    assert.equal(await wake().locator(".dot.working").count(), 1);
    const note = wake().locator(".agent-note");
    const first = (await note.textContent()) ?? "";
    assert.match(first, /^wakes in \d+s$/);
    await eventually(async () => {
      const current = (await note.textContent()) ?? "";
      assert.match(current, /^wakes in \d+s$/);
      assert.notEqual(current, first);
    }, 8_000);
  });

  test("shows the detail with the reason, the loop text instead of the sentinel, the due time and the time left", async () => {
    await wake().click();
    const detail = hive.page.locator('[data-testid="background-detail"]');
    await detail.waitFor();
    await eventually(async () => {
      const text = (await detail.textContent()) ?? "";
      assert.match(text, /^Wake-up: Waiting on 3 more agents$/m);
      assert.match(text, /^Prompt: autonomous loop$/m);
      assert.match(text, /^Due: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/m);
      assert.match(text, /^Time left: /m);
    });
    assert.doesNotMatch(
      (await detail.textContent()) ?? "",
      /autonomous-loop-dynamic/,
    );
  });

  test("dims the wake-up and says fired when its time has passed", async () => {
    await eventually(async () => {
      assert.match((await wake().getAttribute("class")) ?? "", /\bdone\b/);
      assert.equal(await wake().locator(".agent-note").textContent(), "fired");
      assert.equal(await wake().locator(".dot.ready").count(), 1);
    }, 25_000);
    await eventually(async () =>
      assert.match(
        (await hive.page
          .locator('[data-testid="background-detail"]')
          .textContent()) ?? "",
        /^Status: ended \(fired\)$/m,
      ),
    );
  });
});
