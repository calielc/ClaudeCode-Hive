import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row } from "./app";
import { IDS } from "./fixture";

// The fake command echoes what it receives as JSON. On macOS and Linux the terminal line turns a carriage return into a
// line feed. On Windows a carriage return stays a carriage return, and Enter can come back as both, so the end of the line
// is any of the three forms. Claude Code reads Escape and Enter as a new line. On Windows Hive sends a backslash and Enter
// instead, because the terminal layer there rewrites Escape and Enter. Enter alone submits.
const END = String.raw`(?:\\r\\n|\\r|\\n)`;
const START =
  process.platform === "win32" ? String.raw`\\\\` : String.raw`\\u001b`;
const NEW_LINE = new RegExp(`echo:"${START}${END}"`, "g");
const SUBMIT = new RegExp(`echo:"${END}"`, "g");

function count(text: string, needle: RegExp): number {
  return text.match(needle)?.length ?? 0;
}

describe("the keys that add a line to a prompt", () => {
  let hive: Hive;

  before(async () => {
    hive = await launchHive();
    await row(hive.page, "Fix login flow").click();
    await card(hive.page, "Fix login flow").waitFor();
    await eventually(async () =>
      assert.match(await hive.terminalText(IDS.login), /HIVE-E2E-READY/),
    );
    await hive.page.locator(".pane .terminal-container").click();
  });
  after(async () => {
    await hive.close();
  });

  for (const combo of ["Shift+Enter", "Control+Enter", "Alt+Enter"]) {
    test(`${combo} sends a new line and does not submit`, async () => {
      const text = () => hive.terminalText(IDS.login);
      const newLinesBefore = count(await text(), NEW_LINE);
      const submitsBefore = count(await text(), SUBMIT);
      await hive.page.keyboard.press(combo);
      await eventually(async () =>
        assert.equal(count(await text(), NEW_LINE), newLinesBefore + 1),
      );
      assert.equal(count(await text(), SUBMIT), submitsBefore);
    });
  }

  test("Enter alone still submits", async () => {
    const text = () => hive.terminalText(IDS.login);
    const newLinesBefore = count(await text(), NEW_LINE);
    const submitsBefore = count(await text(), SUBMIT);
    await hive.page.keyboard.press("Enter");
    await eventually(async () =>
      assert.equal(count(await text(), SUBMIT), submitsBefore + 1),
    );
    assert.equal(count(await text(), NEW_LINE), newLinesBefore);
  });
});
