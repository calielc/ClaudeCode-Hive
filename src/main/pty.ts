import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PtyAttachOptions, PtyAttachResult, PtyExit } from "@shared/types";
import * as nodePty from "node-pty";

/**
 * node-pty starts every process through a small helper program. npm can install it without the execute
 * permission, and then every start fails with "posix_spawnp failed". Set the permission before the first start.
 */
function ensureSpawnHelper(): void {
  if (process.platform === "win32") {
    return;
  }
  try {
    const root = dirname(
      createRequire(__filename).resolve("node-pty/package.json"),
    );
    // In a packaged app the files are outside the archive.
    const base = root.replace("app.asar", "app.asar.unpacked");
    for (const folder of [`${process.platform}-${process.arch}`]) {
      const helper = join(base, "prebuilds", folder, "spawn-helper");
      if (existsSync(helper)) {
        chmodSync(helper, 0o755);
      }
    }
  } catch {
    // The helper may not exist for this platform. Then node-pty uses its own build.
  }
}

const MAX_BUFFER = 2 * 1024 * 1024;
const FLUSH_MS = 8;

interface Running {
  process: nodePty.IPty;
  buffer: string;
  pending: string;
  flushTimer: NodeJS.Timeout | undefined;
  startedAt: number;
}

/** The command a session runs. `HIVE_PTY_COMMAND` replaces it, so tests do not start Claude. */
export function sessionCommand(id: string, resume: boolean): string {
  if (process.env.HIVE_PTY_COMMAND) {
    return process.env.HIVE_PTY_COMMAND;
  }
  return resume ? `claude --resume ${id}` : `claude --session-id ${id}`;
}

/** Runs the Claude Code processes, one per session. A process lives until its tab closes, also while no window shows it. */
export class PtyManager {
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly onData: (id: string, data: string) => void,
    private readonly onExit: (exit: PtyExit) => void,
  ) {}

  /** Starts the session when it does not run yet. Gives back what it printed so far. */
  attach(id: string, options: PtyAttachOptions): PtyAttachResult {
    const existing = this.running.get(id);
    if (existing) {
      return { buffer: existing.buffer, created: false };
    }
    this.start(id, options);
    return { buffer: "", created: true };
  }

  private start(id: string, options: PtyAttachOptions): void {
    ensureSpawnHelper();
    const command = sessionCommand(id, options.resume);
    // `claude` can be a shell function in the user's setup, so run it through a login shell.
    const isWindows = process.platform === "win32";
    const shell = isWindows
      ? process.env.ComSpec || "cmd.exe"
      : process.env.SHELL || "/bin/zsh";
    const args = isWindows
      ? ["/d", "/s", "/c", command]
      : ["-l", "-i", "-c", command];
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      CLAUDE_SESSIONS_APP: "1",
    } as Record<string, string>;

    const child = nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols: Math.max(options.cols, 20),
      rows: Math.max(options.rows, 5),
      cwd: existsSync(options.folder) ? options.folder : homedir(),
      env,
    });
    const running: Running = {
      process: child,
      buffer: "",
      pending: "",
      flushTimer: undefined,
      startedAt: Date.now(),
    };
    this.running.set(id, running);

    child.onData((data) => {
      running.buffer = (running.buffer + data).slice(-MAX_BUFFER);
      running.pending += data;
      // The process can print many small chunks. Sending them in groups keeps the window smooth.
      running.flushTimer ??= setTimeout(() => this.flush(id), FLUSH_MS);
    });
    child.onExit(({ exitCode }) => {
      this.flush(id);
      this.running.delete(id);
      this.onExit({ id, exitCode, ranMs: Date.now() - running.startedAt });
    });
  }

  private flush(id: string): void {
    const running = this.running.get(id);
    if (!running) {
      return;
    }
    running.flushTimer = undefined;
    if (running.pending) {
      const data = running.pending;
      running.pending = "";
      this.onData(id, data);
    }
  }

  write(id: string, data: string): void {
    this.running.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      try {
        this.running.get(id)?.process.resize(cols, rows);
      } catch {
        // The process may have ended just now.
      }
    }
  }

  kill(id: string): void {
    const running = this.running.get(id);
    if (running) {
      this.running.delete(id);
      running.process.kill();
    }
  }

  killAll(): void {
    for (const id of [...this.running.keys()]) {
      this.kill(id);
    }
  }
}
