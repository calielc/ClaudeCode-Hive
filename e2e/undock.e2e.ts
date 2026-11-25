import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { card, eventually, type Hive, launchHive, row, tab } from "./app";
import { IDS } from "./fixture";

const LOGIN = "Fix login flow";
const SEARCH = "Refactor search";
const NOTES = "Write release notes";
const FAKE_CLAUDE = join(process.cwd(), "e2e", "fake-claude.cjs").replace(
  /\\/g,
  "/",
);
const UNDOCK = '.tab-close[title="Undock into its own window"]';

/** Starts Hive and opens the three fake sessions in the order login, search, notes. */
async function openThree(): Promise<Hive> {
  const hive = await launchHive({
    // The session id in the command line lets a test find the process of a session with `ps`.
    env: { HIVE_PTY_COMMAND: `node ${FAKE_CLAUDE} {id}` },
  });
  for (const title of [LOGIN, SEARCH, NOTES]) {
    await row(hive.page, title).click();
    await tab(hive.page, title).waitFor();
  }
  await eventually(async () =>
    assert.equal((await hive.state()).tabs.length, 3),
  );
  return hive;
}

/** Runs one test with its own Hive, so no test depends on the state that another one left. */
function hiveTest(name: string, body: (hive: Hive) => Promise<void>): void {
  test(name, async () => {
    const hive = await openThree();
    try {
      await body(hive);
    } finally {
      await hive.close();
    }
  });
}

/** The command lines of the running processes of one session. Empty when the process is gone. */
function sessionProcesses(id: string): string[] {
  // Windows has no `ps`, so it asks for the command lines of the processes through PowerShell.
  const listing =
    process.platform === "win32"
      ? execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }",
          ],
          { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        )
      : execFileSync("ps", ["-axo", "command"], { encoding: "utf8" });
  return listing
    .split("\n")
    .filter((line) => line.includes(`fake-claude.cjs ${id}`));
}

/** The titles of the tabs in the top bar, left to right. */
function barTitles(page: Page): Promise<string[]> {
  return page.locator(".tabs .tab .tab-title").allTextContents();
}

/** Undocks a session with the button of its tab and returns its window. */
async function undockTab(hive: Hive, title: string): Promise<Page> {
  await tab(hive.page, title).locator(UNDOCK).click();
  return windowOf(hive, title);
}

/** The window of an undocked session, found by the title in its bar. */
async function windowOf(hive: Hive, title: string): Promise<Page> {
  let found: Page | undefined;
  await eventually(async () => {
    for (const window of hive.app.windows()) {
      if (window === hive.page) {
        continue;
      }
      const text = await window
        .locator(".undocked .pane-title")
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (text === title) {
        found = window;
      }
    }
    assert.ok(found, `no undocked window for ${title}`);
  });
  return found as Page;
}

function dockButton(window: Page) {
  return window.getByRole("button", { name: "Dock", exact: true });
}

/** Clicks Dock. The click closes the window, so Playwright can report the closed page while the click ends. That is the wanted result. */
async function clickDock(window: Page): Promise<void> {
  await dockButton(window)
    .click()
    .catch((error: unknown) => {
      if (!String(error).includes("has been closed")) {
        throw error;
      }
    });
}

/** Calls an action of the test seam `window.__hive`. */
function seam(
  page: Page,
  action: "cycleTabs",
  argument: boolean,
): Promise<void> {
  return page.evaluate(
    ({ name, value }) =>
      (
        window as unknown as { __hive: Record<string, (v: boolean) => void> }
      ).__hive[name]?.(value),
    { name: action, value: argument },
  );
}

hiveTest(
  "undocking a tab removes it from the top bar and keeps its card in the left panel",
  async (hive) => {
    const { page, app } = hive;
    const window = await undockTab(hive, SEARCH);

    await eventually(async () => {
      assert.deepEqual(await barTitles(page), [LOGIN, NOTES]);
      assert.deepEqual((await hive.state()).detached, [IDS.search]);
    });
    assert.equal(await page.locator(".tabs .tab").count(), 2);
    assert.equal(await tab(page, SEARCH).count(), 0);
    assert.equal(
      await page.locator('.tabs [title="In its own window"]').count(),
      0,
    );
    assert.ok(
      !((await page.locator(".tabs").textContent()) ?? "").includes("▣"),
    );
    assert.deepEqual(
      (await hive.state()).tabs.map((item) => item.id),
      [IDS.login, IDS.search, IDS.plain],
    );
    assert.equal(await card(page, SEARCH).count(), 1);
    assert.equal(await card(page, SEARCH).locator(".window-mark").count(), 1);
    assert.equal(await row(page, SEARCH).count(), 0);
    assert.equal(app.windows().length, 2);

    await window.locator(".xterm-rows").first().waitFor();
    await dockButton(window).waitFor();
    assert.equal(
      await window.getByRole("button", { name: "Next display" }).count(),
      0,
    );
    assert.equal(await window.getByText("Next display").count(), 0);
  },
);

