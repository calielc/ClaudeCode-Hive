import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row } from "./app";
import { createFixture, IDS, MINUTE, writeAgent } from "./fixture";

describe("the agents of a session", () => {
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
    writeAgent(fixture, IDS.login, {
      id: "a2",
      type: "Plan",
      description: "Plan the rewrite",
      model: "claude-haiku-5-5",
      done: false,
      prompt: "Plan the rewrite of the redirect",
    });
    writeAgent(fixture, IDS.login, {
      id: "a3",
      type: "general-purpose",
      description: "Count test files",
      model: "claude-sonnet-5-5",
      done: true,
      prompt: "Count the test files",
    });
    // A done agent that finished 45 minutes ago has left the list.
    writeAgent(fixture, IDS.login, {
      id: "a4",
      type: "Explore",
      description: "Expired survey",
      model: "claude-sonnet-5-5",
      done: true,
      prompt: "Survey the old code",
      ageMs: 45 * MINUTE,
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

  test("lists Main first and the running agents with their model", async () => {
    await eventually(async () =>
      assert.equal(await agentRow("Plan the rewrite").count(), 1),
    );
    const rows = await card(hive.page, "Fix login flow")
      .locator(".agent-row")
      .allTextContents();
    assert.match(rows[0] ?? "", /Main/);
    assert.ok(
      rows.some(
        (text) =>
          text.includes("Investigate the QR login flow") &&
          text.includes("Sonnet 5.5"),
      ),
      rows.join(" | "),
    );
    assert.ok(
      rows.some(
        (text) =>
          text.includes("Plan the rewrite") && text.includes("Haiku 5.5"),
      ),
      rows.join(" | "),
    );
    assert.equal(
      await agentRow("Plan the rewrite").locator(".dot.working").count(),
      1,
    );
    assert.equal(await agentRow("Main").count(), 1);
  });

  test("shows the type of an agent as an icon and not as text", async () => {
    const text = (await agentRow("Plan the rewrite").textContent()) ?? "";
    assert.ok(!text.includes("Plan:"), text);
    assert.equal(
      await agentRow("Plan the rewrite").locator(".agent-type").count(),
      1,
    );
  });

  test("folds the done agents and hides the ones that finished long ago", async () => {
    assert.equal(await agentRow("Count test files").count(), 0);
    const more = agentRow("+1 done");
    await more.waitFor();
    await more.click();
    await agentRow("Count test files").waitFor();
    assert.equal(
      await agentRow("Count test files").locator(".dot.ready").count(),
      1,
    );
    assert.equal(await agentRow("Expired survey").count(), 0);
    await agentRow("Hide done").click();
    await eventually(async () =>
      assert.equal(await agentRow("Count test files").count(), 0),
    );
  });

  test("replaces the terminal with the transcript of an agent and brings it back", async () => {
    const { page } = hive;
    assert.equal(await page.locator(".pane .terminal-container").count(), 1);

    await agentRow("Investigate the QR login flow").click();
    const transcript = page.locator(".agent-transcript");
    await transcript.waitFor();
    await eventually(async () => {
      const text = (await transcript.textContent()) ?? "";
      assert.ok(
        text.includes("Find every place that builds the QR address"),
        text,
      );
      assert.ok(text.includes("Read"), text);
    });
    assert.equal(await page.locator(".pane .terminal-container").count(), 0);
    assert.equal(
      await agentRow("Investigate the QR login flow")
        .getAttribute("class")
        .then((value) => value?.includes("active")),
      true,
    );
    // The id of an agent is the name of its file without the extension.
    assert.equal((await hive.state()).agentViews[IDS.login], "agent-a1");

    await agentRow("Main").click();
    await page.locator(".pane .terminal-container").waitFor();
    assert.equal(await transcript.count(), 0);
    assert.equal((await hive.state()).agentViews[IDS.login], null);
    // The terminal kept running while the transcript showed.
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.login), /HIVE-E2E-READY/),
    );
  });

  test("keeps the open agent in the list and lets you hide a done one with the cross", async () => {
    await agentRow("+1 done").click();
    const done = agentRow("Count test files");
    await done.waitFor();
    await done.locator(".agent-dismiss").click();
    await eventually(async () => assert.equal(await done.count(), 0));
    // Nothing is left to fold, so the row for the done agents is gone too.
    assert.equal(
      await card(hive.page, "Fix login flow")
        .locator(".agent-row.more")
        .count(),
      0,
    );
  });

  test("shows no agent list for a session without agents", async () => {
    await row(hive.page, "Write release notes").click();
    const plain = card(hive.page, "Write release notes");
    await plain.waitFor();
    assert.equal(await plain.locator(".agent-list").count(), 0);
  });
});
