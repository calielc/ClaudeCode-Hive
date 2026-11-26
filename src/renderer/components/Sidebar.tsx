import type { SessionInfo, SessionState, UsageWindow } from "@shared/types";
import {
  type DragEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  activateTab,
  addFolder,
  installHooks,
  openSession,
  removeFolder,
  selectFolder,
  setQuery,
} from "../actions";
import {
  abbreviatePath,
  countdown,
  relativeAge,
  shortModelName,
} from "../format";
import { setState, useStore } from "../state";
import { tagColor } from "../themes";
import { usageColor } from "../usage-color";
import { forecastUsage, type UsageForecast } from "../usage-forecast";
import { AgentList } from "./AgentView";
import { pressable } from "./a11y";
import { reorderProps } from "./reorder";

const DAY = 86_400_000;

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function startDrag(event: DragEvent, id: string): void {
  event.dataTransfer.setData("text/hive-session", id);
  event.dataTransfer.effectAllowed = "move";
}

function openMenu(event: MouseEvent, sessionId: string): void {
  event.preventDefault();
  setState({ contextMenu: { x: event.clientX, y: event.clientY, sessionId } });
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <FolderRow />
      <SearchField />
      <Counts />
      <SessionList />
      <UsageBars />
    </aside>
  );
}

/** The home folder shows as its own name, for example "calie", because a lone "~" is a tiny glyph. Other folders start with "~". */
function folderLabel(folder: string): string {
  const home = window.hive.home;
  if (home && folder === home) {
    return home.split(/[\\/]/).filter(Boolean).pop() ?? home;
  }
  return abbreviatePath(folder, home);
}

