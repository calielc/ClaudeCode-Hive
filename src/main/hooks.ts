import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { HooksStatus } from "@shared/types";
import { claudeDirectory, hiveDirectory } from "./paths";
import hookScript from "./scripts/hook.cjs?raw";
import tapScript from "./scripts/statusline-tap.cjs?raw";

type Json = Record<string, unknown>;
interface HookEntry {
  type?: string;
  command?: string;
}
interface HookGroup {
  hooks?: HookEntry[];
}

const EVENTS: Record<string, string> = {
  SessionStart: "ready",
  UserPromptSubmit: "working",
  PreToolUse: "working",
  Notification: "waiting",
  Stop: "ready",
  SessionEnd: "end",
};

const settingsFile = (): string => join(claudeDirectory(), "settings.json");
const hookFile = (): string => join(hiveDirectory(), "hook.cjs");
const tapFile = (): string => join(hiveDirectory(), "statusline-tap.cjs");

function readSettings(): Json {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Json;
  } catch {
    return {};
  }
}

/** A `node` that Claude Code can run. Hooks run often, so real Node (fast start) is better than Electron as Node. */
function findNode(): string | undefined {
  try {
    if (process.platform === "win32") {
      return (
        execFileSync("where", ["node"], { encoding: "utf8" }).split(
          /\r?\n/,
        )[0] || undefined
      );
    }
    const shell = process.env.SHELL || "/bin/sh";
    return (
      execFileSync(shell, ["-l", "-c", "command -v node"], {
        encoding: "utf8",
        timeout: 5000,
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

/** The command that runs a script: Node when it exists, else this app's own binary as Node. */
function runner(): string {
  const node = findNode();
  if (node) {
    return `"${node}"`;
  }
  return `ELECTRON_RUN_AS_NODE=1 "${process.execPath}"`;
}

function isOurHook(command: string | undefined): boolean {
  return Boolean(
    command?.includes(".claude-sessions") && /hook\.(cjs|py)/.test(command),
  );
}

function isOurTap(command: string | undefined): boolean {
  return Boolean(
    command?.includes(".claude-sessions") &&
      /statusline-tap\.(cjs|py)/.test(command),
  );
}

export function hooksStatus(): HooksStatus {
  const settings = readSettings();
  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  const stop = hooks.Stop ?? [];
  const hooksInstalled = stop.some((group) =>
    (group.hooks ?? []).some((entry) => entry.command?.includes("hook.cjs")),
  );
  const statusLine = settings.statusLine as HookEntry | undefined;
  return {
    hooksInstalled,
    usageInstalled: Boolean(
      statusLine?.command?.includes("statusline-tap.cjs"),
    ),
  };
}

/**
 * Installs the status hooks and the usage status line wrapper into the Claude Code settings.
 * It saves a backup first, replaces the hooks of the older Python version, and is safe to run again.
 */
export function installHooks(): HooksStatus {
  mkdirSync(hiveDirectory(), { recursive: true });
  writeFileSync(hookFile(), hookScript);
  writeFileSync(tapFile(), tapScript);
  chmodSync(hookFile(), 0o755);
  chmodSync(tapFile(), 0o755);

  const settings = readSettings();
  if (existsSync(settingsFile())) {
    copyFileSync(settingsFile(), `${settingsFile()}.bak-hive`);
  }

  const command = runner();
  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  for (const [event, state] of Object.entries(EVENTS)) {
    // Drop our own older entries (also the Python ones), keep everything else.
    const groups = (hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((entry) => !isOurHook(entry.command)),
      }))
      .filter((group) => group.hooks.length > 0);
    groups.push({
      hooks: [
        { type: "command", command: `${command} "${hookFile()}" ${state}` },
      ],
    });
    hooks[event] = groups;
  }
  settings.hooks = hooks;

  const statusLine = (settings.statusLine ?? { type: "command" }) as HookEntry &
    Json;
  // When the status line is already one of ours, the original command is in the file already.
  if (!isOurTap(statusLine.command)) {
    writeFileSync(
      join(hiveDirectory(), "statusline-original.txt"),
      statusLine.command ?? "",
    );
  }
  statusLine.command = `${command} "${tapFile()}"`;
  settings.statusLine = statusLine;

  mkdirSync(claudeDirectory(), { recursive: true });
  writeFileSync(settingsFile(), `${JSON.stringify(settings, null, 2)}\n`);
  return hooksStatus();
}
