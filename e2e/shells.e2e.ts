import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row } from "./app";
import {
  createFixture,
  IDS,
  MINUTE,
  shellOutputPath,
  writeAgent,
  writeShell,
} from "./fixture";

describe("the background shells of a session", () => {
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
    writeShell(fixture, IDS.login, {
      id: "s2",
      description: "Build the app",
      command: "npm run build",
      done: true,
      ageMs: 5 * MINUTE,
      output: "built ok",
    });
    // A done shell that finished 45 minutes ago has left the list.
    writeShell(fixture, IDS.login, {
      id: "s3",
      description: "Old job",
      command: "npm run old",
      done: true,
      ageMs: 45 * MINUTE,
      output: "old output",
    });
    hive = await launchHive({ fixture });
    await row(hive.page, "Fix login flow").click();
    await card(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  const agentRow = (text: string) =>
    card(hive.page, "Fix login flow").locator(".agent-row", { hasText: text });

  test("lists the agent of the fixture after Main", async () => {
    await eventually(async () =>
      assert.equal(await agentRow("Investigate the QR login flow").count(), 1),
    );
    const rows = await card(hive.page, "Fix login flow")
      .locator(".agent-row")
      .allTextContents();
    assert.match(rows[0] ?? "", /Main/);
    assert.match(rows[1] ?? "", /Investigate the QR login flow/);
    assert.equal(
      await agentRow("Investigate the QR login flow").getAttribute("data-kind"),
      null,
    );
  });

  test("lists the running shell after Main and the agent, as a row of its own kind", async () => {
    await agentRow("Serve the docs").waitFor();
    const rows = await card(hive.page, "Fix login flow")
      .locator(".agent-row")
      .allTextContents();
    assert.equal(rows.length, 4, rows.join(" | "));
    assert.match(rows[0] ?? "", /Main/);
    assert.match(rows[1] ?? "", /Investigate the QR login flow/);
    assert.match(rows[2] ?? "", /Serve the docs/);
    assert.match(rows[3] ?? "", /\+1 done/);

    const shell = agentRow("Serve the docs");
    assert.equal(await shell.getAttribute("data-kind"), "shell");
    assert.equal(
      await shell.locator(".agent-name").textContent(),
      "Serve the docs",
    );
    assert.equal(await shell.locator(".agent-model").count(), 0);
    assert.equal(await shell.locator(".dot.working").count(), 1);
    assert.equal(await shell.locator(".dot.ready").count(), 0);
  });

  test("folds the done shell with the done agents and hides the one that finished long ago", async () => {
    assert.equal(await agentRow("Build the app").count(), 0);
    assert.equal(await agentRow("Old job").count(), 0);
    const more = agentRow("+1 done");
    await more.click();
    await agentRow("Build the app").waitFor();
    assert.equal(
      await agentRow("Build the app").getAttribute("data-kind"),
      "shell",
    );
    assert.equal(
      await agentRow("Build the app").locator(".dot.ready").count(),
      1,
    );
    assert.equal(await agentRow("Old job").count(), 0);
    await agentRow("Hide done").click();
    await eventually(async () =>
      assert.equal(await agentRow("Build the app").count(), 0),
    );
  });

  test("replaces the terminal with the output of a shell, follows new output and brings the terminal back", async () => {
    const { page } = hive;
    assert.equal(await page.locator(".pane .terminal-container").count(), 1);

    await agentRow("Serve the docs").click();
    const output = page.locator('[data-testid="shell-output"]');
    await output.waitFor();
    await eventually(async () =>
      assert.equal(
        ((await output.textContent()) ?? "").trim(),
        "listening on 4000",
      ),
    );
    assert.equal(await page.locator(".pane .terminal-container").count(), 0);

    appendFileSync(
      shellOutputPath(hive.fixture, IDS.login, "s1"),
      "\nrequest GET /index 200",
    );
    await eventually(async () =>
      assert.equal(
        ((await output.textContent()) ?? "").trim(),
        "listening on 4000\nrequest GET /index 200",
      ),
    );

    await agentRow("Main").click();
    await page.locator(".pane .terminal-container").waitFor();
    assert.equal(await output.count(), 0);
    // The terminal kept running while the output showed.
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.login), /HIVE-E2E-READY/),
    );
  });

  test("lets you hide a done shell with the cross", async () => {
    await agentRow("+1 done").click();
    const done = agentRow("Build the app");
    await done.waitFor();
    await done.locator(".agent-dismiss").click();
    await eventually(async () => assert.equal(await done.count(), 0));
    assert.equal(
      await card(hive.page, "Fix login flow")
        .locator(".agent-row.more")
        .count(),
      0,
    );
  });

  test("shows a shell that starts after the launch without a reload", async () => {
    assert.equal(await agentRow("Watch the tests").count(), 0);
    writeShell(hive.fixture, IDS.login, {
      id: "s4",
      description: "Watch the tests",
      command: "npm test -- --watch",
      done: false,
      output: "watching",
    });
    await eventually(async () =>
      assert.equal(await agentRow("Watch the tests").count(), 1),
    );
    assert.equal(
      await agentRow("Watch the tests").getAttribute("data-kind"),
      "shell",
    );
    assert.equal(
      await agentRow("Watch the tests").locator(".dot.working").count(),
      1,
    );
  });
});
