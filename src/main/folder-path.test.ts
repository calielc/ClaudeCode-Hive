import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveFolder } from "./folder-path.ts";

function home(): string {
  const root = mkdtempSync(join(tmpdir(), "hive-folder-"));
  mkdirSync(join(root, "work", "shop"), { recursive: true });
  writeFileSync(join(root, "notes.txt"), "x");
  return root;
}

test("an absolute path of a folder gives that folder", () => {
  const root = home();
  const shop = join(root, "work", "shop");
  assert.equal(resolveFolder(shop, root), shop);
  assert.equal(resolveFolder(`  ${shop}  `, root), shop);
  assert.equal(resolveFolder(`"${shop}"`, root), shop);
});

test("a tilde means the home folder, and a relative path starts there", () => {
  const root = home();
  const shop = join(root, "work", "shop");
  assert.equal(resolveFolder("~", root), root);
  assert.equal(resolveFolder("~/work/shop", root), shop);
  // A backslash separates folders on Windows only. Elsewhere it is a character of the name.
  if (process.platform === "win32") {
    assert.equal(resolveFolder("~\\work\\shop", root), shop);
  }
  assert.equal(resolveFolder("work/shop", root), shop);
  assert.equal(resolveFolder(join(shop, ".."), root), join(root, "work"));
});

test("a file, a missing path or an empty text is not a folder", () => {
  const root = home();
  assert.equal(resolveFolder(join(root, "notes.txt"), root), null);
  assert.equal(resolveFolder(join(root, "missing"), root), null);
  assert.equal(resolveFolder("", root), null);
  assert.equal(resolveFolder('  ""  ', root), null);
  assert.equal(resolveFolder(42, root), null);
});
