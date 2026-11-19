import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export function claudeDirectory(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

/** Where Hive keeps its own files: status of sessions, usage limits, hook scripts. */
export function hiveDirectory(): string {
  return join(homedir(), ".claude-sessions");
}

/** Claude Code names a project directory after the path, with every character that is not a letter or digit turned into "-". */
export function projectDirectory(folder: string): string {
  return join(
    claudeDirectory(),
    "projects",
    folder.replace(/[^a-zA-Z0-9]/g, "-"),
  );
}

/**
 * The name of the git repository that holds the working directory. A session can run in a sub folder,
 * so walk up to the folder that has `.git`. Without one, use the folder's own name.
 */
export function repoName(workingDirectory: string): string {
  return basename(repoPath(workingDirectory));
}

/** The folder of the git repository that holds the working directory, or the working directory itself. */
export function repoPath(workingDirectory: string): string {
  const home = homedir();
  let current = workingDirectory;
  while (dirname(current) !== current && current !== home) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    current = dirname(current);
  }
  return workingDirectory;
}
