import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { projectDirectory, repoName } from "./paths.ts";

test("a project folder is named like Claude Code names it", () => {
  process.env.CLAUDE_CONFIG_DIR = "/config";
  assert.equal(
    projectDirectory("/Users/me/code"),
    join("/config", "projects", "-Users-me-code"),
  );
  assert.equal(
    projectDirectory("/Users/me/.hidden/app"),
    join("/config", "projects", "-Users-me--hidden-app"),
  );
  assert.equal(
    projectDirectory("C:\\Users\\me\\code"),
    join("/config", "projects", "C--Users-me-code"),
  );
});

test("the repo name is the folder that has .git, found from a sub folder", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-repo-"));
  mkdirSync(join(root, "my-repo", ".git"), { recursive: true });
  mkdirSync(join(root, "my-repo", "src", "deep"), { recursive: true });
  mkdirSync(join(root, "plain"), { recursive: true });
  assert.equal(repoName(join(root, "my-repo", "src", "deep")), "my-repo");
  assert.equal(repoName(join(root, "plain")), "plain");
  writeFileSync(join(root, "my-repo", "file"), "");
});
