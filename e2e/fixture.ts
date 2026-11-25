import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Ids of the fake sessions. They use letters, digits and dashes only, like real session ids. */
export const IDS = {
  login: "11111111-1111-4111-8111-111111111111",
  search: "22222222-2222-4222-8222-222222222222",
  plain: "33333333-3333-4333-8333-333333333333",
  old: "44444444-4444-4444-8444-444444444444",
} as const;

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** A throw-away home folder with fake Claude sessions. Hive runs against it, so a test never touches the real files of the user. */
export interface Fixture {
  /** The fake home folder. It is also the folder that Hive lists at the start, and it holds a `.git` folder. */
  home: string;
  /** The data folder of Electron for this run. */
  userData: string;
  /** The folder with the session files. */
  projectDirectory: string;
  /** The name that Hive shows for the repository, which is the name of the home folder. */
  repoName: string;
  cleanup(): void;
}

/** The folder name that Claude Code uses for a path: every character that is not a letter or digit becomes a dash. */
export function folderName(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, "-");
}

function line(value: unknown): string {
  return JSON.stringify(value);
}

function setAge(file: string, ageMs: number): void {
  const when = new Date(Date.now() - ageMs);
  utimesSync(file, when, when);
}

export interface SessionSpec {
  id: string;
  title: string;
  branch: string;
  model: string;
  prompt: string;
  /** Extra text in the conversation, for the search test. */
  note?: string;
  ageMs?: number;
  state?: "working" | "waiting";
}

export interface AgentSpec {
  id: string;
  type: string;
  description: string;
  model: string;
  /** A running agent ends with a tool call. A done agent ends with an answer. */
  done: boolean;
  prompt: string;
  ageMs?: number;
}

export interface ShellSpec {
  id: string;
  description?: string;
  command?: string;
  /** A running shell has no end notification. A done shell has one. */
  done: boolean;
  /** How long ago the shell finished. For a running shell, how long ago its transcript last named it. */
  ageMs?: number;
  output?: string;
}

export function writeSession(fixture: Fixture, spec: SessionSpec): void {
  const file = join(fixture.projectDirectory, `${spec.id}.jsonl`);
  const lines = [
    { type: "custom-title", customTitle: spec.title },
    {
      type: "user",
      cwd: fixture.home,
      gitBranch: spec.branch,
      message: { content: spec.prompt },
    },
    {
      type: "assistant",
      message: {
        model: spec.model,
        content: [{ type: "text", text: spec.note ?? "Done." }],
      },
    },
    { type: "last-prompt", lastPrompt: spec.prompt },
  ];
  writeFileSync(file, `${lines.map(line).join("\n")}\n`);
  setAge(file, spec.ageMs ?? 2 * MINUTE);
  if (spec.state) {
    const status = join(fixture.home, ".claude-sessions", "status");
    mkdirSync(status, { recursive: true });
    writeFileSync(
      join(status, `${spec.id}.json`),
      JSON.stringify({ state: spec.state, ts: Date.now() }),
    );
  }
}

/** Adds an agent to a session. The files have the same shape as the ones of Claude Code. */
export function writeAgent(
  fixture: Fixture,
  sessionId: string,
  spec: AgentSpec,
): void {
  const directory = join(fixture.projectDirectory, sessionId, "subagents");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `agent-${spec.id}.meta.json`),
    JSON.stringify({ agentType: spec.type, description: spec.description }),
  );
  const last = spec.done
    ? { type: "text", text: `Finished: ${spec.description}` }
    : {
        type: "tool_use",
        id: `tool-${spec.id}`,
        name: "Read",
        input: { file_path: "src/login.ts" },
      };
  const file = join(directory, `agent-${spec.id}.jsonl`);
  const lines = [
    { type: "user", message: { content: spec.prompt } },
    { type: "assistant", message: { model: spec.model, content: [last] } },
  ];
  writeFileSync(file, `${lines.map(line).join("\n")}\n`);
  setAge(file, spec.ageMs ?? 0);
}

