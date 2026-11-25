import type { PointerEvent } from "react";
import { resetSidebarWidth, setSidebarWidth } from "../actions";
import { getState } from "../state";

/** A draggable divider on the right edge of the left panel. It floats over the edge, so it takes no grid column. */
export function SidebarSplitter() {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = getState().sidebarWidth;
    const move = (moveEvent: globalThis.PointerEvent): void => {
      setSidebarWidth(startWidth + moveEvent.clientX - startX);
    };
    const up = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: A pointer-only surface, like the splitters between the panes.
    <div
      className="sidebar-splitter"
      data-testid="sidebar-splitter"
      onPointerDown={onPointerDown}
      onDoubleClick={resetSidebarWidth}
    />
  );
}
