import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  notchFor,
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
  assert.equal(wheel.add(-100, 0, 100), 1);
  assert.equal(wheel.add(100, 0, 100), -1);
  assert.equal(wheel.add(-300, 0, 100), 3);
});

test("small touchpad movements add up to one step", () => {
  const wheel = new WheelSteps();
  const steps = Array.from({ length: 10 }, () => wheel.add(-30, 0, 100));
  assert.deepEqual(steps, [0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

test("a change of direction drops what was added so far", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-80, 0, 100), 0);
  assert.equal(wheel.add(60, 0, 100), 0);
  // The 80 up is gone. This is 60 down plus 50 down.
  assert.equal(wheel.add(50, 0, 100), -1);
});

test("a wheel that counts lines or pages is turned into pixels", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-3, 1, 100), 1);
  assert.equal(wheel.add(1, 2, 100), -8);
});

test("the notch is 100 for a wheel on Windows and Linux, 20 for a wheel on macOS and 8 for a pinch", () => {
  assert.equal(notchFor({ mac: false, pinch: false }), 100);
  assert.equal(notchFor({ mac: true, pinch: false }), 20);
  assert.equal(notchFor({ mac: false, pinch: true }), 8);
  assert.equal(notchFor({ mac: true, pinch: true }), 8);
});

test("a Mac trackpad burst of 40 events of 1.5 pixels gives 3 steps", () => {
  const wheel = new WheelSteps();
  // 40 times 1.5 is 60 pixels. With a notch of 20, that is 3 steps and nothing left over.
  const steps = Array.from({ length: 40 }, () => wheel.add(-1.5, 0, 20));
  assert.equal(
    steps.reduce((sum, step) => sum + step, 0),
    3,
  );
});

test("a step completes at exactly one notch, and not before", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-19, 0, 20), 0);
  assert.equal(wheel.add(-1, 0, 20), 1);
  assert.equal(wheel.add(19, 0, 20), 0);
  assert.equal(wheel.add(1, 0, 20), -1);
});

test("a pinch of small fractional movements adds up with a notch of 8", () => {
  const wheel = new WheelSteps();
  // 40 times 0.5 is 20 pixels. That is 2 steps, and 4 pixels are left over.
  const steps = Array.from({ length: 40 }, () => wheel.add(-0.5, 0, 8));
  assert.equal(
    steps.reduce((sum, step) => sum + step, 0),
    2,
  );
  assert.equal(steps[15], 1);
  assert.equal(steps[31], 1);
});

test("a change of direction drops the sum also with a small notch", () => {
  const wheel = new WheelSteps();
  assert.equal(wheel.add(-15, 0, 20), 0);
  assert.equal(wheel.add(10, 0, 20), 0);
  // The 15 up is gone. This is 10 down plus 10 down.
  assert.equal(wheel.add(10, 0, 20), -1);
});

test("a wheel that counts lines is turned into pixels before the notch", () => {
  const wheel = new WheelSteps();
  // One line is 40 pixels. With a notch of 20, that is 2 steps.
  assert.equal(wheel.add(-1, 1, 20), 2);
  // One line down is 40 pixels. With a notch of 100, that is not a step yet.
  assert.equal(wheel.add(1, 1, 100), 0);
});
