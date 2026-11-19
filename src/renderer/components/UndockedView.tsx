import { useEffect, useRef } from "react";
import { getState, useStore } from "../state";
import { createEntry, focusEntry } from "../terminals";
import { themeNamed } from "../themes";
import { TerminalHost } from "./Panes";

/** The content of an undocked window: one terminal and two buttons. */
export function UndockedView({ id, title }: { id: string; title: string }) {
  const themeName = useStore((state) => state.themeName);
  // The terminal must exist before the child component mounts it, so it is made while rendering.
  const created = useRef(false);
  if (!created.current) {
    created.current = true;
    createEntry(id, "", true, themeNamed(getState().themeName));
  }
  useEffect(() => {
    document.title = title;
    const focus = (): void => focusEntry(id);
    window.addEventListener("focus", focus);
    setTimeout(focus, 300);
    return () => window.removeEventListener("focus", focus);
  }, [id, title]);
  return (
    <div className="undocked" data-theme={themeName}>
      <div className="undocked-bar">
        <span className="pane-title">{title}</span>
        <button
          type="button"
          onClick={() => window.hive.windows.nextDisplay(id)}
        >
          Next display
        </button>
        <button type="button" onClick={() => window.hive.windows.dock(id)}>
          Dock
        </button>
      </div>
      <div className="pane-body">
        <TerminalHost tabId={id} />
      </div>
    </div>
  );
}
