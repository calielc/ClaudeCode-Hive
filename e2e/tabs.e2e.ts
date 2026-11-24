import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row, tab } from "./app";
import { IDS } from "./fixture";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

describe("sessions, tabs and panes", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
  });
  after(async () => {
    await hive.close();
  });

  test("opens a session from the list in a tab, a card and a terminal", async () => {
    const { page } = hive;
    await row(page, "Fix login flow").click();

    await tab(page, "Fix login flow").waitFor();
    await card(page, "Fix login flow").waitFor();
    // An open session leaves the list. It shows as a card only.
    await eventually(async () =>
      assert.equal(await row(page, "Fix login flow").count(), 0),
    );

    const state = await hive.state();
    assert.equal(state.selectedTabId, IDS.login);
    // The state keeps 16 slots for the largest layout. The empty ones are null.
    assert.deepEqual(state.slots.slice(0, 1), [IDS.login]);
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.login), /HIVE-E2E-READY/),
    );
  });

  test("shows the repository, the branch and the model on the card", async () => {
    const chips = card(hive.page, "Fix login flow").locator(".chip");
    await eventually(async () => {
      const texts = (await chips.allTextContents()).join(" | ");
      assert.ok(texts.includes(hive.fixture.repoName), texts);
      assert.ok(texts.includes("feature/qr-login"), texts);
      assert.ok(texts.includes("Sonnet 5.5"), texts);
    });
  });

  test("marks a working session with a state border on its card and a dot on its tab", async () => {
    const { page } = hive;
    await eventually(async () => {
      assert.equal(await page.locator(".card.state-working").count(), 1);
      assert.equal(
        await tab(page, "Fix login flow").locator(".dot.working").count(),
        1,
      );
    });
  });

  test("sends what you type to the terminal", async () => {
    const { page } = hive;
    await page.locator(".pane .terminal-container").click();
    await page.keyboard.type("hello-from-e2e");
    await page.keyboard.press("Enter");
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.login), /echo:.*hello-from-e2e/),
    );
  });

  test("opens a second session and keeps the first one in the tab bar", async () => {
    const { page } = hive;
    await row(page, "Write release notes").click();
    await tab(page, "Write release notes").waitFor();
    await tab(page, "Fix login flow").waitFor();
    const state = await hive.state();
    assert.equal(state.selectedTabId, IDS.plain);
    // In a single layout, the new session replaces the one in the pane. The first session stays open.
    assert.deepEqual(state.slots.slice(0, 1), [IDS.plain]);
    assert.equal(state.tabs.length, 2);
  });

  test("selects the other tab with Ctrl+Tab and Ctrl+Shift+Tab", async () => {
    const { page } = hive;
    await page.keyboard.press("Control+Tab");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.login),
    );
    await page.keyboard.press("Control+Shift+Tab");
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.plain),
    );
  });

  test("selects a tab with a click on its card", async () => {
    await card(hive.page, "Fix login flow").click();
    await eventually(async () =>
      assert.equal((await hive.state()).selectedTabId, IDS.login),
    );
  });

  test("puts both sessions side by side", async () => {
    const { page } = hive;
    await page.locator(".layouts .layout-current").click();
    await page
      .locator('.layout-menu button[title="Side by side (1×2)"]')
      .click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 2),
    );
    const state = await hive.state();
    assert.equal(state.layout, "sideBySide");
    // The selected session stays first. The other session fills the second pane.
    assert.deepEqual(state.slots.slice(0, 2), [IDS.login, IDS.plain]);
    assert.equal(await page.locator(".pane-badge").count(), 2);
    assert.equal(await page.locator(".pane.active").count(), 1);
  });

  test("selects a pane with a click and sends the next pick there", async () => {
    const { page } = hive;
    await page.locator(".pane").nth(1).locator(".pane-body").click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane.active").count(), 1),
    );
    await page.locator(".layouts .layout-current").click();
    await page.locator('.layout-menu button[title="Single pane"]').click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 1),
    );
    assert.equal((await hive.state()).layout, "single");
  });

  test("the layout menu has 3x3 and 4x4, and goes back to a single pane", async () => {
    const { page } = hive;
    await page.locator(".layouts .layout-current").click();
    await page.locator('.layout-menu button[title="Grid (3×3)"]').click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 9),
    );
    await page.locator(".layouts .layout-current").click();
    await page.locator('.layout-menu button[title="Grid (4×4)"]').click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 16),
    );
    await page.locator(".layouts .layout-current").click();
    await page.locator('.layout-menu button[title="Single pane"]').click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 1),
    );
  });

  test("starts a new session with the button and with the keyboard", async () => {
    const { page } = hive;
    await page.locator(".new-session").click();
    await eventually(async () =>
      assert.equal(await tab(page, "New Session").count(), 1),
    );
    await page.keyboard.press(`${modifier}+N`);
    await eventually(async () =>
      assert.equal(await tab(page, "New Session").count(), 2),
    );
    await eventually(async () =>
      assert.match(
        await hive.terminalText((await hive.state()).selectedTabId ?? ""),
        /HIVE-E2E-READY/,
      ),
    );
  });

  test("closes a tab and puts its session back in the list", async () => {
    const { page } = hive;
    await tab(page, "Write release notes")
      .locator('.tab-close[title="Close session"]')
      .click();
    await eventually(async () =>
      assert.equal(await tab(page, "Write release notes").count(), 0),
    );
    await row(page, "Write release notes").waitFor();
    assert.equal(await card(page, "Write release notes").count(), 0);
  });

  test("moves a session to its own window and back", async () => {
    const { page, app } = hive;
    await tab(page, "Fix login flow")
      .locator('.tab-close[title="Undock into its own window"]')
      .click();
    await eventually(async () => {
      assert.equal(app.windows().length, 2);
      assert.deepEqual((await hive.state()).detached, [IDS.login]);
    });
    await card(page, "Fix login flow").locator(".window-mark").waitFor();
    // The undock button is gone from a tab in its own window.
    assert.equal(
      await tab(page, "Fix login flow")
        .locator('.tab-close[title="Undock into its own window"]')
        .count(),
      0,
    );

    const other = app.windows().find((window) => window !== page);
    assert.ok(other);
    await other.close();
    await eventually(async () => {
      assert.equal(app.windows().length, 1);
      assert.deepEqual((await hive.state()).detached, []);
    });
  });
});

