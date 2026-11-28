import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { eventually, type Hive, launchHive, row } from "./app";

describe("the left panel", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
  });
  after(async () => {
    await hive.close();
  });

  test("starts in the home folder of the user and shows it by name", async () => {
    const state = await hive.state();
    assert.equal(state.selectedFolder, hive.fixture.home);
    assert.equal(
      await hive.page.locator(".folder-row input").inputValue(),
      basename(hive.fixture.home),
    );
    assert.equal(
      await hive.page.locator(".folder-row .icon-button").count(),
      1,
    );
  });

  test("opens a folder that you type into the field, and only the button opens the picker", async () => {
    const { page } = hive;
    const field = page.locator(".folder-row input");
    // A click puts the full path in the field to edit. No picker opens, so the click does not hang.
    await field.click();
    assert.equal(await field.inputValue(), hive.fixture.home);
    assert.equal(
      await field.evaluate((input) => input === document.activeElement),
      true,
    );

    await field.fill(join(hive.fixture.home, "missing"));
    await field.press("Enter");
    await eventually(async () =>
      assert.equal(await field.getAttribute("aria-invalid"), "true"),
    );
    assert.equal((await hive.state()).selectedFolder, hive.fixture.home);
    // Escape drops the text, and the field shows the selected folder again.
    await field.press("Escape");
    await eventually(async () =>
      assert.equal(await field.inputValue(), basename(hive.fixture.home)),
    );

    const other = join(hive.fixture.home, ".claude");
    await field.click();
    await field.fill(other);
    await field.press("Enter");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedFolder, other),
    );
    assert.equal(await field.getAttribute("aria-invalid"), "false");

    // A tilde is the home folder.
    await field.click();
    await field.fill("~");
    await field.press("Enter");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedFolder, hive.fixture.home),
    );
    await row(page, "Fix login flow").waitFor();
  });

  test("puts the sessions of the last day in an open section and the older ones in a folded section", async () => {
    const { page } = hive;
    await row(page, "Fix login flow").waitFor();
    await row(page, "Refactor search").waitFor();
    await row(page, "Write release notes").waitFor();

    const recent = page.locator("h3.collapsible", { hasText: "Last 24 hours" });
    assert.match((await recent.textContent()) ?? "", /3/);
    assert.equal(await recent.getAttribute("aria-expanded"), "true");

    const older = page.locator("h3.collapsible", {
      hasText: "Older than 1 day",
    });
    assert.match((await older.textContent()) ?? "", /1/);
    assert.equal(await older.getAttribute("aria-expanded"), "false");
    assert.equal(await row(page, "Old idea").count(), 0);

    await older.click();
    await row(page, "Old idea").waitFor();
    await older.click();
    await eventually(async () =>
      assert.equal(await row(page, "Old idea").count(), 0),
    );
  });

  test("counts the working, waiting and ready sessions", async () => {
    const counts = hive.page.locator(".counts");
    await eventually(async () => {
      const text = (await counts.textContent()) ?? "";
      assert.match(text, /1\s*Working/);
      assert.match(text, /1\s*Waiting/);
      assert.match(text, /1\s*Ready/);
    });
  });

  test("colors the state dot of each session", async () => {
    const { page } = hive;
    await eventually(async () => {
      assert.equal(
        await row(page, "Fix login flow").locator(".dot.working").count(),
        1,
      );
      assert.equal(
        await row(page, "Refactor search").locator(".dot.waiting").count(),
        1,
      );
      assert.equal(
        await row(page, "Write release notes").locator(".dot.ready").count(),
        1,
      );
    });
  });

  test("finds a session by its name", async () => {
    const { page } = hive;
    const field = page.locator(".search input");
    await field.fill("release");
    await row(page, "Write release notes").waitFor();
    await eventually(async () =>
      assert.equal(await row(page, "Fix login flow").count(), 0),
    );
    assert.equal(await row(page, "Refactor search").count(), 0);
    await field.fill("");
  });

  test("finds a session by the text of its conversation and marks the result", async () => {
    const { page } = hive;
    const field = page.locator(".search input");
    await field.fill("zebra-quartz");
    const result = row(page, "Refactor search");
    await result.waitFor();
    assert.match(
      (await result.locator(".row-note").textContent()) ?? "",
      /found in the conversation/,
    );
    assert.equal(await row(page, "Fix login flow").count(), 0);
  });

  test("clears the search with Escape", async () => {
    const { page } = hive;
    const field = page.locator(".search input");
    await field.fill("zebra-quartz");
    await field.press("Escape");
    assert.equal(await field.inputValue(), "");
    await row(page, "Fix login flow").waitFor();
    await row(page, "Write release notes").waitFor();
  });

  test("says that no session matches", async () => {
    const { page } = hive;
    await page.locator(".search input").fill("no-such-text-anywhere");
    await page.getByText("No session found").waitFor();
    await page.locator(".search input").press("Escape");
  });

  test("offers to install the hooks when they are missing", async () => {
    const usage = hive.page.locator(".usage");
    await eventually(async () =>
      assert.match((await usage.textContent()) ?? "", /Install hooks/),
    );
    assert.match((await usage.textContent()) ?? "", /Usage limits/);
  });
});