/** Where the output of a background shell lives: `<tmp>/claude-<digits>/<project folder name>/<session>/tasks/<id>.output`. The fixture root stands for the tmp folder. */
export function shellOutputPath(
  fixture: Fixture,
  sessionId: string,
  shellId: string,
): string {
  return join(
    dirname(fixture.home),
    "claude-501",
    basename(fixture.projectDirectory),
    sessionId,
    "tasks",
    `${shellId}.output`,
  );
}

/** Adds a background shell to a session. The lines are appended to the transcript of the session and have the shape of the ones of Claude Code. */
export function writeShell(
  fixture: Fixture,
  sessionId: string,
  spec: ShellSpec,
): void {
  const outputFilePath = shellOutputPath(fixture, sessionId, spec.id);
  mkdirSync(dirname(outputFilePath), { recursive: true });
  writeFileSync(outputFilePath, spec.output ?? "");
  const updated = Date.now() - (spec.ageMs ?? 0);
  const lines: unknown[] = [
    {
      type: "attachment",
      timestamp: new Date(updated - (spec.done ? MINUTE : 0)).toISOString(),
      attachment: {
        type: "task_status",
        taskId: spec.id,
        taskType: "local_bash",
        description: spec.description,
        status: "running",
        outputFilePath,
        shell:
          spec.command === undefined
            ? undefined
            : {
                command: spec.command,
                kind: "bash",
                toolUseId: `toolu-${spec.id}`,
              },
      },
    },
  ];
  if (spec.done) {
    lines.push({
      type: "user",
      timestamp: new Date(updated).toISOString(),
      message: {
        role: "user",
        content: `<task-notification>\n<task-id>${spec.id}</task-id>\n<tool-use-id>toolu-${spec.id}</tool-use-id>\n<output-file>${outputFilePath}</output-file>\n<status>completed</status>\n<summary>Background command done</summary>\n</task-notification>`,
      },
    });
  }
  const transcript = join(fixture.projectDirectory, `${sessionId}.jsonl`);
  appendFileSync(transcript, `${lines.map(line).join("\n")}\n`);
  // A transcript that stays quiet for 15 minutes ends every shell, so keep it fresh.
  setAge(transcript, 0);
}

/** Appends transcript entries to the transcript of a session and keeps it fresh. Build the entries with the `bg*` helpers below. */
export function writeBackground(
  fixture: Fixture,
  sessionId: string,
  entries: unknown[],
): void {
  const transcript = join(fixture.projectDirectory, `${sessionId}.jsonl`);
  appendFileSync(transcript, `${entries.map(line).join("\n")}\n`);
  setAge(transcript, 0);
}

function bgCall(at: number, id: string, name: string, input: unknown): unknown {
  return {
    type: "assistant",
    timestamp: new Date(at).toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
    },
  };
}

function bgResult(
  at: number,
  id: string,
  content: string,
  isError = false,
): unknown {
  return {
    type: "user",
    timestamp: new Date(at).toISOString(),
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content,
          ...(isError ? { is_error: true } : {}),
        },
      ],
    },
  };
}

/** The start of a monitor: the call and its result. `expiresMin: null` is a persistent monitor. */
export function bgMonitorStart(spec: {
  task: string;
  description: string;
  command?: string;
  expiresMin?: number | null;
  at?: number;
}): unknown[] {
  const at = spec.at ?? Date.now();
  const toolId = `toolu_m_${spec.task}`;
  const expiry =
    spec.expiresMin === null
      ? "runs until the source ends"
      : `expires in ${spec.expiresMin ?? 10}m unless the source ends first; you get one notice at expiry`;
  return [
    bgCall(at, toolId, "Monitor", {
      command: spec.command ?? "tail -f app.log",
      description: spec.description,
    }),
    bgResult(
      at + 100,
      toolId,
      `Monitor started (task ${spec.task}, ${expiry}). You will be notified on each event. Keep working — do not poll or sleep.`,
    ),
  ];
}

