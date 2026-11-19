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

/** Asks for the latest release. Any failure, such as no network, gives nothing. */
export async function fetchLatest(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateInfo | undefined> {
  try {
    const response = await fetchFn(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Hive-update-check",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return undefined;
    }
    return parseRelease(await response.json());
  } catch {
    return undefined;
  }
}

export interface UpdateCheckerOptions {
  current: string;
  url: string;
  onFound: (info: UpdateInfo) => void;
  /** Time between two checks. */
  intervalMs?: number;
  /** Time before the first check, so the start of the app stays fast. */
  delayMs?: number;
  fetchFn?: typeof fetch;
}

/** Checks for a newer release now and then. It tells the caller once for each new version. */
export class UpdateChecker {
  available: UpdateInfo | undefined;
  private readonly options: UpdateCheckerOptions;
  private timers: NodeJS.Timeout[] = [];

  constructor(options: UpdateCheckerOptions) {
    this.options = options;
  }

  async check(): Promise<void> {
    const found = await fetchLatest(this.options.url, this.options.fetchFn);
    if (
      found &&
      isNewer(found.version, this.options.current) &&
      found.version !== this.available?.version
    ) {
      this.available = found;
      this.options.onFound(found);
    }
  }

  start(): void {
    const first = setTimeout(
      () => void this.check(),
      this.options.delayMs ?? 15_000,
    );
    const repeat = setInterval(
      () => void this.check(),
      this.options.intervalMs ?? FOUR_HOURS_MS,
    );
    // A pending check must not keep the app alive.
    first.unref();
    repeat.unref();
    this.timers = [first, repeat];
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers = [];
  }
}
