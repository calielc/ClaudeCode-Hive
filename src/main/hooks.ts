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
import { hooksStatusOf, type Json, mergeSettings } from "./hooks-settings";
import { claudeDirectory, hiveDirectory } from "./paths";
import hookScript from "./scripts/hook.cjs?raw";
import tapScript from "./scripts/statusline-tap.cjs?raw";

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

export function hooksStatus(): HooksStatus {
  return hooksStatusOf(readSettings());
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

  const { settings: merged, originalStatusLine } = mergeSettings(settings, {
    runner: runner(),
    hookFile: hookFile(),
    tapFile: tapFile(),
  });
  if (originalStatusLine !== undefined) {
    writeFileSync(
      join(hiveDirectory(), "statusline-original.txt"),
      originalStatusLine,
    );
  }

  mkdirSync(claudeDirectory(), { recursive: true });
  writeFileSync(settingsFile(), `${JSON.stringify(merged, null, 2)}\n`);
  return hooksStatus();
}
