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

/** The pixels of one font size step: 100 for a mouse wheel on Windows and Linux, 20 on macOS. */
const STEP_PIXELS = process.platform === "darwin" ? 20 : 100;

/** One notch of the mouse wheel (a delta of 100 means one step) over the first pane, with the modifier key down. */
async function wheel(page: Page, deltaY: number): Promise<void> {
  await page.locator(".pane-body").first().hover();
  await page.keyboard.down(modifier);
  await page.mouse.wheel(0, (deltaY / 100) * STEP_PIXELS);
  await page.keyboard.up(modifier);
}

/**
 * Sends synthetic wheel events over the first pane. A real mouse wheel gives whole pixels only, and the events here carry
 * fractions like a Mac trackpad or a pinch does.
 */
async function sendWheel(
  page: Page,
  count: number,
  deltaY: number,
  keys: { ctrlKey: boolean; metaKey: boolean },
): Promise<void> {
  await page.locator(".pane-body").first().hover();
  await page.evaluate(
    ({ times, delta, ctrlKey, metaKey }) => {
      const target = document.querySelector(".pane-body") as HTMLElement;
      for (let i = 0; i < times; i++) {
        target.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: delta,
            deltaMode: 0,
            ctrlKey,
            metaKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { times: count, delta: deltaY, ...keys },
  );
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

  test("small wheel movements like a Mac sends change the size by the steps of the platform", async () => {
    const { page } = hive;
    // 14 events of 1.5 pixels are 21 pixels. A step is 20 pixels on macOS and 100 pixels on Windows and Linux.
    const notch = process.platform === "darwin" ? 20 : 100;
    const expected = Math.trunc((14 * 1.5) / notch);
    await page.keyboard.down(modifier);
    await sendWheel(page, 14, -1.5, {
      ctrlKey: modifier === "Control",
      metaKey: modifier === "Meta",
    });
    await page.keyboard.up(modifier);
    await page.waitForTimeout(300);
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 13 + expected),
    );
    await changeFontSize(page, -expected);
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 13),
    );
  });

  test("a pinch with small fractional movements changes the size", async () => {
    const { page } = hive;
    // A pinch has ctrlKey true and no key down of Control. 40 events of 0.5 pixels are 20 pixels, and a step is 8 pixels.
    await sendWheel(page, 40, -0.5, { ctrlKey: true, metaKey: false });
    await eventually(async () =>
      assert.equal((await hive.state()).fontSize, 15),
    );
    await changeFontSize(page, -2);
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
