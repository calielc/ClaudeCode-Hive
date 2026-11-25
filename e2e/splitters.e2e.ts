import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Locator, Page } from "playwright-core";
import { eventually, type Hive, launchHive, row, tab } from "./app";

const SETTINGS_KEY = "hive.settings.v1";

/** The box of an element, or a failure when the element is not on the screen. */
async function box(locator: Locator) {
  const result = await locator.boundingBox();
  assert.ok(result, "the element has no box on the screen");
  return result;
}

function sidebarWidth(page: Page): Promise<number> {
  return box(page.locator(".sidebar")).then((result) => result.width);
}

/** Presses the mouse in the middle of an element, moves it by `deltaX` and `deltaY` pixels, and lets go. */
async function dragBy(
  page: Page,
  handle: Locator,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  const start = await box(handle);
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX / 2, y + deltaY / 2, { steps: 4 });
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 4 });
  await page.mouse.up();
}

/** The sidebar width that the app saved in the local storage, if any. */
function savedWidth(page: Page): Promise<number | undefined> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw).sidebarWidth as number | undefined)
      : undefined;
  }, SETTINGS_KEY);
}

/** Pane sizes are fractions of the window, so a drag lands within one pixel. */
function assertNear(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1,
    `${actual} is not near ${expected}`,
  );
}

async function chooseLayout(page: Page, title: string): Promise<void> {
  await page.locator(".layout-current").click();
  await page.locator(`.layout-menu [aria-label="${title}"]`).click();
}

describe("the splitter of the left panel", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
    await row(hive.page, "Fix login flow").click();
    await tab(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  test("starts at 320 pixels, with the splitter between the panel and the main area", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    assert.equal(await splitter.count(), 1);
    assert.equal(await sidebarWidth(page), 320);
    const sidebar = await box(page.locator(".sidebar"));
    const main = await box(page.locator(".main"));
    const handle = await box(splitter);
    assert.ok(handle.x + handle.width >= sidebar.x + sidebar.width - 1);
    assert.ok(handle.x <= main.x + 1);
    assert.ok(
      (await page.evaluate(() => window.innerWidth)) >= 900,
      "the window is too narrow for the 600 pixel limit test",
    );
  });

  test("dragging to the right and to the left changes the width by the distance moved", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    await dragBy(page, splitter, 83, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 403));
    await dragBy(page, splitter, -157, 11);
    await eventually(async () => assert.equal(await sidebarWidth(page), 246));
    assert.equal(
      (await box(page.locator(".main"))).width,
      (await page.evaluate(() => window.innerWidth)) - 246,
    );
  });

  test("the width stops at 200 on the left, one pixel past the limit and far past it", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    // From 246 the splitter moves 46 pixels to 200 exactly, then 1 pixel past it.
    await dragBy(page, splitter, -46, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 200));
    await dragBy(page, splitter, -1, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 200));
    await dragBy(page, splitter, 30, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 230));
    await dragBy(page, splitter, -2000, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 200));
  });

  test("the width stops at 600 on the right, one pixel past the limit and far past it", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    await dragBy(page, splitter, 399, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 599));
    await dragBy(page, splitter, 1, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 600));
    await dragBy(page, splitter, 1, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 600));
  });

  test("the width goes to the local storage and survives a reload", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    await dragBy(page, splitter, -213, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 387));
    await eventually(async () => assert.equal(await savedWidth(page), 387));
    await page.reload();
    await page.locator(".sidebar").waitFor();
    assert.equal(await sidebarWidth(page), 387);
    assert.equal(await savedWidth(page), 387);
  });

  test("a double click puts the width back to 320 and saves it", async () => {
    const { page } = hive;
    await page.locator('[data-testid="sidebar-splitter"]').dblclick();
    await eventually(async () => assert.equal(await sidebarWidth(page), 320));
    await eventually(async () => assert.equal(await savedWidth(page), 320));
  });

  test("a hidden panel leaves no splitter and no gap, and the saved width comes back", async () => {
    const { page } = hive;
    const splitter = page.locator('[data-testid="sidebar-splitter"]');
    await dragBy(page, splitter, 141, 0);
    await eventually(async () => assert.equal(await sidebarWidth(page), 461));
    await page.locator(".sidebar-toggle").click();
    await eventually(async () => assert.equal(await splitter.count(), 0));
    const innerWidth = await page.evaluate(() => window.innerWidth);
    const main = await box(page.locator(".main"));
    assert.equal(main.x, 0);
    assert.equal(main.width, innerWidth);
    await page.locator(".sidebar-toggle").click();
    await eventually(async () => assert.equal(await sidebarWidth(page), 461));
    assert.equal(await splitter.count(), 1);
    assert.equal(await savedWidth(page), 461);
  });
});

describe("the splitters between the panes", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
    await row(hive.page, "Fix login flow").click();
    await tab(hive.page, "Fix login flow").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  /** The grid cell of a pane splitter. Its width or height is the thickness of the track. */
  function track(page: Page, axis: "x" | "y"): Locator {
    return page.locator(".panes .slot", {
      has: page.locator(`.splitter-${axis}`),
    });
  }

  test("side by side: the track is 4 pixels wide and a drag moves the divider", async () => {
    const { page } = hive;
    await chooseLayout(page, "Side by side (1×2)");
    const cell = track(page, "x");
    await cell.waitFor();
    assert.equal((await box(cell)).width, 4);
    const startPosition = (await box(cell)).x;
    await dragBy(page, page.locator(".splitter-x"), 90, 0);
    await eventually(async () =>
      assertNear((await box(cell)).x, startPosition + 90),
    );
    assert.equal((await box(cell)).width, 4);
  });

  test("stacked: the track is 4 pixels high and a drag moves the divider", async () => {
    const { page } = hive;
    await chooseLayout(page, "Stacked (2×1)");
    const cell = track(page, "y");
    await cell.waitFor();
    assert.equal(await track(page, "x").count(), 0);
    assert.equal((await box(cell)).height, 4);
    const startPosition = (await box(cell)).y;
    await dragBy(page, page.locator(".splitter-y"), 0, -64);
    await eventually(async () =>
      assertNear((await box(cell)).y, startPosition - 64),
    );
    assert.equal((await box(cell)).height, 4);
  });

  test("grid: both tracks are 4 pixels and each drag moves its own divider", async () => {
    const { page } = hive;
    await chooseLayout(page, "Grid (2×2)");
    const vertical = track(page, "x").first();
    const horizontal = track(page, "y").first();
    await vertical.waitFor();
    await horizontal.waitFor();
    assert.equal((await box(vertical)).width, 4);
    assert.equal((await box(horizontal)).height, 4);
    const startX = (await box(vertical)).x;
    const startY = (await box(horizontal)).y;
    await dragBy(page, page.locator(".splitter-x").first(), -37, 0);
    await eventually(async () =>
      assertNear((await box(vertical)).x, startX - 37),
    );
    await dragBy(page, page.locator(".splitter-y").first(), 0, 52);
    await eventually(async () =>
      assertNear((await box(horizontal)).y, startY + 52),
    );
    assert.equal((await box(vertical)).width, 4);
    assert.equal((await box(horizontal)).height, 4);
  });
});
