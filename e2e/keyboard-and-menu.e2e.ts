import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row, tab } from "./app";
import { IDS } from "./fixture";

describe("the keyboard and the right-click menu", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
  });
  after(async () => {
    await hive.close();
  });

  test("opens a session from the list with the keyboard", async () => {
    const target = row(hive.page, "Write release notes");
    await target.focus();
    await hive.page.keyboard.press("Enter");
    await tab(hive.page, "Write release notes").waitFor();
    assert.equal((await hive.state()).selectedTabId, IDS.plain);
  });

  test("selects a tab with Enter or Space on its card", async () => {
    const { page } = hive;
    await row(page, "Fix login flow").click();
    await tab(page, "Fix login flow").waitFor();
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.login),
    );

    await card(page, "Write release notes").focus();
    await page.keyboard.press("Enter");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.plain),
    );

    await card(page, "Fix login flow").focus();
    await page.keyboard.press("Space");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.login),
    );
  });

  test("lets the tab key reach the cards and the tabs", async () => {
    const { page } = hive;
    const focusable = await page
      .locator(".card, .tab, .row")
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).tabIndex),
      );
    assert.ok(focusable.length >= 4);
    assert.ok(
      focusable.every((index) => index === 0),
      focusable.join(","),
    );
  });

  test("sets a color from the right-click menu and removes it again", async () => {
    const { page } = hive;
    await row(page, "Refactor search").click({ button: "right" });
    const menu = page.locator(".menu");
    await menu.waitFor();
    assert.equal(await menu.locator(".swatch").count(), 8);

    await menu.locator(".swatch").nth(1).click();
    await eventually(async () =>
      assert.ok((await hive.state()).tags[IDS.search], "the tag is saved"),
    );
    // The row gets a tint and a stripe in the color of the tag.
    await eventually(async () =>
      assert.ok(
        (
          (await row(page, "Refactor search").getAttribute("style")) ?? ""
        ).includes("box-shadow"),
      ),
    );
    assert.equal(await page.locator(".menu").count(), 0);

    await row(page, "Refactor search").click({ button: "right" });
    await page.locator(".menu .menu-item", { hasText: "No colour" }).click();
    await eventually(async () =>
      assert.equal((await hive.state()).tags[IDS.search], undefined),
    );
  });

  test("closes the menu with Escape", async () => {
    const { page } = hive;
    await row(page, "Refactor search").click({ button: "right" });
    await page.locator(".menu").waitFor();
    await page.keyboard.press("Escape");
    await eventually(async () =>
      assert.equal(await page.locator(".menu").count(), 0),
    );
  });

  test("offers go to tab, undock and close tab for an open session", async () => {
    const { page } = hive;
    await tab(page, "Fix login flow").click({ button: "right" });
    const items = page.locator(".menu .menu-item");
    await items.first().waitFor();
    const texts = (await items.allTextContents()).join(" | ");
    assert.match(texts, /Go to tab/);
    assert.match(texts, /Undock/i);
    assert.match(texts, /Close tab/);
    await page.keyboard.press("Escape");
  });

  test("opens the search field with the keyboard shortcut", async () => {
    const { page } = hive;
    await page.keyboard.press(
      `${process.platform === "darwin" ? "Meta" : "Control"}+F`,
    );
    await eventually(async () =>
      assert.equal(
        await page
          .locator(".search input")
          .evaluate((input) => input === document.activeElement),
        true,
      ),
    );
  });
});
