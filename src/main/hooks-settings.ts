import type { HooksStatus } from "@shared/types";

export type Json = Record<string, unknown>;
export interface HookEntry {
  type?: string;
  command?: string;
}
export interface HookGroup {
  hooks?: HookEntry[];
}

/** The hook events that Hive installs, and the state that each one reports. */
export const EVENTS: Record<string, string> = {
  SessionStart: "ready",
  UserPromptSubmit: "working",
  PreToolUse: "working",
  Notification: "waiting",
  Stop: "ready",
  SessionEnd: "end",
};

export function isOurHook(command: string | undefined): boolean {
  return Boolean(
    command?.includes(".claude-sessions") && /hook\.(cjs|py)/.test(command),
  );
}

export function isOurTap(command: string | undefined): boolean {
  return Boolean(
    command?.includes(".claude-sessions") &&
      /statusline-tap\.(cjs|py)/.test(command),
  );
}

/** Tells from the settings if the hooks and the usage status line are installed. */
export function hooksStatusOf(settings: Json): HooksStatus {
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

export interface MergeResult {
  settings: Json;
  /**
   * The status line command that the wrapper must run after itself. It is undefined when the status line
   * is already the wrapper, because the file with the original command exists already.
   */
  originalStatusLine: string | undefined;
}

/**
 * Adds the Hive hooks and the status line wrapper to the Claude Code settings.
 * It drops the older entries of Hive (also the Python ones) and keeps every other hook and setting.
 * The input is not changed. Running it again on its own result gives the same result.
 */
export function mergeSettings(
  input: Json,
  options: { runner: string; hookFile: string; tapFile: string },
): MergeResult {
  const settings = structuredClone(input);
  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  for (const [event, state] of Object.entries(EVENTS)) {
    const groups = (hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((entry) => !isOurHook(entry.command)),
      }))
      .filter((group) => group.hooks.length > 0);
    groups.push({
      hooks: [
        {
          type: "command",
          command: `${options.runner} "${options.hookFile}" ${state}`,
        },
      ],
    });
    hooks[event] = groups;
  }
  settings.hooks = hooks;

  const statusLine = (settings.statusLine ?? { type: "command" }) as HookEntry &
    Json;
  const originalStatusLine = isOurTap(statusLine.command)
    ? undefined
    : (statusLine.command ?? "");
  statusLine.command = `${options.runner} "${options.tapFile}"`;
  settings.statusLine = statusLine;
  return { settings, originalStatusLine };
}
