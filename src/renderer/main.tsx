import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import * as actions from "./actions";
import { notchFor, WheelSteps } from "./font-size";
import { followOtherWindows, getState, subscribe } from "./state";
import {
  applyFontSize,
  pointOf,
  terminalFontSize,
  terminalSize,
  terminalText,
} from "./terminals";
import "./styles.css";

followOtherWindows();

// The font size is one setting for all terminals, in every window. A change in the state reaches the terminals here.
applyFontSize(getState().fontSize);
subscribe(() => applyFontSize(getState().fontSize));
// Ctrl and the mouse wheel (Cmd on macOS) change the font size. A pinch on a touchpad gives the same event.
const wheel = new WheelSteps();
const mac = window.hive.platform === "darwin";
// A pinch gives a wheel event with ctrlKey true and no real Control key down. A real Control key press gives both.
let controlHeld = false;
window.addEventListener("keydown", (event) => {
  if (event.key === "Control") {
    controlHeld = true;
  }
});
window.addEventListener("keyup", (event) => {
  if (event.key === "Control") {
    controlHeld = false;
  }
});
window.addEventListener("blur", () => {
  controlHeld = false;
});
window.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    // The terminal must not scroll and the page must not zoom.
    event.preventDefault();
    event.stopPropagation();
    const pinch = event.ctrlKey && !controlHeld;
    const steps = wheel.add(
      event.deltaY,
      event.deltaMode,
      notchFor({ mac, pinch }),
    );
    if (steps !== 0) {
      actions.changeFontSize(steps);
    }
  },
  { capture: true, passive: false },
);
if (!window.location.hash.startsWith("#/terminal/")) {
  actions.restoreTerminals();
}
if (window.hive.debug) {
  (window as unknown as Record<string, unknown>).__hive = {
    ...actions,
    getState,
    terminalText,
    terminalFontSize,
    terminalSize,
    pointOf,
  };
}
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
