import {
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  activateTab,
  closeTab,
  dismissUpdate,
  dropOnPane,
  newSession,
  openUpdatePage,
  selectPane,
  setLayout,
  setSplit,
  toggleSidebar,
  undock,
} from "../actions";
import { CAPACITY, type LayoutMode } from "../panes";
import { setState, useStore } from "../state";
import { fitEntry, getEntry, mountEntry, unmountEntry } from "../terminals";
import { tagColor } from "../themes";
import { SidePaneView } from "./AgentView";
import { pressable } from "./a11y";
import { endOfListProps, reorderProps } from "./reorder";

/** The rows and columns of each layout. The tooltip reads rows by columns. */
const LAYOUTS: {
  mode: LayoutMode;
  title: string;
  rows: number;
  columns: number;
}[] = [
  { mode: "single", title: "Single pane", rows: 1, columns: 1 },
  { mode: "sideBySide", title: "Side by side (1×2)", rows: 1, columns: 2 },
  { mode: "stacked", title: "Stacked (2×1)", rows: 2, columns: 1 },
  { mode: "grid", title: "Grid (2×2)", rows: 2, columns: 2 },
  { mode: "grid3", title: "Grid (3×3)", rows: 3, columns: 3 },
  { mode: "grid4", title: "Grid (4×4)", rows: 4, columns: 4 },
];

/** A small picture of a layout: one box for each pane. */
function LayoutIcon({ rows, columns }: { rows: number; columns: number }) {
  const gap = 1.5;
  const width = (14 - (columns - 1) * gap) / columns;
  const height = (14 - (rows - 1) * gap) / rows;
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {Array.from({ length: rows * columns }, (_, index) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: The boxes are fixed positions and never reorder.
          key={index}
          x={1 + (index % columns) * (width + gap)}
          y={1 + Math.floor(index / columns) * (height + gap)}
          width={width}
          height={height}
          rx="0.8"
        />
      ))}
    </svg>
  );
}

