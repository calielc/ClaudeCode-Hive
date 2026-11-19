import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { eventually, type Hive, launchHive, row, tab } from "./app";
import { IDS } from "./fixture";

// This file tests an installer build. It runs only when `HIVE_E2E_PACKAGED` is the path of a packaged app, for example
// `dist/win-unpacked/Hive.exe`. The release workflow sets it after the build. Without it, the tests are skipped.
const packaged = process.env.HIVE_E2E_PACKAGED;

describe("the packaged app", {
  skip: packaged ? false : "HIVE_E2E_PACKAGED is not set",
}, () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
  });
  after(async () => {
    await hive.close();
  });

  test("is a packaged app and lists the sessions", async () => {
    const isPackaged = await hive.app.evaluate(({ app }) => app.isPackaged);
    assert.equal(isPackaged, true);
    await row(hive.page, "Fix login flow").waitFor();
    await row(hive.page, "Write release notes").waitFor();
  });

  test("reports its own version, which the update check compares with", async () => {
    const version = await hive.app.evaluate(({ app }) => app.getVersion());
    // A local draft build sets HIVE_EXPECT_VERSION. The release build has the version in package.json.
    const expected =
      process.env.HIVE_EXPECT_VERSION ??
      (
        JSON.parse(
          readFileSync(join(process.cwd(), "package.json"), "utf8"),
        ) as {
          version: string;
        }
      ).version;
    assert.equal(version, expected);
  });

  test("starts the terminal process inside the installer layout", async () => {
    await row(hive.page, "Write release notes").click();
    await tab(hive.page, "Write release notes").waitFor();
    // This fails if the native module `node-pty` is missing or cannot load from the packaged files.
    await eventually(
      async () =>
        assert.match(await hive.terminalText(IDS.plain), /HIVE-E2E-READY/),
      20_000,
    );
  });

  test("sends what you type to the terminal", async () => {
    await hive.page.locator(".pane .terminal-container").click();
    await hive.page.keyboard.type("packaged-hello");
    await hive.page.keyboard.press("Enter");
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.plain), /echo:.*packaged-hello/),
    );
  });
});