hiveTest(
  "the Dock button of the window puts the tab back at its place, for the first, the middle and the last tab",
  async (hive) => {
    const { page, app } = hive;
    for (const title of [SEARCH, LOGIN, NOTES]) {
      const window = await undockTab(hive, title);
      await eventually(async () =>
        assert.equal(await tab(page, title).count(), 0),
      );
      await clickDock(window);
      await eventually(async () => {
        assert.deepEqual(await barTitles(page), [LOGIN, SEARCH, NOTES]);
        assert.deepEqual((await hive.state()).detached, []);
        assert.equal(app.windows().length, 1);
      });
      assert.equal(await card(page, title).locator(".window-mark").count(), 0);
      assert.deepEqual(
        (await hive.state()).tabs.map((item) => item.id),
        [IDS.login, IDS.search, IDS.plain],
      );
    }
  },
);

hiveTest(
  "closing the undocked window closes the session and leaves the other tabs and windows alone",
  async (hive) => {
    const { page, app } = hive;
    const searchWindow = await undockTab(hive, SEARCH);
    const loginWindow = await undockTab(hive, LOGIN);
    await eventually(async () => {
      assert.deepEqual(await barTitles(page), [NOTES]);
      assert.equal(sessionProcesses(IDS.search).length > 0, true);
    });

    await searchWindow.close();

    await eventually(async () => {
      assert.equal(app.windows().length, 2);
      assert.equal(await card(page, SEARCH).count(), 0);
      assert.deepEqual(sessionProcesses(IDS.search), []);
    });
    await row(page, SEARCH).waitFor();
    const state = await hive.state();
    assert.deepEqual(
      state.tabs.map((item) => item.id),
      [IDS.login, IDS.plain],
    );
    assert.deepEqual(state.detached, [IDS.login]);
    assert.ok(!state.slots.includes(IDS.search));
    assert.deepEqual(await barTitles(page), [NOTES]);
    assert.equal(await card(page, LOGIN).locator(".window-mark").count(), 1);
    assert.equal(await card(page, NOTES).count(), 1);
    assert.equal(loginWindow.isClosed(), false);
    assert.equal(sessionProcesses(IDS.login).length > 0, true);
    assert.equal(sessionProcesses(IDS.plain).length > 0, true);
  },
);

hiveTest(
  "closing the undocked window of the middle tab keeps the other two tabs in order",
  async (hive) => {
    const { page, app } = hive;
    const window = await undockTab(hive, SEARCH);
    await eventually(async () =>
      assert.equal(await tab(page, SEARCH).count(), 0),
    );
    await window.close();
    await eventually(async () => {
      assert.deepEqual(await barTitles(page), [LOGIN, NOTES]);
      assert.equal(app.windows().length, 1);
      assert.equal(await card(page, SEARCH).count(), 0);
    });
    const state = await hive.state();
    assert.deepEqual(
      state.tabs.map((item) => item.id),
      [IDS.login, IDS.plain],
    );
    assert.deepEqual(state.detached, []);
    assert.deepEqual(sessionProcesses(IDS.search), []);
  },
);

hiveTest(
  "closing the window of the only open session leaves No session open",
  async (hive) => {
    const { page, app } = hive;
    for (const title of [LOGIN, NOTES]) {
      await tab(page, title)
        .locator('.tab-close[title="Close session"]')
        .click();
      await eventually(async () =>
        assert.equal(await tab(page, title).count(), 0),
      );
    }
    const window = await undockTab(hive, SEARCH);
    await page.locator(".no-session", { hasText: "No session open" }).waitFor();

    await window.close();

    await eventually(async () => {
      assert.equal(app.windows().length, 1);
      assert.equal((await hive.state()).tabs.length, 0);
    });
    await page.locator(".no-session", { hasText: "No session open" }).waitFor();
    assert.equal(await page.locator(".card").count(), 0);
    assert.equal(await page.locator(".tabs .tab").count(), 0);
    assert.deepEqual(sessionProcesses(IDS.search), []);
    await row(page, SEARCH).waitFor();
  },
);

