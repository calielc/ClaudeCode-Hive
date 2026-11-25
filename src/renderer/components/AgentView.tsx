import type {
  AgentSummary,
  BackgroundSummary,
  ShellSummary,
  TranscriptEntry,
} from "@shared/types";
import { type UIEvent, useEffect, useRef, useState } from "react";
import { activateTab } from "../actions";
import { shortModelName } from "../format";
import { setState, useStore } from "../state";
import { pressable } from "./a11y";

/** Polls a value from the main process while the component is mounted. */
function usePolled<T>(
  load: () => Promise<T>,
  initial: T,
  intervalMs: number,
  key: string,
): T {
  const [value, setValue] = useState<T>(initial);
  // `key` stands for what `load` reads. `load` itself is a new function on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see the line above.
  useEffect(() => {
    let alive = true;
    const tick = (): void => {
      void load().then((next) => {
        if (alive) {
          setValue(next);
        }
      });
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [key, intervalMs]);
  return value;
}

const EXPIRE_MS = 30 * 60 * 1000;

const TYPE_ICONS: Record<string, string> = {
  explore: "⌕",
  plan: "☰",
  "general-purpose": "⚙",
  "claude-code-guide": "?",
};

/** A small symbol for the type of an agent. An unknown type gets a plain diamond. */
function typeIcon(agentType?: string): string {
  return TYPE_ICONS[(agentType ?? "").toLowerCase()] ?? "◇";
}

/** The agents of a session. It stays empty for a session without agents. */
export function useAgents(folder: string, sessionId: string): AgentSummary[] {
  return usePolled(
    () => window.hive.agents.list(folder, sessionId),
    [],
    2000,
    `${folder}|${sessionId}`,
  );
}

/** The background shells of a session. It stays empty for a session without shells. */
export function useShells(folder: string, sessionId: string): ShellSummary[] {
  return usePolled(
    () => window.hive.shells.list(folder, sessionId),
    [],
    2000,
    `${folder}|${sessionId}`,
  );
}

/** The monitors, cron jobs and wake-ups of a session. It stays empty for a session without them. */
export function useBackground(
  folder: string,
  sessionId: string,
): BackgroundSummary[] {
  return usePolled(
    () => window.hive.background.list(folder, sessionId),
    [],
    2000,
    `${folder}|${sessionId}`,
  );
}

const SHELL_PREFIX = "shell:";
const BACKGROUND_PREFIXES = ["monitor:", "cron:", "wakeup:"];
const BACKGROUND_ICONS: Record<BackgroundSummary["kind"], string> = {
  monitor: "◉",
  cron: "⏲",
  wakeup: "⏰",
};

/** The shell that a selection names, or null for an agent. Agent ids never hold a colon. */
function shellIdOf(selection: string): string | null {
  return selection.startsWith(SHELL_PREFIX)
    ? selection.slice(SHELL_PREFIX.length)
    : null;
}

/** One row of the list, for an agent or a shell. `key` is what the pane selection holds. */
interface Item {
  key: string;
  kind: "agent" | "shell" | BackgroundSummary["kind"];
  description: string;
  title: string;
  icon: string;
  model?: string;
  running: boolean;
  updated: number;
  /** A short state text, for a background task. */
  note?: string;
}

function agentItem(agent: AgentSummary): Item {
  return {
    key: agent.id,
    kind: "agent",
    description: agent.description,
    title: agent.agentType
      ? `${agent.agentType}: ${agent.description}`
      : agent.description,
    icon: typeIcon(agent.agentType),
    model: agent.model,
    running: agent.running,
    updated: agent.updated,
  };
}

function shellItem(shell: ShellSummary): Item {
  return {
    key: `${SHELL_PREFIX}${shell.id}`,
    kind: "shell",
    description: shell.description,
    title: shell.command
      ? `${shell.description}: ${shell.command}`
      : shell.description,
    icon: "$",
    running: shell.running,
    updated: shell.updated,
  };
}

function backgroundItem(task: BackgroundSummary): Item {
  return {
    key: task.id,
    kind: task.kind,
    description: task.title,
    title: task.note ? `${task.title}: ${task.note}` : task.title,
    icon: BACKGROUND_ICONS[task.kind],
    running: task.status === "running",
    updated: task.updatedAt,
    note: task.note,
  };
}

/**
 * The agents, the background shells and the background tasks of a session as rows on its card in the left panel. The first row is Main, the session itself. Every other row is an
 * agent, a shell or a background task (a monitor, a cron job or a wake-up). A click on an agent shows its transcript in the pane of the session, a click on a shell shows its output, a click on a
 * background task shows its detail, and a click on Main shows the terminal. Running rows and the open one always show. Finished rows fold behind a "+N done" row, and a cross
 * hides one.
 */
export function AgentList({
  tabId,
  folder,
}: {
  tabId: string;
  folder: string;
}) {
  const selected = useStore((state) => state.agentViews[tabId] ?? null);
  // A finished agent leaves the list 30 minutes after it finished. The open one stays. The poll keeps the clock fresh.
  const now = Date.now();
  const agentItems = useAgents(folder, tabId).map(agentItem);
  const shellItems = useShells(folder, tabId).map(shellItem);
  const backgroundItems = useBackground(folder, tabId).map(backgroundItem);
  const agents = [...agentItems, ...shellItems, ...backgroundItems].filter(
    (item) =>
      item.running || item.key === selected || now - item.updated < EXPIRE_MS,
  );
  const [showDone, setShowDone] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (agents.length === 0) {
    return null;
  }
  const choose = (key: string | null): void => {
    setState((current) => ({
      agentViews: { ...current.agentViews, [tabId]: key },
    }));
    activateTab(tabId);
  };
  const folded = agents.filter(
    (agent) =>
      !agent.running &&
      agent.key !== selected &&
      !dismissed.includes(agent.key),
  );
  const visible = agents.filter(
    (agent) =>
      agent.running ||
      agent.key === selected ||
      (showDone && !dismissed.includes(agent.key)),
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: A pointer-only surface. The keys have their own handlers elsewhere.
    // biome-ignore lint/a11y/useKeyWithClickEvents: A pointer-only surface. The keys have their own handlers elsewhere.
    <div className="agent-list" onClick={(event) => event.stopPropagation()}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable(). */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable(). */}
      <div
        className={`agent-row ${selected === null ? "active" : ""}`}
        onClick={() => choose(null)}
        {...pressable(() => choose(null))}
      >
        <span className="agent-glyph">▣</span>
        <span className="agent-name">Main</span>
      </div>
      {visible.map((agent) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable().
        // biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable().
        <div
          key={agent.key}
          className={`agent-row ${selected === agent.key ? "active" : ""} ${agent.running ? "" : "done"}`}
          data-kind={agent.kind === "agent" ? undefined : agent.kind}
          title={agent.title}
          onClick={() => choose(agent.key)}
          {...pressable(() => choose(agent.key))}
        >
          <i className={`dot ${agent.running ? "working" : "ready"}`} />
          <span className="agent-type">{agent.icon}</span>
          <span className="agent-name">{agent.description}</span>
          {agent.note && <span className="agent-note">{agent.note}</span>}
          {agent.model && (
            <span className="agent-model">{shortModelName(agent.model)}</span>
          )}
          {!agent.running && agent.key !== selected && (
            // biome-ignore lint/a11y/useSemanticElements: A real button cannot sit inside the row, which is a button itself.
            <span
              className="agent-dismiss"
              role="button"
              tabIndex={0}
              aria-label={`Hide this ${agent.kind}`}
              title={`Hide this ${agent.kind}`}
              onClick={(event) => {
                event.stopPropagation();
                setDismissed((current) => [...current, agent.key]);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setDismissed((current) => [...current, agent.key]);
                }
              }}
            >
              ✕
            </span>
          )}
        </div>
      ))}
      {folded.length > 0 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: The role and the keyboard handler come from pressable().
        // biome-ignore lint/a11y/noStaticElementInteractions: The role and the keyboard handler come from pressable().
        <div
          className="agent-row more"
          onClick={() => setShowDone(!showDone)}
          {...pressable(() => setShowDone(!showDone))}
        >
          <span className="agent-name">
            {showDone ? "Hide done" : `+${folded.length} done`}
          </span>
        </div>
      )}
    </div>
  );
}

