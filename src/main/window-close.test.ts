import assert from "node:assert/strict";
import { test } from "node:test";
import { closedWindowAction } from "./window-close.ts";

const cases = [
  { quitting: false, dockRequested: false, expected: "close" },
  { quitting: false, dockRequested: true, expected: "dock" },
  { quitting: true, dockRequested: false, expected: "none" },
  { quitting: true, dockRequested: true, expected: "none" },
] as const;

for (const { quitting, dockRequested, expected } of cases) {
  test(`closedWindowAction is ${expected} when quitting is ${quitting} and dockRequested is ${dockRequested}`, () => {
    assert.equal(closedWindowAction(quitting, dockRequested), expected);
  });
}