hiveTest(
  "closing every undocked window one by one closes every session",
  async (hive) => {
    const { page, app } = hive;
    const windows = [
      await undockTab(hive, LOGIN),
      await undockTab(hive, SEARCH),
      await undockTab(hive, NOTES),
    ];
    await eventually(async () =>
      assert.equal((await hive.state()).detached.length, 3),
    );
    const ids = [IDS.login, IDS.search, IDS.plain];
    for (const [index, window] of windows.entries()) {
      await window.close();
      await eventually(async () => {
        assert.equal((await hive.state()).tabs.length, 2 - index);
        assert.equal(app.windows().length, 3 - index);
      });
      assert.deepEqual(sessionProcesses(ids[index] as string), []);
    }
    const state = await hive.state();
    assert.deepEqual(state.detached, []);
    assert.deepEqual(state.tabIds ?? [], []);
    assert.equal(await page.locator(".card").count(), 0);
    await page.locator(".no-session", { hasText: "No session open" }).waitFor();
  },
);

hiveTest(
  "closing one undocked window and then undocking another keeps the state consistent",
  async (hive) => {
    const { page, app } = hive;
    const searchWindow = await undockTab(hive, SEARCH);
    await searchWindow.close();
    await eventually(async () =>
      assert.deepEqual(await barTitles(page), [LOGIN, NOTES]),
    );

    const loginWindow = await undockTab(hive, LOGIN);
    await eventually(async () => {
      assert.deepEqual(await barTitles(page), [NOTES]);
      assert.deepEqual((await hive.state()).detached, [IDS.login]);
      assert.equal(app.windows().length, 2);
    });
    await clickDock(loginWindow);
    await eventually(async () => {
      assert.deepEqual(await barTitles(page), [LOGIN, NOTES]);
      assert.deepEqual((await hive.state()).detached, []);
      assert.equal(app.windows().length, 1);
    });
    assert.deepEqual(
      (await hive.state()).tabs.map((item) => item.id),
      [IDS.login, IDS.plain],
    );
    assert.equal(sessionProcesses(IDS.login).length > 0, true);
  },
);

hiveTest(
  "the Dock button keeps the session alive and its process running",
  async (hive) => {
    const window = await undockTab(hive, SEARCH);
    await clickDock(window);
    await eventually(async () =>
      assert.deepEqual(await barTitles(hive.page), [LOGIN, SEARCH, NOTES]),
    );
    await hive.page.waitForTimeout(300);
    assert.equal(sessionProcesses(IDS.search).length > 0, true);
    assert.equal((await hive.state()).tabs.length, 3);
  },
);

hiveTest("the card menu Dock puts the tab back at its place", async (hive) => {
  const { page, app } = hive;
  await undockTab(hive, SEARCH);
  await eventually(async () =>
    assert.equal(await tab(page, SEARCH).count(), 0),
  );
  await card(page, SEARCH).click({ button: "right" });
  const items = page.locator(".menu .menu-item");
  await items.first().waitFor();
  const texts = (await items.allTextContents()).join(" | ");
  assert.match(texts, /Dock into the main window/);
  assert.doesNotMatch(texts, /Undock/);
  await page
    .locator(".menu .menu-item", { hasText: "Dock into the main window" })
    .click();
  await eventually(async () => {
    assert.deepEqual(await barTitles(page), [LOGIN, SEARCH, NOTES]);
    assert.deepEqual((await hive.state()).detached, []);
    assert.equal(app.windows().length, 1);
  });
});

hiveTest(
  "undocking the selected tab selects a docked tab that shows in the pane",
  async (hive) => {
    const { page } = hive;
    await tab(page, SEARCH).click();
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.search),
    );
    await undockTab(hive, SEARCH);
    await eventually(async () => {
      const state = await hive.state();
      assert.ok(
        state.selectedTabId === IDS.login || state.selectedTabId === IDS.plain,
        `selected ${state.selectedTabId}`,
      );
      assert.equal(state.slots[0], state.selectedTabId);
      assert.deepEqual(state.detached, [IDS.search]);
    });
    assert.equal(await page.locator(".tabs .tab.selected").count(), 1);
  },
);

hiveTest(
  "undocking every tab leaves an empty bar and No session open, and the cards stay",
  async (hive) => {
    const { page } = hive;
    const windows: Record<string, Page> = {};
    for (const title of [LOGIN, SEARCH, NOTES]) {
      windows[title] = await undockTab(hive, title);
    }
    await eventually(async () =>
      assert.equal(await page.locator(".tabs .tab").count(), 0),
    );
    await page.locator(".no-session", { hasText: "No session open" }).waitFor();
    const state = await hive.state();
    assert.equal(state.tabs.length, 3);
    assert.equal(state.detached.length, 3);
    assert.equal(await page.locator(".card").count(), 3);
    assert.equal(await page.locator(".card .window-mark").count(), 3);

    await clickDock(windows[SEARCH] as Page);
    await eventually(async () =>
      assert.deepEqual(await barTitles(page), [SEARCH]),
    );
    assert.equal(await page.locator(".no-session").count(), 0);
    assert.equal((await hive.state()).slots[0], IDS.search);
  },
);

