import type { UpdateInfo } from "@shared/types";

/** The newest published release of Hive. GitHub leaves out drafts and pre-releases here. */
export const RELEASES_URL =
  "https://api.github.com/repos/calielc/ClaudeCode-Hive/releases/latest";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

interface Version {
  core: [number, number, number];
  prerelease: string;
}

function parseVersion(text: string): Version | undefined {
  const match = text
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  if (!match) {
    return undefined;
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? "",
  };
}

/**
 * True when `candidate` is a newer version than `current`. A text that is not a version is never newer.
 * A pre-release is older than the release with the same numbers. Two pre-releases of one version do not compare.
 */
export function isNewer(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const now = parseVersion(current);
  if (!next || !now) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    const difference = (next.core[index] ?? 0) - (now.core[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return next.prerelease === "" && now.prerelease !== "";
}

/** Reads the answer of the releases API. A draft, a pre-release or an answer of the wrong shape gives nothing. */
export function parseRelease(json: unknown): UpdateInfo | undefined {
  if (typeof json !== "object" || json === null) {
    return undefined;
  }
  const release = json as Record<string, unknown>;
  const tag = release.tag_name;
  const url = release.html_url;
  if (release.draft === true || release.prerelease === true) {
    return undefined;
  }
  if (typeof tag !== "string" || typeof url !== "string") {
    return undefined;
  }
  if (!parseVersion(tag) || !/^https?:\/\//.test(url)) {
    return undefined;
  }
  return { version: tag.trim().replace(/^v/i, ""), url };
}

/**
 * Asks for the latest release. It gives nothing when the answer is not a usable release, for example a draft.
 * It throws when the request fails, so the caller can try again soon.
 */
export async function fetchLatest(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateInfo | undefined> {
  const response = await fetchFn(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Hive-update-check",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`The answer was ${response.status}.`);
  }
  return parseRelease(await response.json());
}

export interface UpdateCheckerOptions {
  current: string;
  url: string;
  onFound: (info: UpdateInfo) => void;
  /** Time between two checks. */
  intervalMs?: number;
  /** Time before the first check, so the start of the app stays fast. */
  delayMs?: number;
  /** Time before the next try after a check failed, for example without a network. */
  retryMs?: number;
  /** Gets a line for each step. For tests and for finding faults. */
  log?: (message: string) => void;
  fetchFn?: typeof fetch;
}

/** After this many failed checks in a row, the checker waits the normal time again. */
const MAX_QUICK_RETRIES = 3;

/**
 * Checks for a newer release now and then. It tells the caller once for each new version.
 * A failed check, for example on a laptop that wakes up without a network, tries again soon and not after hours.
 */
export class UpdateChecker {
  available: UpdateInfo | undefined;
  private readonly options: UpdateCheckerOptions;
  private timer: NodeJS.Timeout | undefined;
  private failures = 0;
  private stopped = false;

  constructor(options: UpdateCheckerOptions) {
    this.options = options;
  }

  private log(message: string): void {
    this.options.log?.(message);
  }

  /** One check. It gives true if the request worked, with or without a newer release. */
  async check(): Promise<boolean> {
    let found: UpdateInfo | undefined;
    try {
      found = await fetchLatest(this.options.url, this.options.fetchFn);
    } catch (error) {
      this.log(`The check failed: ${String(error)}`);
      return false;
    }
    this.log(
      `The check worked. The latest release is ${found?.version ?? "none"}.`,
    );
    if (
      found &&
      isNewer(found.version, this.options.current) &&
      found.version !== this.available?.version
    ) {
      this.available = found;
      try {
        this.options.onFound(found);
      } catch (error) {
        // The release is kept in `available`, so a page that loads later can still ask for it.
        this.log(`The message to the windows failed: ${String(error)}`);
      }
    }
    return true;
  }

  start(): void {
    this.stopped = false;
    this.schedule(this.options.delayMs ?? 15_000);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => void this.run(), delayMs);
  }

  private async run(): Promise<void> {
    const worked = await this.check();
    this.failures = worked ? 0 : this.failures + 1;
    const interval = this.options.intervalMs ?? FOUR_HOURS_MS;
    const retry = this.options.retryMs ?? 60_000;
    this.schedule(
      worked || this.failures > MAX_QUICK_RETRIES ? interval : retry,
    );
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
