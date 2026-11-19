import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

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
