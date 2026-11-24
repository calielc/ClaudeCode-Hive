export const DEFAULT_FONT_SIZE = 13;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;

/** A saved or computed size, as a whole number between the limits. Anything that is not a number gives the default. */
export function clampFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

/** Pixels of wheel movement for one step. Tuned for a mouse wheel on Windows and Linux, which gives 100 for a notch. */
export const WHEEL_NOTCH = 100;
/** Pixels of wheel movement for one step. Tuned for a wheel or a trackpad scroll on macOS, which give small movements. */
export const MAC_WHEEL_NOTCH = 20;
/** Pixels of wheel movement for one step. Tuned for a pinch gesture on a touchpad, on any system. */
export const PINCH_NOTCH = 8;

/** The pixels of wheel movement for one step, for the kind of input. */
export function notchFor(input: { mac: boolean; pinch: boolean }): number {
  if (input.pinch) {
    return PINCH_NOTCH;
  }
  return input.mac ? MAC_WHEEL_NOTCH : WHEEL_NOTCH;
}

/**
 * Turns wheel movement into font size steps. Scrolling up gives plus steps, and scrolling down gives minus steps.
 * A notch of a mouse gives one step. A touchpad gives many small movements, and they add up until they reach a
 * notch. A change of direction drops what was added so far.
 */
export class WheelSteps {
  private total = 0;

  /** `deltaY` and `deltaMode` come from the wheel event. `notch` is the pixels for one step, from `notchFor`. */
  add(deltaY: number, deltaMode: number, notch: number): number {
    // Mode 1 counts lines and mode 2 counts pages. Mode 0 counts pixels.
    const pixels = deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1);
    const movement = -pixels;
    if (movement !== 0 && Math.sign(movement) !== Math.sign(this.total)) {
      this.total = 0;
    }
    this.total += movement;
    // `|| 0` turns -0 into 0.
    const steps = Math.trunc(this.total / notch) || 0;
    this.total -= steps * notch;
    return steps;
  }
}