/** What the pane of a session shows in place of the terminal: the transcript of an agent or the output of a shell. */
export function SidePaneView({
  folder,
  sessionId,
  selection,
}: {
  folder: string;
  sessionId: string;
  selection: string;
}) {
  if (BACKGROUND_PREFIXES.some((prefix) => selection.startsWith(prefix))) {
    return (
      <BackgroundDetail folder={folder} sessionId={sessionId} id={selection} />
    );
  }
  const shellId = shellIdOf(selection);
  return shellId === null ? (
    <AgentTranscript
      folder={folder}
      sessionId={sessionId}
      agentId={selection}
    />
  ) : (
    <ShellOutput folder={folder} sessionId={sessionId} shellId={shellId} />
  );
}

/** The output of one background shell as plain text. It reads the file again while the shell runs. */
function ShellOutput({
  folder,
  sessionId,
  shellId,
}: {
  folder: string;
  sessionId: string;
  shellId: string;
}) {
  const output = usePolled(
    () => window.hive.shells.output(folder, sessionId, shellId),
    "",
    1500,
    `${folder}|${sessionId}|${shellId}`,
  );
  const { box, onScroll } = useFollowEnd(output);
  return (
    <div className="agent-transcript" ref={box} onScroll={onScroll}>
      {output === "" && <div className="agent-empty">Nothing to show yet.</div>}
      <pre className="shell-output" data-testid="shell-output">
        {output}
      </pre>
    </div>
  );
}

