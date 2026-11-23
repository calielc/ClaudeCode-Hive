import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  WheelSteps,
} from "./font-size.ts";

test("the font size stays between the limits and is a whole number", () => {
  assert.equal(clampFontSize(15), 15);
  assert.equal(clampFontSize(14.6), 15);
  assert.equal(clampFontSize(1), MIN_FONT_SIZE);
  assert.equal(clampFontSize(500), MAX_FONT_SIZE);
});

test("a saved value that is not a number gives the default size", () => {
  assert.equal(clampFontSize(undefined), DEFAULT_FONT_SIZE);
  assert.equal(clampFontSize("20"), DEFAULT_FONT_SIZE);
  assert.equal(clampFontSize(Number.NaN), DEFAULT_FONT_SIZE);
  assert.equal(clampFontSize(null), DEFAULT_FONT_SIZE);
});

test("a mouse notch up makes the font bigger and a notch down makes it smaller", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-100, 0), 1);
  assert.equal(wheel.add(100, 0), -1);
  assert.equal(wheel.add(-300, 0), 3);
});

test("small touchpad movements add up to one step", () => {
  const wheel = new WheelSteps();
  const steps = Array.from({ length: 10 }, () => wheel.add(-30, 0));
  assert.deepEqual(steps, [0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

test("a change of direction drops what was added so far", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-80, 0), 0);
  assert.equal(wheel.add(60, 0), 0);
  // The 80 up is gone. This is 60 down plus 50 down.
  assert.equal(wheel.add(50, 0), -1);
});

test("a wheel that counts lines or pages is turned into pixels", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-3, 1), 1);
  assert.equal(wheel.add(1, 2), -8);
});
