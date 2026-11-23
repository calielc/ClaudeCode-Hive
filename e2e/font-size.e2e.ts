import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Page } from "playwright-core";
import { eventually, type Hive, launchHive, row, tab } from "./app";
import { IDS } from "./fixture";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

/** The font size that the xterm of a session draws with, read through the test seam. */
function drawnSize(page: Page, id: string): Promise<number | undefined> {
  return page.evaluate((sessionId) => {
    const seam = (
      window as unknown as {
        __hive: { terminalFontSize(id: string): number | undefined };
      }
    ).__hive;
    return seam.terminalFontSize(sessionId);
  }, id);
}

/** Calls the action of the same name through the test seam `window.__hive`. */
async function changeFontSize(page: Page, steps: number): Promise<void> {
  await page.evaluate((count) => {
    const seam = (
      window as unknown as { __hive: { changeFontSize(steps: number): void } }
    ).__hive;
    seam.changeFontSize(count);
  }, steps);
}

/** One notch of the mouse wheel over the first pane, with the modifier key down. */
async function wheel(page: Page, deltaY: number): Promise<void> {
  await page.locator(".pane-body").first().hover();
  await page.keyboard.down(modifier);
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up(modifier);
}

describe("the font size of the terminals", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
    await row(hive.page, "Fix login flow").click();
    await tab(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  test("Ctrl and the wheel make the font bigger and smaller", async () => {
    const { page } = hive;
    assert.equal((await hive.state()).fontSize, 13);
    await wheel(page, -100);
    await eventually(async () => {
      assert.equal((await hive.state()).fontSize, 14);
      assert.equal(await drawnSize(page, IDS.login), 14);
    });
    await wheel(page, 100);
    await wheel(page, 100);
    await eventually(async () => {
      assert.equal((await hive.state()).fontSize, 12);
      assert.equal(await drawnSize(page, IDS.login), 12);
    });
  });

  test("the wheel without Ctrl does not change the font", async () => {
    const { page } = hive;
    await page.locator(".pane-body").first().hover();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    assert.equal((await hive.state()).fontSize, 12);
  });

  test("the size stops at the limits", async () => {
    const { page } = hive;
    await changeFontSize(page, 100);
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 32),
    );
    await changeFontSize(page, -100);
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 8),
    );
    await changeFontSize(page, 5);
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 13),
    );
  });

  test("a terminal in its own window follows the change at once", async () => {
    const { page, app } = hive;
    await tab(page, "Fix login flow")
      .locator('.tab-close[title="Undock into its own window"]')
      .click();
    await eventually(async () => assert.equal(app.windows().length, 2));
    const other = app.windows().find((window) => window !== page);
    assert.ok(other);
    await other.locator(".xterm-rows").first().waitFor();
    await page.bringToFront();
    // The terminal is in the other window now. The page of the main window has no terminal to look at.
    await changeFontSize(page, 2);
    await eventually(async () => {
      assert.equal(await drawnSize(other, IDS.login), 15);
    });
    await other.close();
    await eventually(async () => assert.equal(app.windows().length, 1));
  });
});