hiveTest(
  "clicking the card of an undocked session keeps it undocked and in the list",
  async (hive) => {
    const { page, app } = hive;
    await undockTab(hive, SEARCH);
    await eventually(async () =>
      assert.equal(await tab(page, SEARCH).count(), 0),
    );
    await card(page, SEARCH).click();
    await page.waitForTimeout(300);
    assert.deepEqual((await hive.state()).detached, [IDS.search]);
    assert.equal(app.windows().length, 2);
    assert.equal(await card(page, SEARCH).count(), 1);
    assert.deepEqual(await barTitles(page), [LOGIN, NOTES]);
  },
);

hiveTest("Ctrl+Tab cycling skips a tab in its own window", async (hive) => {
  const { page } = hive;
  await tab(page, LOGIN).click();
  await eventually(async () =>
    assert.equal((await hive.state()).selectedTabId, IDS.login),
  );
  await undockTab(hive, SEARCH);
  await eventually(async () =>
    assert.equal(await tab(page, SEARCH).count(), 0),
  );
  await page.bringToFront();

  await seam(page, "cycleTabs", false);
  await eventually(async () =>
    assert.equal((await hive.state()).selectedTabId, IDS.plain),
  );
  await seam(page, "cycleTabs", false);
  await eventually(async () =>
    assert.equal((await hive.state()).selectedTabId, IDS.login),
  );
  await seam(page, "cycleTabs", true);
  await eventually(async () =>
    assert.equal((await hive.state()).selectedTabId, IDS.plain),
  );
  await seam(page, "cycleTabs", true);
  await eventually(async () =>
    assert.equal((await hive.state()).selectedTabId, IDS.login),
  );
  assert.deepEqual((await hive.state()).detached, [IDS.search]);
});

hiveTest(
  "the preload has no nextDisplay method, in the main window and in an undocked window",
  async (hive) => {
    const keys = (page: Page): Promise<string[]> =>
      page.evaluate(() =>
        Object.keys(
          (window as unknown as { hive: { windows: object } }).hive.windows,
        ).sort(),
      );
    const undocked = await undockTab(hive, SEARCH);
    for (const page of [hive.page, undocked]) {
      const names = await keys(page);
      assert.ok(!names.includes("nextDisplay"), names.join(","));
      for (const name of ["undock", "dock", "onDockedBack"]) {
        assert.ok(
          names.includes(name),
          `${name} is missing: ${names.join(",")}`,
        );
      }
    }
  },
);

hiveTest(
  "closing an undocked session from its card menu closes its window and removes the card",
  async (hive) => {
    const { page, app } = hive;
    await undockTab(hive, SEARCH);
    await eventually(async () => assert.equal(app.windows().length, 2));
    await card(page, SEARCH).click({ button: "right" });
    await page.locator(".menu .menu-item", { hasText: "Close tab" }).click();
    await eventually(async () => {
      assert.equal(app.windows().length, 1);
      assert.equal(await card(page, SEARCH).count(), 0);
    });
    await row(page, SEARCH).waitFor();
    const state = await hive.state();
    assert.deepEqual(
      state.tabs.map((item) => item.id),
      [IDS.login, IDS.plain],
    );
    assert.deepEqual(state.detached, []);
    assert.deepEqual(await barTitles(page), [LOGIN, NOTES]);
  },
);

hiveTest(
  "a middle click closes a docked tab while another tab is undocked",
  async (hive) => {
    const { page, app } = hive;
    await undockTab(hive, SEARCH);
    await eventually(async () =>
      assert.equal(await tab(page, SEARCH).count(), 0),
    );
    await tab(page, LOGIN).click({ button: "middle" });
    await eventually(async () =>
      assert.deepEqual(await barTitles(page), [NOTES]),
    );
    await row(page, LOGIN).waitFor();
    assert.deepEqual((await hive.state()).detached, [IDS.search]);
    assert.equal(app.windows().length, 2);
    assert.equal(await card(page, SEARCH).count(), 1);
  },
);

hiveTest(
  "a double click on a docked tab shows it alone while another tab is undocked",
  async (hive) => {
    const { page } = hive;
    await page.locator(".layouts .layout-current").click();
    await page
      .locator('.layout-menu button[title="Side by side (1×2)"]')
      .click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 2),
    );
    await undockTab(hive, SEARCH);
    await eventually(async () =>
      assert.equal(await tab(page, SEARCH).count(), 0),
    );
    await tab(page, NOTES).dblclick();
    await eventually(async () => {
      const state = await hive.state();
      assert.equal(state.layout, "single");
      assert.equal(state.slots[0], IDS.plain);
    });
    assert.deepEqual((await hive.state()).detached, [IDS.search]);
  },
);