function FolderRow() {
  const folders = useStore((state) => state.folders);
  const selected = useStore((state) => state.selectedFolder);
  return (
    <div className="folder-row">
      <select
        value={selected}
        onChange={(event) => selectFolder(event.target.value)}
        title={selected}
      >
        {folders.map((folder) => (
          <option key={folder} value={folder}>
            {folderLabel(folder)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-button"
        title="Add folder"
        aria-label="Add folder"
        onClick={() => void addFolder()}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" />
        </svg>
      </button>
      {folders.length > 1 && (
        <button
          type="button"
          className="icon-button"
          title="Remove this folder from the list"
          aria-label="Remove this folder from the list"
          onClick={() => removeFolder(selected)}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M1.5 6h9" />
          </svg>
        </button>
      )}
    </div>
  );
}

function SearchField() {
  const query = useStore((state) => state.query);
  const searching = useStore((state) => state.isSearching);
  const request = useStore((state) => state.searchFocusRequest);
  const input = useRef<HTMLInputElement>(null);
  // The effect runs after the page has shown the panel, so the field can take the focus.
  useEffect(() => {
    if (request > 0) {
      input.current?.focus();
    }
  }, [request]);
  return (
    <div className="search">
      <span className="search-icon">⌕</span>
      <input
        ref={input}
        value={query}
        placeholder="Search sessions"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setQuery("")}
      />
      {searching && <span className="spinner" />}
      {query && (
        <button type="button" className="clear" onClick={() => setQuery("")}>
          ✕
        </button>
      )}
    </div>
  );
}

/** Open sessions and the sessions of the last day count, so old sessions do not fill the numbers. */
function Counts() {
  const open = useStore((state) => state.openSessions);
  const sessions = useStore((state) => state.sessions);
  const now = useNow();
  const openIds = new Set(open.map((session) => session.id));
  const counted = [
    ...open,
    ...sessions.filter(
      (session) => !openIds.has(session.id) && now - session.modified < DAY,
    ),
  ];
  const count = (state: SessionState): number =>
    counted.filter((session) => session.state === state).length;
  return (
    <div className="counts">
      <span>
        <i className="dot working" />
        {count("working")} Working
      </span>
      <span>
        <i className="dot waiting" />
        {count("waiting")} Waiting
      </span>
      <span>
        <i className="dot ready" />
        {count("ready")} Ready
      </span>
    </div>
  );
}

function SessionList() {
  const query = useStore((state) => state.query);
  const loading = useStore((state) => state.isLoading);
  if (query.trim()) {
    return <SearchResults />;
  }
  if (loading) {
    return <div className="list empty">Loading sessions…</div>;
  }
  return <GroupedList />;
}

function GroupedList() {
  const open = useStore((state) => state.openSessions);
  const sessions = useStore((state) => state.sessions);
  const now = useNow();
  const openIds = new Set(open.map((session) => session.id));
  const closed = sessions.filter((session) => !openIds.has(session.id));
  const lastDay = closed.filter((session) => now - session.modified < DAY);
  const older = closed.filter((session) => now - session.modified >= DAY);
  return (
    <div className="list">
      {open.length > 0 && (
        <section>
          {open.map((session) => (
            <SessionCard key={session.id} session={session} now={now} />
          ))}
        </section>
      )}
      {lastDay.length > 0 && (
        <CollapsibleSection
          title="Last 24 hours"
          count={lastDay.length}
          startOpen
        >
          {lastDay.map((session) => (
            <SessionRow key={session.id} session={session} now={now} />
          ))}
        </CollapsibleSection>
      )}
      {older.length > 0 && (
        <CollapsibleSection
          title="Older than 1 day"
          count={older.length}
          startOpen={false}
        >
          {older.map((session) => (
            <SessionRow key={session.id} session={session} now={now} />
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}

/** A section whose heading folds the rows away. The heading shows the number of sessions inside. */
function CollapsibleSection({
  title,
  count,
  startOpen,
  children,
}: {
  title: string;
  count: number;
  startOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: A pointer-only surface. The keys have their own handlers elsewhere. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: A pointer-only surface. The keys have their own handlers elsewhere. */}
      <h3
        className="collapsible"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="chevron">{open ? "▾" : "▸"}</span> {title}{" "}
        <span className="section-count">{count}</span>
      </h3>
      {open && children}
    </section>
  );
}

function SearchResults() {
  const query = useStore((state) => state.query);
  const sessions = useStore((state) => state.sessions);
  const matches = useStore((state) => state.contentMatches);
  const searching = useStore((state) => state.isSearching);
  const now = useNow();
  const text = query.trim().toLowerCase();
  const named = sessions.filter(
    (session) =>
      session.title.toLowerCase().includes(text) || session.id.startsWith(text),
  );
  const namedIds = new Set(named.map((session) => session.id));
  const inside = sessions.filter(
    (session) => matches.includes(session.id) && !namedIds.has(session.id),
  );
  if (named.length + inside.length === 0) {
    return (
      <div className="list empty">
        {searching ? "Searching…" : "No session found"}
      </div>
    );
  }
  return (
    <div className="list">
      {named.map((session) => (
        <SessionRow key={session.id} session={session} now={now} />
      ))}
      {inside.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          now={now}
          note="found in the conversation"
        />
      ))}
    </div>
  );
}

function SessionRow({
  session,
  now,
  note,
}: {
  session: SessionInfo;
  now: number;
  note?: string;
}) {
  const selected = useStore((state) => state.selectedTabId === session.id);
  const tag = useStore((state) => state.tags[session.id]);
  const color = tagColor(tag);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable().
    // biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable().
    <div
      className={`row ${selected ? "selected" : ""}`}
      style={
        color
          ? { background: `${color}29`, boxShadow: `inset 3px 0 0 ${color}` }
          : undefined
      }
      draggable
      onDragStart={(event) => startDrag(event, session.id)}
      onClick={() => openSession(session)}
      {...pressable(() => openSession(session))}
      onContextMenu={(event) => openMenu(event, session.id)}
    >
      <i className={`dot ${session.state}`} />
      <div className="row-text">
        <span className="row-title">{session.title}</span>
        {note && <span className="row-note">{note}</span>}
      </div>
      <span className="age">{relativeAge(session.modified, now)}</span>
    </div>
  );
}

/** A bigger tile for an open session: state, repo, branch, model, running agents and the last prompt. */
function SessionCard({ session, now }: { session: SessionInfo; now: number }) {
  const selected = useStore((state) => state.selectedTabId === session.id);
  const tag = useStore((state) => state.tags[session.id]);
  const isDetached = useStore((state) => state.detached.includes(session.id));
  const drop = useStore((state) =>
    state.tabDrop?.id === session.id
      ? state.tabDrop.after
        ? "drop-after"
        : "drop-before"
      : "",
  );
  const folder = useStore(
    (state) => state.tabs.find((item) => item.id === session.id)?.folder,
  );
  const details = session.details;
  const color = tagColor(tag);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable().
    // biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable().
    <div
      className={`card ${selected ? "selected" : ""} state-${session.state} ${drop}`}
      style={
        color
          ? { background: `${color}33`, boxShadow: `inset 4px 0 0 ${color}` }
          : undefined
      }
      {...reorderProps(session.id, "y")}
      onClick={() => activateTab(session.id)}
      {...pressable(() => activateTab(session.id))}
      onContextMenu={(event) => openMenu(event, session.id)}
    >
      <div className="card-head">
        <i className={`dot ${session.state}`} />
        <span className="card-title">{session.title}</span>
        {isDetached && (
          <span className="window-mark" title="In its own window">
            ▣
          </span>
        )}
        <span className="age">{relativeAge(session.modified, now)}</span>
      </div>
      <div className="chips">
        {details?.repo && (
          // biome-ignore lint/a11y/useKeyWithClickEvents: A pointer-only surface. The keys have their own handlers elsewhere.
          // biome-ignore lint/a11y/noStaticElementInteractions: A pointer-only surface. The keys have their own handlers elsewhere.
          <span
            className={`chip wide repo ${details.repoPath ? "chip-button" : ""}`}
            title={details.repoPath ? `Open ${details.repoPath}` : details.repo}
            onClick={(event) => {
              if (details.repoPath) {
                event.stopPropagation();
                window.hive.openFolder(details.repoPath);
              }
            }}
          >
            ▤ {details.repo}
          </span>
        )}
        {details?.branch && (
          <span className="chip wide" title={details.branch}>
            ⎇ {details.branch}
          </span>
        )}
        {details?.model && (
          <span className="chip model">◆ {shortModelName(details.model)}</span>
        )}
      </div>
      {folder && <AgentList tabId={session.id} folder={folder} />}
      {details?.lastPrompt && (
        <div className="last-prompt">{details.lastPrompt}</div>
      )}
    </div>
  );
}

/** The tooltip of a usage row: the real date and time of the reset, in the time zone of this computer. */
function resetTitle(
  resetsAt: number | null,
  rolledOver: boolean,
): string | undefined {
  if (resetsAt === null) {
    return undefined;
  }
  const when = new Date(resetsAt).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${rolledOver ? "Reset on" : "Resets on"} ${when}`;
}

const WORK_WEEK_NOTE = " (based on a 5 day, 12 hour work week)";

/** The tooltip of the forecast icon, which tells what the current pace means. */
function forecastText(
  forecast: UsageForecast,
  label: string,
  now: number,
): string {
  const note = label.startsWith("Week") ? WORK_WEEK_NOTE : "";
  if (forecast.kind === "lasts") {
    return `On pace for ${forecast.percentAtReset}% at the reset${note}`;
  }
  if (forecast.msLeft === 0) {
    return `Limit reached${note}`;
  }
  return `Runs out in ${countdown(now + forecast.msLeft, now)} (before the reset)${note}`;
}

/** Red when the limit runs out, yellow when the pace ends at 85% or more, green below that. */
function forecastLevel(forecast: UsageForecast): "red" | "yellow" | "green" {
  if (forecast.kind === "runs-out") {
    return "red";
  }
  return forecast.percentAtReset >= 85 ? "yellow" : "green";
}

function UsageBars() {
  const usage = useStore((state) => state.usage);
  const hooks = useStore((state) => state.hooks);
  const now = useNow(30_000);
  const windows: UsageWindow[] = usage?.windows.length
    ? usage.windows
    : [
        { label: "5 hours", percent: null, resetsAt: null },
        { label: "Week", percent: null, resetsAt: null },
      ];
  const stale = usage && now - usage.updatedAt > 600_000;
  const needsInstall =
    hooks !== null && !(hooks.hooksInstalled && hooks.usageInstalled);
  return (
    <div className="usage">
      <div className="usage-title">Usage limits</div>
      {windows.map((window) => {
        // A window that has already reset has no known usage until the next update.
        const rolledOver = window.resetsAt !== null && window.resetsAt < now;
        const percent = rolledOver ? null : window.percent;
        const color = usageColor(percent);
        const forecast = rolledOver ? null : forecastUsage(window, now);
        return (
          <div
            className="usage-row"
            key={window.label}
            title={resetTitle(window.resetsAt, rolledOver)}
          >
            <span className="usage-label">{window.label}</span>
            <div className="bar">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.min(Math.max(percent ?? 0, 0), 100)}%`,
                  background: color,
                }}
              />
            </div>
            <span className="usage-percent">
              {percent === null ? "–" : `${Math.round(percent)}%`}
            </span>
            <span className="usage-reset">
              {rolledOver ? "reset" : countdown(window.resetsAt, now)}
            </span>
            {forecast && (
              <span
                className="usage-forecast"
                data-testid="usage-forecast"
                data-kind={forecast.kind}
                data-level={forecastLevel(forecast)}
                title={forecastText(forecast, window.label, now)}
                aria-label={forecastText(forecast, window.label, now)}
                role="img"
              >
                ●
              </span>
            )}
          </div>
        );
      })}
      {stale && usage && (
        <div className="usage-note">
          Last update {relativeAge(usage.updatedAt, now)} ago. It refreshes
          while a session is open.
        </div>
      )}
      {needsInstall && (
        <div className="usage-note">
          Session status and usage limits need hooks in your Claude Code
          settings.{" "}
          <button
            type="button"
            className="link"
            onClick={() => void installHooks()}
          >
            Install hooks
          </button>
        </div>
      )}
    </div>
  );
}
