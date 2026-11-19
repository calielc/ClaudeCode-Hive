import { open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentInfo,
  OpenTabRef,
  ScanResult,
  SessionDetails,
  SessionInfo,
  SessionState,
} from "@shared/types";
import { hiveDirectory, projectDirectory, repoName, repoPath } from "./paths";

const NEW_SESSION_TITLE = "New Session";
const AGENT_STALE_MS = 15 * 60 * 1000;

type Json = Record<string, unknown>;

const titleCache = new Map<string, { modified: number; title: string }>();
const detailCache = new Map<
  string,
  { modified: number; details: SessionDetails }
>();
const agentModelCache = new Map<string, { modified: number; model?: string }>();

/** Reads the last `bytes` bytes of a file as text lines. */
async function tailLines(file: string, bytes: number): Promise<string[]> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8").split("\n");
  } finally {
    await handle.close();
  }
}

async function headLines(file: string, bytes: number): Promise<string[]> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").split("\n");
  } finally {
    await handle.close();
  }
}

function parse(line: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null
      ? (value as Json)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The name of a session: its /rename name (custom title or agent name, the later one wins), else the title Claude made, else the first prompt. */
export async function readTitle(file: string): Promise<string | undefined> {
  // Titles are written again and again, so the end of the file has the latest.
  // Read a small tail first. Most sessions have a title there, and 700 big reads are slow.
  for (const chunk of [64 * 1024, 512 * 1024]) {
    let custom: string | undefined;
    let ai: string | undefined;
    for (const line of await tailLines(file, chunk)) {
      if (line.includes('"custom-title"')) {
        const value = parse(line)?.customTitle;
        custom = typeof value === "string" && value ? value : custom;
      } else if (line.includes('"agent-name"')) {
        // Newer Claude Code writes the /rename name here too, and sometimes only here.
        const value = parse(line)?.agentName;
        custom = typeof value === "string" && value ? value : custom;
      } else if (line.includes('"ai-title"')) {
        const value = parse(line)?.aiTitle;
        ai = typeof value === "string" ? value : ai;
      }
    }
    if (custom) {
      return custom;
    }
    if (ai) {
      return ai;
    }
    if ((await stat(file)).size <= chunk) {
      break;
    }
  }

  for (const line of await headLines(file, 512 * 1024)) {
    if (!line.includes('"type":"user"')) {
      continue;
    }
    const content = (parse(line)?.message as Json | undefined)?.content;
    if (typeof content === "string") {
      return content.slice(0, 60);
    }
    if (Array.isArray(content)) {
      const part = (content as Json[]).find((item) => item.type === "text");
      if (part && typeof part.text === "string") {
        return part.text.slice(0, 60);
      }
    }
  }
  return undefined;
}

async function readDetails(file: string): Promise<SessionDetails> {
  const found: SessionDetails = { agents: [] };
  const lines = await tailLines(file, 512 * 1024);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const json = parse(lines[index] ?? "");
    if (!json) {
      continue;
    }
    if (!found.branch && typeof json.gitBranch === "string" && json.gitBranch) {
      found.branch = json.gitBranch;
    }
    if (
      !found.lastPrompt &&
      json.type === "last-prompt" &&
      typeof json.lastPrompt === "string"
    ) {
      found.lastPrompt = json.lastPrompt;
    }
    if (!found.repo && typeof json.cwd === "string" && json.cwd) {
      found.repo = repoName(json.cwd);
      found.repoPath = repoPath(json.cwd);
    }
    if (!found.model && json.type === "assistant") {
      const model = (json.message as Json | undefined)?.model;
      if (typeof model === "string" && !model.startsWith("<")) {
        found.model = model;
      }
    }
    if (found.model && found.branch && found.lastPrompt && found.repo) {
      break;
    }
  }
  return found;
}

async function agentModel(
  transcript: string,
  modified: number,
): Promise<string | undefined> {
  const cached = agentModelCache.get(transcript);
  if (cached && cached.modified === modified) {
    return cached.model;
  }
  let model: string | undefined;
  const lines = await tailLines(transcript, 64 * 1024);
  for (let index = lines.length - 1; index >= 0 && !model; index -= 1) {
    const line = lines[index];
    if (line === undefined || !line.includes('"model"')) {
      continue;
    }
    const value = (parse(line)?.message as Json | undefined)?.model;
    if (typeof value === "string" && !value.startsWith("<")) {
      model = value;
    }
  }
  agentModelCache.set(transcript, { modified, model });
  return model;
}