/** One event of a monitor, as the notification entry and the queue-operation copy that Claude Code writes. */
export function bgMonitorEvent(
  task: string,
  event: string,
  at = Date.now(),
): unknown[] {
  const content = `<task-notification>\n<task-id>${task}</task-id>\n<summary>Monitor event: "x"</summary>\n<event>${event}</event>\nIf this event is something the user would act on now, send a PushNotification.\n</task-notification>`;
  return [
    {
      type: "user",
      timestamp: new Date(at).toISOString(),
      message: { role: "user", content },
    },
    {
      type: "queue-operation",
      operation: "enqueue",
      timestamp: new Date(at).toISOString(),
      content,
    },
  ];
}

export function bgMonitorStop(task: string, at = Date.now()): unknown[] {
  const toolId = `toolu_stop_${task}`;
  return [
    bgCall(at, toolId, "TaskStop", { task_id: task }),
    bgResult(at + 100, toolId, `Task ${task} stopped.`),
  ];
}

export function bgCronCreate(spec: {
  job: string;
  cron: string;
  prompt: string;
  recurring: boolean;
  at?: number;
}): unknown[] {
  const at = spec.at ?? Date.now();
  const toolId = `toolu_c_${spec.job}`;
  const text = spec.recurring
    ? `Scheduled recurring job ${spec.job} (${spec.cron}). Next run: soon. Session-only (not written to disk, dies when Claude exits). Auto-expires after 7 days. Use CronDelete to cancel sooner.`
    : `Scheduled one-shot task ${spec.job} (${spec.cron}). Next run: soon. Session-only (not written to disk, dies when Claude exits). It will fire once then auto-delete.`;
  return [
    bgCall(at, toolId, "CronCreate", {
      cron: spec.cron,
      prompt: spec.prompt,
      recurring: spec.recurring,
    }),
    bgResult(at + 100, toolId, text),
  ];
}

export function bgWakeup(spec: {
  id: string;
  seconds: number;
  reason: string;
  prompt?: string;
  at?: number;
}): unknown[] {
  const at = spec.at ?? Date.now();
  return [
    bgCall(at, spec.id, "ScheduleWakeup", {
      delaySeconds: spec.seconds,
      reason: spec.reason,
      prompt: spec.prompt ?? "<<autonomous-loop-dynamic>>",
    }),
    bgResult(
      at + 100,
      spec.id,
      `Next wakeup scheduled for 11:49:00 (in ${spec.seconds}s). If you owe the user a reply, send it now.`,
    ),
  ];
}

/**
 * Four sessions in the folder that Hive lists at the start:
 * "Fix login flow" works, "Refactor search" waits, "Write release notes" is ready, and "Old idea" is three days old.
 * `homeName` is the name of the folder, which Hive shows as the repository. `withSessions: false` gives an empty folder.
 */
export function createFixture(
  options: { homeName?: string; withSessions?: boolean } = {},
): Fixture {
  const root = mkdtempSync(join(tmpdir(), "hive-e2e-"));
  const home = join(root, options.homeName ?? "home");
  mkdirSync(join(home, ".git"), { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  const projectDirectory = join(home, ".claude", "projects", folderName(home));
  mkdirSync(projectDirectory, { recursive: true });
  const fixture: Fixture = {
    home,
    userData: join(root, "user-data"),
    projectDirectory,
    repoName: basename(home),
    cleanup: () =>
      rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      }),
  };
  if (options.withSessions === false) {
    return fixture;
  }
  writeSession(fixture, {
    id: IDS.login,
    title: "Fix login flow",
    branch: "feature/qr-login",
    model: "claude-sonnet-5-5",
    prompt: "Investigate the QR login flow and fix the redirect",
    state: "working",
  });
  writeSession(fixture, {
    id: IDS.search,
    title: "Refactor search",
    branch: "main",
    model: "claude-opus-5-5",
    prompt: "Refactor the search worker",
    note: "The marker zebra-quartz-7731 is in this conversation only.",
    state: "waiting",
  });
  writeSession(fixture, {
    id: IDS.plain,
    title: "Write release notes",
    branch: "main",
    model: "claude-haiku-5-5",
    prompt: "Write the release notes",
  });
  writeSession(fixture, {
    id: IDS.old,
    title: "Old idea",
    branch: "main",
    model: "claude-sonnet-5-5",
    prompt: "An old idea",
    ageMs: 3 * DAY,
  });
  return fixture;
}