describe("a double click on a tab", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
    await row(hive.page, "Fix login flow").click();
    await tab(hive.page, "Fix login flow").waitFor();
    await row(hive.page, "Write release notes").click();
    await tab(hive.page, "Write release notes").waitFor();
  });
  after(async () => {
    await hive.close();
  });

  test("switches from side by side to the single layout with that tab selected", async () => {
    const { page } = hive;
    await page.locator(".layouts .layout-current").click();
    await page
      .locator('.layout-menu button[title="Side by side (1×2)"]')
      .click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 2),
    );
    await tab(page, "Write release notes").dblclick();
    await eventually(async () => {
      const state = await hive.state();
      assert.equal(state.layout, "single");
      assert.equal(state.selectedTabId, IDS.plain);
      assert.equal(state.slots[0], IDS.plain);
      assert.equal(await page.locator(".pane").count(), 1);
    });
  });

  test("changes nothing while the layout is already single", async () => {
    const { page } = hive;
    // This test sets the layout itself, so that it does not depend on the result of the test before.
    await page.locator(".layouts .layout-current").click();
    await page.locator('.layout-menu button[title="Single pane"]').click();
    await eventually(async () =>
      assert.equal((await hive.state()).layout, "single"),
    );
    await tab(page, "Fix login flow").dblclick();
    await page.waitForTimeout(300);
    const state = await hive.state();
    assert.equal(state.layout, "single");
    // The two clicks of the double click select the tab, as a click does.
    assert.equal(state.selectedTabId, IDS.login);
    assert.equal(state.slots[0], IDS.login);
    assert.equal(await page.locator(".pane").count(), 1);
    assert.equal(state.tabs.length, 2);
  });

  test("does not switch the layout when the double click comes from a button of the tab", async () => {
    const { page } = hive;
    await page.locator(".layouts .layout-current").click();
    await page
      .locator('.layout-menu button[title="Side by side (1×2)"]')
      .click();
    await eventually(async () =>
      assert.equal(await page.locator(".pane").count(), 2),
    );
    // A real double click on these buttons would close or undock the session, and the test could not look at the layout
    // afterwards. So the test sends a dblclick event straight to each button. The event bubbles to the tab, as it does
    // after a real double click, and no click starts the close or the undock.
    for (const title of ["Undock into its own window", "Close session"]) {
      await tab(page, "Write release notes")
        .locator(`.tab-close[title="${title}"]`)
        .dispatchEvent("dblclick");
    }
    await page.waitForTimeout(300);
    const state = await hive.state();
    assert.equal(state.layout, "sideBySide");
    assert.equal(await page.locator(".pane").count(), 2);
    assert.equal(state.tabs.length, 2);
    assert.deepEqual(state.detached, []);
  });

  test("does what a click does for a tab in its own window", async () => {
    const { page, app } = hive;
    await tab(page, "Write release notes")
      .locator('.tab-close[title="Undock into its own window"]')
      .click();
    await eventually(async () => assert.equal(app.windows().length, 2));
    await tab(page, "Write release notes").dblclick();
    await page.waitForTimeout(300);
    assert.equal((await hive.state()).layout, "sideBySide");
    const other = app.windows().find((window) => window !== page);
    assert.ok(other);
    await other.close();
    await eventually(async () => assert.equal(app.windows().length, 1));
  });
});

describe("the tab bar with many tabs", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
  });
  after(async () => {
    await hive.close();
  });

  test("keeps the New Session button after the last tab, also when the tabs overflow", async () => {
    const { page } = hive;
    const boxOf = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      assert.ok(box, `${selector} is not on the screen`);
      return box;
    };
    await page.locator(".new-session").click();
    await eventually(async () =>
      assert.ok((await page.locator(".tabs .tab").count()) >= 1),
    );
    const last = await page.locator(".tabs .tab").last().boundingBox();
    const button = await boxOf(".new-session");
    assert.ok(last, "no tab");
    assert.ok(
      button.x >= last.x + last.width - 1,
      `the button (${button.x}) must come after the last tab (ends at ${last.x + last.width})`,
    );

    // Many new sessions overflow the bar. The button stays inside the bar, left of the layout buttons.
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(`${modifier}+N`);
    }
    await eventually(async () =>
      assert.ok((await page.locator(".tabs .tab").count()) >= 15),
    );
    const layouts = await boxOf(".layouts");
    const pinned = await boxOf(".new-session");
    assert.ok(pinned.x >= 0, "the button is out of the window on the left");
    assert.ok(
      pinned.x + pinned.width <= layouts.x + 1,
      "the button overlaps the layout buttons or is pushed out of the bar",
    );
    const tabs = await boxOf(".tabs");
    assert.ok(
      pinned.x >= tabs.x + tabs.width - 1,
      "the button must come after the tabs, not inside their scroll area",
    );
  });
});
