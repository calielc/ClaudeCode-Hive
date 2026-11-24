import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { card, eventually, type Hive, launchHive, row } from "./app";
import { IDS } from "./fixture";

// The fake command echoes what it receives as JSON. On macOS and Linux the terminal line turns a carriage return into a
// line feed. On Windows it can arrive as a carriage return, so the end of the line is any of the three forms.
// Escape then Enter is the new line key of Claude Code, and Enter alone submits.
const NEW_LINE = /echo:"\\u001b(?:\\r\\n|\\r|\\n)"/g;
const SUBMIT = /echo:"(?:\\r\\n|\\r|\\n)"/g;

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
