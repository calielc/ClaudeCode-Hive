import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { nextRelease } from "./git-version.ts";

/** A throw-away repository. The test moves into it, because nextRelease reads the current folder. */
function repository(): (...args: string[]) => void {
  const directory = mkdtempSync(join(tmpdir(), "hive-git-"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ version: "2.0.0" }),
  );
  process.chdir(directory);
  const git = (...args: string[]): void => {
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { stdio: "ignore" },
    );
  };
  git("init", "-q");
  return git;
}

test("without a tag, the version of package.json is the base and all commits count", () => {
  const git = repository();
  git("commit", "-q", "--allow-empty", "-m", "feat: first");
  git("commit", "-q", "--allow-empty", "-m", "docs: second");
  const next = nextRelease();
  assert.equal(next.previous, "");
  assert.equal(next.base, "2.0.0");
  assert.equal(next.bump, "minor");
  assert.equal(next.version, "2.1.0");
  assert.equal(next.commits, 2);
});

test("only the commits after the highest tag count", () => {
  const git = repository();
  git("commit", "-q", "--allow-empty", "-m", "feat!: old break");
  git("tag", "v2.1.0");
  git("tag", "v2.10.0");
  git("tag", "v2.9.0");
  git("tag", "v3.0.0-beta.1");
  git("commit", "-q", "--allow-empty", "-m", "fix: small");
  git("commit", "-q", "--allow-empty", "-m", "chore: tidy");
  const next = nextRelease();
  assert.equal(next.previous, "v2.10.0", "2.10.0 is higher than 2.9.0");
  assert.equal(next.base, "2.10.0");
  assert.equal(next.bump, "patch");
  assert.equal(next.version, "2.10.1");
  assert.equal(next.commits, 2);
});

test("a BREAKING CHANGE line in the body gives a major version", () => {
  const git = repository();
  git("commit", "-q", "--allow-empty", "-m", "feat: a");
  git("tag", "v2.0.0");
  git(
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "fix: b\n\nBREAKING CHANGE: the file moved",
  );
  assert.equal(nextRelease().version, "3.0.0");
});

test("no commit after the tag gives no version", () => {
  const git = repository();
  git("commit", "-q", "--allow-empty", "-m", "feat: a");
  git("tag", "v2.0.0");
  const next = nextRelease();
  assert.equal(next.bump, "none");
  assert.equal(next.version, "");
  assert.equal(next.commits, 0);
});