/** The layout button shows the current layout as a picture. A click opens a list of pictures, each with a tooltip. */
function LayoutMenu() {
  const layout = useStore((state) => state.layout);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const outside = (event: globalThis.PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);
  const current = LAYOUTS.find((item) => item.mode === layout) ?? LAYOUTS[0];
  if (!current) {
    return null;
  }
  return (
    <div className="layouts" ref={root}>
      <button
        type="button"
        className="layout-current"
        title={`Layout: ${current.title}`}
        aria-label={`Layout: ${current.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <LayoutIcon rows={current.rows} columns={current.columns} />
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="layout-menu" role="menu">
          {LAYOUTS.map((item) => (
            <button
              type="button"
              key={item.mode}
              role="menuitemradio"
              aria-checked={layout === item.mode}
              className={layout === item.mode ? "active" : ""}
              title={item.title}
              aria-label={item.title}
              onClick={() => {
                setLayout(item.mode);
                setOpen(false);
              }}
            >
              <LayoutIcon rows={item.rows} columns={item.columns} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The layouts that are an even grid of this size, without draggable dividers. */
const EVEN_GRID: Partial<Record<LayoutMode, number>> = { grid3: 3, grid4: 4 };

export function TopBar() {
  const sidebarHidden = useStore((state) => state.sidebarHidden);
  const hint = `${window.hive.platform === "darwin" ? "Cmd" : "Ctrl"}+B`;
  const label = `${sidebarHidden ? "Show" : "Hide"} the left panel (${hint})`;
  return (
    <div className="topbar">
      <button
        type="button"
        className="icon-button sidebar-toggle"
        title={label}
        aria-label={label}
        aria-pressed={!sidebarHidden}
        onClick={toggleSidebar}
      >
        <svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
          <rect x="1" y="1" width="12" height="10" rx="1.5" />
          <path d="M5 1v10" />
        </svg>
      </button>
      <TabBar />
      <button
        type="button"
        className="new-session"
        onClick={newSession}
        title="New session in the selected folder"
        {...endOfListProps()}
      >
        + New Session
      </button>
      <div className="topbar-fill" {...endOfListProps()} />
      <UpdateNotice />
      <LayoutMenu />
    </div>
  );
}

/** A small notice that a newer release exists. A click opens its page. The cross closes the notice for that version. */
function UpdateNotice() {
  const update = useStore((state) => state.update);
  const dismissed = useStore((state) => state.dismissedUpdate);
  if (!update || update.version === dismissed) {
    return null;
  }
  return (
    <div className="update-notice">
      <button
        type="button"
        className="update-link"
        title={`Version ${update.version} is available. Open the download page.`}
        onClick={openUpdatePage}
      >
        Update {update.version}
      </button>
      <button
        type="button"
        className="update-dismiss"
        title="Hide this notice"
        aria-label="Hide this notice"
        onClick={dismissUpdate}
      >
        ✕
      </button>
    </div>
  );
}

function TabBar() {
  const tabs = useStore((state) => state.tabs);
  const slots = useStore((state) => state.slots);
  const selected = useStore((state) => state.selectedTabId);
  const detached = useStore((state) => state.detached);
  const layout = useStore((state) => state.layout);
  const tags = useStore((state) => state.tags);
  const tabDrop = useStore((state) => state.tabDrop);
  const openSessions = useStore((state) => state.openSessions);
  const bar = useRef<HTMLDivElement>(null);
  // The selected tab scrolls into view when a pick, a new session or a key press selects a tab that the bar hides.
  useLayoutEffect(() => {
    bar.current
      ?.querySelector(".tab.selected")
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selected, tabs.length]);
  // The bar scrolls sideways only when the tabs do not fit. Its scroll stops at the ends.
  return (
    <div className="tabs" ref={bar} {...endOfListProps()}>
      {tabs.map((tab) => {
        const pane = slots.indexOf(tab.id);
        const color = tagColor(tags[tab.id]);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable().
          // biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable().
          <div
            key={tab.id}
            className={`tab ${selected === tab.id ? "selected" : ""} ${tabDrop?.id === tab.id ? (tabDrop.after ? "drop-after" : "drop-before") : ""}`}
            style={color ? { background: `${color}59` } : undefined}
            {...reorderProps(tab.id, "x")}
            onClick={() => activateTab(tab.id)}
            // A double click on a tab in a split layout shows that tab alone. A button of the tab (undock, close) does not count.
            onDoubleClick={(event: MouseEvent) => {
              if (
                layout === "single" ||
                detached.includes(tab.id) ||
                (event.target as HTMLElement).closest("button")
              ) {
                return;
              }
              activateTab(tab.id);
              setLayout("single");
            }}
            {...pressable(() => activateTab(tab.id))}
            // The middle button starts the scroll mode of the system on some platforms, so its press is cancelled.
            onMouseDown={(event: MouseEvent) => {
              if (event.button === 1) {
                event.preventDefault();
              }
            }}
            // A middle click on a tab closes it, like the close button. A button of the tab (undock, close) does not count.
            onAuxClick={(event: MouseEvent) => {
              if (
                event.button !== 1 ||
                (event.target as HTMLElement).closest("button")
              ) {
                return;
              }
              event.preventDefault();
              closeTab(tab.id);
            }}
            onContextMenu={(event: MouseEvent) => {
              event.preventDefault();
              setState({
                contextMenu: {
                  x: event.clientX,
                  y: event.clientY,
                  sessionId: tab.id,
                },
              });
            }}
          >
            {detached.includes(tab.id) && (
              <span title="In its own window">▣</span>
            )}
            {layout !== "single" && pane >= 0 && pane < CAPACITY[layout] && (
              <span className="pane-badge">{pane + 1}</span>
            )}
            <i
              className={`dot ${openSessions.find((item) => item.id === tab.id)?.state ?? "ready"}`}
            />
            <span className="tab-title">{tab.title}</span>
            {!detached.includes(tab.id) && (
              <button
                type="button"
                className="tab-close"
                title="Undock into its own window"
                onClick={(event) => {
                  event.stopPropagation();
                  undock(tab.id);
                }}
              >
                ⇱
              </button>
            )}
            <button
              type="button"
              className="tab-close"
              title="Close session"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** The terminal of a session. The terminal view is moved in here, and fits itself to the size of the pane. */
export function TerminalHost({ tabId }: { tabId: string }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = container.current;
    const entry = getEntry(tabId);
    if (!element || !entry) {
      return undefined;
    }
    mountEntry(entry, element);
    const observer = new ResizeObserver(() => fitEntry(entry));
    observer.observe(element);
    return () => {
      observer.disconnect();
      unmountEntry(entry, element);
    };
  }, [tabId]);
  return <div className="terminal-container" ref={container} />;
}

function paneDropProps(index: number) {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("text/hive-session")) {
        event.preventDefault();
        setState({ dropTarget: index });
      }
    },
    onDragLeave: () =>
      setState((current) =>
        current.dropTarget === index ? { dropTarget: null } : {},
      ),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/hive-session");
      if (id) {
        dropOnPane(id, index);
      }
    },
  };
}

function Pane({ index }: { index: number }) {
  const tabId = useStore((state) => state.slots[index]);
  const tab = useStore((state) =>
    state.tabs.find((item) => item.id === state.slots[index]),
  );
  const active = useStore(
    (state) => state.activePane === index && state.layout !== "single",
  );
  const dropTarget = useStore((state) => state.dropTarget === index);
  const layout = useStore((state) => state.layout);
  const sessionState = useStore(
    (state) =>
      state.openSessions.find((item) => item.id === state.slots[index])
        ?.state ?? "ready",
  );
  const tag = useStore((state) =>
    state.slots[index] ? state.tags[state.slots[index]] : undefined,
  );
  const color = tagColor(tag);
  const agentId = useStore((state) =>
    state.slots[index] ? (state.agentViews[state.slots[index]] ?? null) : null,
  );
  // In a split layout, a pane that waits for you pulses, so you see it among the others.
  const alert = layout !== "single" && sessionState === "waiting";
  const classes = `pane ${active ? "active" : ""} ${dropTarget ? "drop" : ""} ${alert ? "alert" : ""} state-${sessionState}`;
  if (!tabId || !tab) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: A pointer-only surface. The keys have their own handlers elsewhere.
      // biome-ignore lint/a11y/useKeyWithClickEvents: A pointer-only surface. The keys have their own handlers elsewhere.
      <div
        className={`${classes} empty`}
        onClick={() => selectPane(index)}
        {...paneDropProps(index)}
      >
        <div className="empty-text">
          <strong>Empty pane</strong>
          <span>Pick a session on the left, or drop one here.</span>
        </div>
      </div>
    );
  }
  return (
    <div
      className={classes}
      style={color ? { borderColor: color } : undefined}
      {...paneDropProps(index)}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: A pointer-only surface. The keys have their own handlers elsewhere. */}
      <div className="pane-body" onMouseDown={() => selectPane(index)}>
        {agentId ? (
          <SidePaneView
            folder={tab.folder}
            sessionId={tabId}
            selection={agentId}
          />
        ) : (
          <TerminalHost tabId={tabId} />
        )}
      </div>
    </div>
  );
}

/** A draggable divider. `axis` x is a vertical line that moves left and right. */
function Splitter({
  axis,
  container,
}: {
  axis: "x" | "y";
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: globalThis.PointerEvent): void => {
      const rect = container.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      if (axis === "x") {
        setSplit({ splitX: (moveEvent.clientX - rect.left) / rect.width });
      } else {
        setSplit({ splitY: (moveEvent.clientY - rect.top) / rect.height });
      }
    };
    const up = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    <div
      className={`splitter splitter-${axis}`}
      onPointerDown={onPointerDown}
    />
  );
}

export function PaneLayout() {
  const layout = useStore((state) => state.layout);
  const splitX = useStore((state) => state.splitX);
  const splitY = useStore((state) => state.splitY);
  const container = useRef<HTMLDivElement>(null);
  const evenSize = EVEN_GRID[layout];
  const columns = `${splitX}fr 4px ${1 - splitX}fr`;
  const rows = `${splitY}fr 4px ${1 - splitY}fr`;
  const cell = (row: number, column: number): React.CSSProperties => ({
    gridRow: row,
    gridColumn: column,
  });

  return (
    <div
      className="panes"
      ref={container}
      style={
        evenSize
          ? {
              gridTemplateColumns: `repeat(${evenSize}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${evenSize}, minmax(0, 1fr))`,
            }
          : layout === "single"
            ? { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }
            : layout === "sideBySide"
              ? { gridTemplateColumns: columns, gridTemplateRows: "1fr" }
              : layout === "stacked"
                ? { gridTemplateColumns: "1fr", gridTemplateRows: rows }
                : { gridTemplateColumns: columns, gridTemplateRows: rows }
      }
    >
      {layout === "single" && <Pane index={0} />}
      {layout === "sideBySide" && (
        <>
          <div style={cell(1, 1)} className="slot">
            <Pane index={0} />
          </div>
          <div style={cell(1, 2)} className="slot">
            <Splitter axis="x" container={container} />
          </div>
          <div style={cell(1, 3)} className="slot">
            <Pane index={1} />
          </div>
        </>
      )}
      {layout === "stacked" && (
        <>
          <div style={cell(1, 1)} className="slot">
            <Pane index={0} />
          </div>
          <div style={cell(2, 1)} className="slot">
            <Splitter axis="y" container={container} />
          </div>
          <div style={cell(3, 1)} className="slot">
            <Pane index={1} />
          </div>
        </>
      )}
      {evenSize !== undefined &&
        Array.from({ length: evenSize * evenSize }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: The cells are fixed positions and never reorder.
            key={index}
            className="slot"
          >
            <Pane index={index} />
          </div>
        ))}
      {layout === "grid" && (
        <>
          <div style={cell(1, 1)} className="slot">
            <Pane index={0} />
          </div>
          <div style={cell(1, 3)} className="slot">
            <Pane index={1} />
          </div>
          <div style={cell(3, 1)} className="slot">
            <Pane index={2} />
          </div>
          <div style={cell(3, 3)} className="slot">
            <Pane index={3} />
          </div>
          <div style={{ gridRow: "1 / 4", gridColumn: 2 }} className="slot">
            <Splitter axis="x" container={container} />
          </div>
          <div style={{ gridRow: 2, gridColumn: "1 / 4" }} className="slot">
            <Splitter axis="y" container={container} />
          </div>
        </>
      )}
    </div>
  );
}
