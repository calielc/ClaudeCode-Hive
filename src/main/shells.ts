import { lstat, open, readFile, stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import type { ShellSummary } from "@shared/types";
import { MAX_BYTES, SAFE_ID, STALE_MS } from "./agents";
import { projectDirectory } from "./paths";

const OUTPUT_BYTES = 524288;

type Json = Record<string, unknown>;

interface Task {
  description: string;
  command: string;
  outputFilePath: string;
  updated: number;
  ended: boolean;
}

const taskCache = new Map<
  string,
  { modified: number; tasks: Map<string, Task> }
>();

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseTasks(raw: string): Map<string, Task> {
  const tasks = new Map<string, Task>();
  for (const row of raw.split("\n")) {
    const isStatus = row.includes('"task_status"');
    if (!isStatus && !row.includes("<task-notification>")) {
      continue;
    }
    let entry: Json;
    try {
      entry = JSON.parse(row) as Json;
    } catch {
      continue;
    }
    const time = Date.parse(text(entry.timestamp));
    if (entry.type === "attachment") {
      const attachment = entry.attachment as Json | undefined;
      const id = text(attachment?.taskId);
      if (
        attachment?.type !== "task_status" ||
        attachment.taskType !== "local_bash" ||
        !SAFE_ID.test(id)
      ) {
        continue;
      }
      const task = tasks.get(id) ?? {
        description: "",
        command: "",
        outputFilePath: "",
        updated: 0,
        ended: false,
      };
      task.description ||= text(attachment.description);
      task.command ||= text((attachment.shell as Json | undefined)?.command);
      task.outputFilePath ||= text(attachment.outputFilePath);
      task.updated = Number.isNaN(time) ? task.updated : time;
      tasks.set(id, task);
    } else if (entry.type === "user") {
      const content = (entry.message as Json | undefined)?.content;
      const id = /<task-id>([^<]*)<\/task-id>/.exec(text(content))?.[1];
      const task = id === undefined ? undefined : tasks.get(id);
      if (task && text(content).includes("<task-notification>")) {
        task.ended = true;
        task.updated = Number.isNaN(time) ? task.updated : time;
      }
    }
  }
  return tasks;
}

async function loadTasks(
  file: string,
  modified: number,
): Promise<Map<string, Task>> {
  const cached = taskCache.get(file);
  if (cached && cached.modified === modified) {
    return cached.tasks;
  }
  let raw = await readFile(file, "utf8");
  if (raw.length > MAX_BYTES) {
    // Drop the first partial line of the cut.
    raw = raw.slice(raw.length - MAX_BYTES);
    raw = raw.slice(raw.indexOf("\n") + 1);
  }
  const tasks = parseTasks(raw);
  taskCache.set(file, { modified, tasks });
  return tasks;
}

/** All background shells of a session, running and done, in the order they first appear. */
export async function listShells(
  folder: string,
  sessionId: string,
): Promise<ShellSummary[]> {
  if (!SAFE_ID.test(sessionId)) {
    return [];
  }
  try {
    const file = join(projectDirectory(folder), `${sessionId}.jsonl`);
    const info = await stat(file);
    const tasks = await loadTasks(file, info.mtimeMs);
    const quiet = Date.now() - info.mtimeMs > STALE_MS;
    return [...tasks].map(([id, task]) => ({
      id,
      description: task.description || task.command || "Shell",
      command: task.command,
      running: !task.ended && !quiet,
      updated: task.updated,
    }));
  } catch {
    return [];
  }
}

/** The last part of the output of one shell. The path in the transcript counts only when its end matches this session and shell. */
export async function readShellOutput(
  folder: string,
  sessionId: string,
  shellId: string,
): Promise<string> {
  if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(shellId)) {
    return "";
  }
  try {
    const directory = projectDirectory(folder);
    const transcript = join(directory, `${sessionId}.jsonl`);
    const tasks = await loadTasks(transcript, (await stat(transcript)).mtimeMs);
    const recorded = tasks.get(shellId)?.outputFilePath;
    if (!recorded) {
      return "";
    }
    const expected = [
      basename(directory),
      sessionId,
      "tasks",
      `${shellId}.output`,
    ];
    if (recorded.split(sep).slice(-4).join("/") !== expected.join("/")) {
      return "";
    }
    const info = await lstat(recorded);
    if (!info.isFile()) {
      return "";
    }
    const handle = await open(recorded, "r");
    try {
      const cut = info.size > OUTPUT_BYTES;
      const length = Math.min(info.size, OUTPUT_BYTES + 1);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, info.size - length);
      if (!cut) {
        return buffer.toString("utf8");
      }
      // Read one byte more than the limit, so a cut that falls on a line start keeps that line.
      const lineStart = buffer[0] === 0x0a;
      const tail = buffer.subarray(1);
      const newline = tail.indexOf(0x0a);
      return lineStart
        ? tail.toString("utf8")
        : tail.subarray(newline + 1).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}
