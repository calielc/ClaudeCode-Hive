import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function checkTitle(title: string): { status: number | null; text: string } {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "scripts/release-version.ts",
      "--check-title",
      title,
    ],
    { encoding: "utf8" },
  );
  return { status: result.status, text: result.stdout + result.stderr };
}

test("a title with a known type passes the check", () => {
  assert.equal(checkTitle("feat: add a thing").status, 0);
  assert.equal(checkTitle("fix(ui)!: break a thing").status, 0);
});

test("a title without the form, or with an unknown type, fails with a message", () => {
  const plain = checkTitle("add a thing");
  assert.equal(plain.status, 1);
  assert.match(plain.text, /type: description/);
  assert.equal(checkTitle("wip: add a thing").status, 1);
  assert.equal(checkTitle("").status, 1);
});
