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

/** The size of one wheel notch in pixels. A notch of a mouse on Windows gives 100. */
const NOTCH = 100;

/**
 * Turns wheel movement into font size steps. Scrolling up gives plus steps, and scrolling down gives minus steps.
 * A notch of a mouse gives one step. A touchpad gives many small movements, and they add up until they reach a
 * notch. A change of direction drops what was added so far.
 */
export class WheelSteps {
  private total = 0;

  /** `deltaY` and `deltaMode` come from the wheel event. */
  add(deltaY: number, deltaMode: number): number {
    // Mode 1 counts lines and mode 2 counts pages. Mode 0 counts pixels.
    const pixels = deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1);
    const movement = -pixels;
    if (movement !== 0 && Math.sign(movement) !== Math.sign(this.total)) {
      this.total = 0;
    }
    this.total += movement;
    // `|| 0` turns -0 into 0.
    const steps = Math.trunc(this.total / NOTCH) || 0;
    this.total -= steps * NOTCH;
    return steps;
  }
}
