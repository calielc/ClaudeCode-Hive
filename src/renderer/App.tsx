import { useEffect, useRef } from "react";
import {
  cycleTabs,
  focusSearch,
  focusSelected,
  newSession,
  setTheme,
  startMainWindow,
  toggleSidebar,
} from "./actions";
import { drawBadge } from "./badge";
import { ContextMenu } from "./components/ContextMenu";
import { PaneLayout, TopBar } from "./components/Panes";
import { Sidebar } from "./components/Sidebar";
import { SidebarSplitter } from "./components/SidebarSplitter";
import { UndockedView } from "./components/UndockedView";
import { shortcutFor } from "./shortcuts";
import { useStore } from "./state";
import { THEMES, themeNamed } from "./themes";

export function App() {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith("/terminal/")) {
    const [path, query] = hash.split("?");
    const id = (path ?? "").slice("/terminal/".length);
    return (
      <UndockedView
        id={id}
        title={new URLSearchParams(query).get("title") ?? "Hive"}
      />
    );
  }
  return <MainView />;
}

function MainView() {
  const themeName = useStore((state) => state.themeName);
  const selectedTabId = useStore((state) => state.selectedTabId);
  const layout = useStore((state) => state.layout);
  const waiting = useStore(
    (state) =>
      state.openSessions.filter((session) => session.state === "waiting")
        .length,
  );
  const hasTabs = useStore((state) => state.tabs.length > 0);
  const sidebarHidden = useStore((state) => state.sidebarHidden);
  const sidebarWidth = useStore((state) => state.sidebarWidth);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return undefined;
    }
    started.current = true;
    void startMainWindow();
    const onKey = (event: KeyboardEvent): void => {
      const action = shortcutFor(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (action.type === "cycle") {
        cycleTabs(action.backwards);
      } else if (action.type === "newSession") {
        newSession();
      } else if (action.type === "search") {
        // The search field sits in the left panel. A hidden panel comes back first.
        focusSearch();
      } else if (action.type === "toggleSidebar") {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.hive.windows.onCycleTabs((backwards) => cycleTabs(backwards));
    window.hive.onSetTheme((name) => setTheme(name));
    // Typing must work right away after Alt-Tab back to Hive. A search field in use keeps the focus.
    window.addEventListener("focus", focusSelected);
    return undefined;
  }, []);

  // The taskbar badge and the tray tooltip show how many open sessions wait for the user.
  useEffect(() => {
    window.hive.setWaitingCount(waiting, waiting > 0 ? drawBadge(waiting) : "");
  }, [waiting]);

  // The Theme menu of the window lists the themes and marks the current one.
  useEffect(() => {
    window.hive.setThemeMenu(
      THEMES.map((theme) => theme.name),
      themeName,
    );
  }, [themeName]);

  // The terminal of the selected pane gets the keyboard whenever the selection or the layout changes.
  useEffect(() => {
    const timers = [0, 80, 300].map((delay) =>
      setTimeout(focusSelected, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [selectedTabId, layout]);

  return (
    <div
      className={`app ${sidebarHidden ? "sidebar-hidden" : ""}`}
      data-theme={themeName}
      style={
        {
          "--pane-bg": themeNamed(themeName).background,
          "--sidebar-width": `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      <Sidebar />
      {!sidebarHidden && <SidebarSplitter />}
      <main className="main">
        <TopBar />
        {hasTabs ? (
          <PaneLayout />
        ) : (
          <div className="no-session">
            <strong>No session open</strong>
            <span>Pick a session on the left or start a new one.</span>
          </div>
        )}
      </main>
      <ContextMenu />
    </div>
  );
}
