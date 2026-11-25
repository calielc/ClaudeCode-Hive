import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "./sidebar-width.ts";

test("the width stays between the limits and is a whole number", () => {
  assert.equal(clampSidebarWidth(387), 387);
  assert.equal(clampSidebarWidth(387.4), 387);
  assert.equal(clampSidebarWidth(199), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(601), MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(200), 200);
  assert.equal(clampSidebarWidth(600), 600);
});

test("a saved value that is not a number gives the default width", () => {
  assert.equal(clampSidebarWidth(undefined), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth("400"), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(Number.NaN), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(null), DEFAULT_SIDEBAR_WIDTH);
});
