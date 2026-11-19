import type { KeyboardEvent } from "react";

/**
 * Props that make a clickable element work with the keyboard: it takes focus, and Enter or Space does what a click does.
 * A key that a child element receives does not count, so a button inside the element keeps its own behaviour.
 */
export function pressable(activate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent) => {
      if (
        event.target === event.currentTarget &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        activate();
      }
    },
  };
}