/** A background agent has a meta file with "finished": true when it is done. An agent quiet for 15 minutes is stale. */
async function runningAgents(sessionDirectory: string): Promise<AgentInfo[]> {
  const directory = join(sessionDirectory, "subagents");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const agents: AgentInfo[] = [];
  for (const name of names.filter((item) => item.endsWith(".meta.json"))) {
    const id = name.slice(0, -".meta.json".length);
    const transcript = join(directory, `${id}.jsonl`);
    try {
      const modified = (await stat(transcript)).mtimeMs;
      if (Date.now() - modified > AGENT_STALE_MS) {
        continue;
      }
      const meta = JSON.parse(
        await readFile(join(directory, name), "utf8"),
      ) as Json;
      if (meta.finished === true) {
        continue;
      }
      const description =
        typeof meta.description === "string"
          ? meta.description
          : typeof meta.agentType === "string"
            ? meta.agentType
            : "Agent";
      agents.push({
        id,
        description,
        model: await agentModel(transcript, modified),
      });
    } catch {}
  }
  return agents.sort((left, right) => left.id.localeCompare(right.id));
}

async function details(
  file: string,
  id: string,
  directory: string,
  modified: number,
): Promise<SessionDetails> {
  const cached = detailCache.get(id);
  let base: SessionDetails;
  if (cached && cached.modified === modified) {
    base = cached.details;
  } else {
    base = await readDetails(file);
    detailCache.set(id, { modified, details: base });
  }
  // Agents finish without touching the main transcript, so read them every time.
  return { ...base, agents: await runningAgents(join(directory, id)) };
}

async function title(
  file: string,
  id: string,
  modified: number,
): Promise<string> {
  const cached = titleCache.get(id);
  if (cached && cached.modified === modified) {
    return cached.title;
  }
  const value =
    (await readTitle(file).catch(() => undefined)) ?? NEW_SESSION_TITLE;
  titleCache.set(id, { modified, title: value });
  return value;
}

/** The state of every session that has a status file. The hooks write these files. */
export async function readStates(): Promise<Map<string, SessionState>> {
  const states = new Map<string, SessionState>();
  const directory = join(hiveDirectory(), "status");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return states;
  }
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try {
      const json = JSON.parse(
        await readFile(join(directory, name), "utf8"),
      ) as Json;
      if (
        json.state === "working" ||
        json.state === "waiting" ||
        json.state === "ready"
      ) {
        states.set(name.slice(0, -".json".length), json.state);
      }
    } catch {}
  }
  return states;
}

/** An open tab, with details for its card. It can be a new session without a file yet. */
async function openSession(
  ref: OpenTabRef,
  states: Map<string, SessionState>,
): Promise<SessionInfo> {
  const directory = projectDirectory(ref.folder);
  const file = join(directory, `${ref.id}.jsonl`);
  const state = states.get(ref.id) ?? "ready";
  let modified: number;
  try {
    modified = (await stat(file)).mtimeMs;
  } catch {
    return {
      id: ref.id,
      title: ref.title,
      modified: Date.now(),
      state,
      details: {
        agents: [],
        repo: repoName(ref.folder),
        repoPath: repoPath(ref.folder),
      },
    };
  }
  const found = await details(file, ref.id, directory, modified);
  const name = await title(file, ref.id, modified);
  return {
    id: ref.id,
    title: name === NEW_SESSION_TITLE ? ref.title : name,
    modified,
    state,
    details: {
      ...found,
      repo: found.repo ?? repoName(ref.folder),
      repoPath: found.repoPath ?? repoPath(ref.folder),
    },
  };
}

export async function scan(
  folder: string,
  openTabs: OpenTabRef[],
): Promise<ScanResult> {
  const directory = projectDirectory(folder);
  const states = await readStates();
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch {
    names = [];
  }

  const sessions = (
    await Promise.all(
      names
        .filter((name) => name.endsWith(".jsonl"))
        .map(async (name): Promise<SessionInfo | undefined> => {
          const id = name.slice(0, -".jsonl".length);
          const file = join(directory, name);
          try {
            const modified = (await stat(file)).mtimeMs;
            return {
              id,
              title: await title(file, id, modified),
              modified,
              state: states.get(id) ?? "ready",
            };
          } catch {
            return undefined;
          }
        }),
    )
  ).filter((session): session is SessionInfo => session !== undefined);
  sessions.sort((left, right) => right.modified - left.modified);

  const openCards = await Promise.all(
    openTabs.map((ref) => openSession(ref, states)),
  );
  return { sessions, open: openCards };
}