/** The detail text of one background task. It reads the transcript again while the pane is open. */
function BackgroundDetail({
  folder,
  sessionId,
  id,
}: {
  folder: string;
  sessionId: string;
  id: string;
}) {
  const detail = usePolled(
    () => window.hive.background.detail(folder, sessionId, id),
    null,
    1500,
    `${folder}|${sessionId}|${id}`,
  );
  const { box, onScroll } = useFollowEnd(detail);
  return (
    <div className="agent-transcript" ref={box} onScroll={onScroll}>
      {detail === null && (
        <div className="agent-empty">Nothing to show yet.</div>
      )}
      <pre className="shell-output" data-testid="background-detail">
        {detail ?? ""}
      </pre>
    </div>
  );
}

/** Keeps a scroll box at its end while `content` grows, unless the reader scrolled up. */
function useFollowEnd(content: unknown) {
  const box = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useEffect(() => {
    const element = box.current;
    if (content !== undefined && element && stuck.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [content]);
  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget;
    stuck.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };
  return { box, onScroll };
}

/** The transcript of one agent as a conversation. It reads the file again while the agent runs. */
export function AgentTranscript({
  folder,
  sessionId,
  agentId,
}: {
  folder: string;
  sessionId: string;
  agentId: string;
}) {
  const entries = usePolled<TranscriptEntry[]>(
    () => window.hive.agents.transcript(folder, sessionId, agentId),
    [],
    1500,
    `${folder}|${sessionId}|${agentId}`,
  );
  const { box, onScroll } = useFollowEnd(entries);
  return (
    <div className="agent-transcript" ref={box} onScroll={onScroll}>
      {entries.length === 0 && (
        <div className="agent-empty">Nothing to show yet.</div>
      )}
      {entries.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: The transcript only grows at the end, and its items have no id.
        <TranscriptItem key={index} entry={entry} />
      ))}
    </div>
  );
}

function TranscriptItem({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === "tool") {
    return (
      <div className="t-tool">
        <span className="t-name">▸ {entry.name}</span>{" "}
        <span className="t-summary">{entry.text}</span>
      </div>
    );
  }
  if (entry.kind === "result") {
    const lines = entry.text.split("\n").length;
    return (
      <details className={`t-result ${entry.error ? "error" : ""}`}>
        <summary>
          {entry.error ? "Error" : "Result"} · {lines}{" "}
          {lines === 1 ? "line" : "lines"}
        </summary>
        <pre>{entry.text}</pre>
      </details>
    );
  }
  if (entry.kind === "thinking") {
    return (
      <details className="t-thinking">
        <summary>Thinking</summary>
        <pre>{entry.text}</pre>
      </details>
    );
  }
  return (
    <div className={`t-${entry.kind}`}>
      <div className="t-label">
        {entry.kind === "prompt" ? "Prompt" : "Agent"}
      </div>
      <div className="t-text">{entry.text}</div>
    </div>
  );
}
