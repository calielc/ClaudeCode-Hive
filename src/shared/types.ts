export type SessionState = "working" | "waiting" | "ready";

export interface AgentInfo {
  id: string;
  description: string;
  model?: string;
}

/** An agent that a session started, running or done. */
export interface AgentSummary {
  id: string;
  description: string;
  agentType?: string;
  model?: string;
  running: boolean;
  /** When the transcript last changed, in milliseconds. For a finished agent, this is about when it finished. */
  updated: number;
}

/** A background shell that a session started, running or done. */
export interface ShellSummary {
  id: string;
  description: string;
  command: string;
  running: boolean;
  /** When the transcript last named this shell, in milliseconds. For a finished shell, this is about when it ended. */
  updated: number;
}

/** One readable item of an agent transcript. */
export type TranscriptEntry =
  | { kind: "prompt" | "text" | "thinking"; text: string }
  | { kind: "tool"; name: string; text: string }
  | { kind: "result"; text: string; error: boolean };

/** Extra facts for the cards of open sessions. */
export interface SessionDetails {
  model?: string;
  branch?: string;
  repo?: string;
  /** The full path of the repository folder. */
  repoPath?: string;
  lastPrompt?: string;
  agents: AgentInfo[];
}

export interface SessionInfo {
  id: string;
  title: string;
  /** Milliseconds since 1970. */
  modified: number;
  state: SessionState;
  details?: SessionDetails;
}

/** A session that is open in a tab. The tab can belong to another folder than the selected one. */
export interface OpenTabRef {
  id: string;
  folder: string;
  title: string;
}

export interface ScanResult {
  sessions: SessionInfo[];
  open: SessionInfo[];
}

export interface UsageWindow {
  label: string;
  percent: number | null;
  /** Milliseconds since 1970. */
  resetsAt: number | null;
}

export interface UsageSnapshot {
  windows: UsageWindow[];
  /** Milliseconds since 1970. */
  updatedAt: number;
}

export interface HooksStatus {
  hooksInstalled: boolean;
  usageInstalled: boolean;
}

export interface PtyAttachOptions {
  folder: string;
  resume: boolean;
  cols: number;
  rows: number;
}

export interface PtyAttachResult {
  /** What the terminal printed so far, so a new view can show the same screen. */
  buffer: string;
  created: boolean;
}

export interface PtyExit {
  id: string;
  exitCode: number;
  ranMs: number;
}

/** A newer release of Hive than the one that runs. */
export interface UpdateInfo {
  version: string;
  /** The page of the release, where the user downloads the installer. */
  url: string;
}

/** The API the preload script puts on `window.hive`. */
export interface HiveApi {
  platform: string;
  /** True when Hive runs with HIVE_DEBUG=1, so tests can drive the window. */
  debug: boolean;
  home: string;
  /** The folder Hive starts with: the home folder of the user. */
  defaultFolder(): Promise<string>;
  scan(folder: string, open: OpenTabRef[]): Promise<ScanResult>;
  search(folder: string, text: string): Promise<string[]>;
  readUsage(): Promise<UsageSnapshot | null>;
  hooksStatus(): Promise<HooksStatus>;
  installHooks(): Promise<HooksStatus>;
  pickFolder(): Promise<string | null>;
  setOpenTabs(tabs: OpenTabRef[]): void;
  /** Opens a web link in the default browser of the system, where the user is already logged in. */
  openExternal(url: string): void;
  pty: {
    attach(id: string, options: PtyAttachOptions): Promise<PtyAttachResult>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    onData(listener: (id: string, data: string) => void): () => void;
    onExit(listener: (exit: PtyExit) => void): () => void;
  };
  agents: {
    /** The agents that a session started, in the order they started. */
    list(folder: string, sessionId: string): Promise<AgentSummary[]>;
    /** The readable transcript of one agent. */
    transcript(
      folder: string,
      sessionId: string,
      agentId: string,
    ): Promise<TranscriptEntry[]>;
  };
  shells: {
    /** The background shells that a session started, in the order they first appear. */
    list(folder: string, sessionId: string): Promise<ShellSummary[]>;
    /** The last part of the output of one shell. */
    output(folder: string, sessionId: string, shellId: string): Promise<string>;
  };
  /** The number of sessions that wait for the user, and a PNG data URL of the badge to show on the taskbar. */
  setWaitingCount(count: number, badge: string): void;
  /** Opens a folder in the file manager of the system. */
  openFolder(path: string): void;
  /** Tells the main process which themes exist and which is current, for the Theme menu. */
  setThemeMenu(names: string[], current: string): void;
  /** A theme chosen in the Theme menu. */
  onSetTheme(listener: (name: string) => void): () => void;
  update: {
    /** The newer release that the last check found, or null. */
    get(): Promise<UpdateInfo | null>;
    /** A check finds a newer release. */
    onAvailable(listener: (info: UpdateInfo) => void): () => void;
  };
  windows: {
    undock(id: string, title: string): void;
    dock(id: string): void;
    nextDisplay(id: string): void;
    onDockedBack(listener: (id: string) => void): () => void;
    onReveal(listener: (id: string) => void): () => void;
    /** Ctrl+Tab and Ctrl+Shift+Tab, caught by the main process before the page sees the key. */
    onCycleTabs(listener: (backwards: boolean) => void): () => void;
    setTitle(id: string, title: string): void;
  };
}
