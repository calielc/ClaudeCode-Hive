import assert from "node:assert/strict";
import { test } from "node:test";
import { usageColor } from "./usage-color.ts";

const GREY = "#888";
const GREEN = "#4dbf66";
const ORANGE = "#f79433";
const RED = "#eb4d4d";

test("an unknown percent is grey", () => {
  assert.equal(usageColor(null), GREY);
});

test("the bar is green below 60, orange from 60 up to 75, red above 75", () => {
  assert.equal(usageColor(0), GREEN);
  assert.equal(usageColor(59.9), GREEN);
  assert.equal(usageColor(60), ORANGE);
  assert.equal(usageColor(68), ORANGE);
  assert.equal(usageColor(75), ORANGE);
  assert.equal(usageColor(75.1), RED);
  assert.equal(usageColor(76), RED);
  assert.equal(usageColor(84), RED);
  assert.equal(usageColor(100), RED);
});
