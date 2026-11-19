/**
 * Chooses the version of the next release from the commits since the last release tag.
 *
 *   node scripts/release-version.ts                      reads git and writes the result to GITHUB_OUTPUT
 *   node scripts/release-version.ts --check-title "..."  exits with 1 if the title is not `type: description`
 *
 * The workflow `.github/workflows/release.yml` runs the first form on each push to `main`.
 * The workflow `.github/workflows/pr-title.yml` runs the second form on each pull request.
 * Node 22.18 or later runs this file directly. No install is needed.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import {
  bumpFor,
  bumpVersion,
  type Commit,
  highestTag,
  isConventionalTitle,
  TYPES,
} from "./next-version.ts";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function output(values: Record<string, string>): void {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}

function checkTitle(title: string): void {
  if (isConventionalTitle(title)) {
    console.log(`The title is fine: ${title}`);
    return;
  }
  console.error(
    `The title must have the form "type: description". The types are ${TYPES.join(", ")}.\n` +
      `A "!" before the colon, as in "feat!: ...", marks a breaking change.\nThe title is: ${title}`,
  );
  process.exit(1);
}

function chooseVersion(): void {
  const tag = highestTag(git("tag", "--list", "v*").split("\n"));
  // Without a tag, the version in package.json is the start and all commits count.
  const base =
    tag ??
    `v${(JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version}`;
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const commits: Commit[] = git("log", "--no-merges", "--format=%B%x1e", range)
    .split("\x1e")
    .map((message) => message.trim())
    .filter(Boolean)
    .map((message) => {
      const [subject = "", ...rest] = message.split("\n");
      return { subject, body: rest.join("\n") };
    });
  const bump = bumpFor(commits);
  console.log(
    `${commits.length} commits since ${tag ?? "the start"}. The biggest change is: ${bump}.`,
  );
  output({
    release: bump === "none" ? "false" : "true",
    bump,
    previous: tag ?? "",
    version: bump === "none" ? "" : bumpVersion(base, bump),
  });
}

const titleAt = process.argv.indexOf("--check-title");
if (titleAt >= 0) {
  checkTitle(process.argv[titleAt + 1] ?? "");
} else {
  chooseVersion();
}
