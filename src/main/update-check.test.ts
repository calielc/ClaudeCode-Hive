import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchLatest,
  isNewer,
  parseRelease,
  UpdateChecker,
} from "./update-check.ts";

const release = {
  tag_name: "v2.1.0",
  html_url: "https://github.com/calielc/ClaudeCode-Hive/releases/tag/v2.1.0",
  draft: false,
  prerelease: false,
};

function answer(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status }),
    )) as typeof fetch;
}

test("a higher version is newer, a lower or equal one is not", () => {
  assert.equal(isNewer("2.0.1", "2.0.0"), true);
  assert.equal(isNewer("2.1.0", "2.0.9"), true);
  assert.equal(isNewer("3.0.0", "2.9.9"), true);
  assert.equal(isNewer("v2.10.0", "2.9.0"), true);
  assert.equal(isNewer("2.0.0", "2.0.0"), false);
  assert.equal(isNewer("1.9.9", "2.0.0"), false);
});

test("a pre-release is older than its release, and text that is no version is never newer", () => {
  assert.equal(isNewer("2.1.0", "2.1.0-beta.1"), true);
  assert.equal(isNewer("2.1.0-beta.1", "2.1.0"), false);
  assert.equal(isNewer("2.1.0-beta.2", "2.1.0-beta.1"), false);
  assert.equal(isNewer("latest", "2.0.0"), false);
  assert.equal(isNewer("2.1", "2.0.0"), false);
  assert.equal(isNewer("2.1.0", "dev"), false);
});

test("parseRelease takes the tag and the page, and refuses drafts and pre-releases", () => {
  assert.deepEqual(parseRelease(release), {
    version: "2.1.0",
    url: release.html_url,
  });
  assert.equal(parseRelease({ ...release, draft: true }), undefined);
  assert.equal(parseRelease({ ...release, prerelease: true }), undefined);
  assert.equal(parseRelease({ ...release, tag_name: "nightly" }), undefined);
  assert.equal(parseRelease({ ...release, html_url: "file:///x" }), undefined);
  assert.equal(parseRelease({ tag_name: 5 }), undefined);
  assert.equal(parseRelease(null), undefined);
  assert.equal(parseRelease("text"), undefined);
});

test("fetchLatest gives nothing for bad data, and throws when the request fails", async () => {
  assert.equal(
    (await fetchLatest("http://x", answer(release)))?.version,
    "2.1.0",
  );
  assert.equal(
    await fetchLatest("http://x", answer("not a release")),
    undefined,
  );
  assert.equal(
    await fetchLatest("http://x", answer({ ...release, draft: true })),
    undefined,
  );
  await assert.rejects(fetchLatest("http://x", answer({}, 404)), /404/);
  const offline = (() => Promise.reject(new Error("offline"))) as typeof fetch;
  await assert.rejects(fetchLatest("http://x", offline), /offline/);
});

test("the checker tells the caller once for each new version", async () => {
  const found: string[] = [];
  let body: unknown = release;
  const checker = new UpdateChecker({
    current: "2.0.0",
    url: "http://x",
    onFound: (info) => found.push(info.version),
    fetchFn: ((url: string, init: RequestInit) =>
      answer(body)(url, init)) as typeof fetch,
  });
  await checker.check();
  await checker.check();
  assert.deepEqual(found, ["2.1.0"]);
  assert.equal(checker.available?.version, "2.1.0");
  body = { ...release, tag_name: "v2.2.0" };
  await checker.check();
  assert.deepEqual(found, ["2.1.0", "2.2.0"]);
});

test("the checker says nothing when the release is not newer", async () => {
  const found: string[] = [];
  const checker = new UpdateChecker({
    current: "2.1.0",
    url: "http://x",
    onFound: (info) => found.push(info.version),
    fetchFn: answer(release),
  });
  await checker.check();
  assert.deepEqual(found, []);
  assert.equal(checker.available, undefined);
});

test("a failed check gives false and a line in the log, and a good check gives true", async () => {
  const lines: string[] = [];
  const offline = (() => Promise.reject(new Error("offline"))) as typeof fetch;
  const failing = new UpdateChecker({
    current: "2.0.0",
    url: "http://x",
    onFound: () => undefined,
    log: (line) => lines.push(line),
    fetchFn: offline,
  });
  assert.equal(await failing.check(), false);
  assert.match(lines.join(" "), /check failed.*offline/);

  const working = new UpdateChecker({
    current: "2.0.0",
    url: "http://x",
    onFound: () => undefined,
    fetchFn: answer(release),
  });
  assert.equal(await working.check(), true);
});

test("a check that failed is tried again soon, and the release is found then", async () => {
  const found: string[] = [];
  let calls = 0;
  const checker = new UpdateChecker({
    current: "2.0.0",
    url: "http://x",
    delayMs: 5,
    retryMs: 20,
    // A long normal time proves that the second try came from the quick retry.
    intervalMs: 60_000,
    onFound: (info) => found.push(info.version),
    fetchFn: (() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(new Response(JSON.stringify(release)));
    }) as typeof fetch,
  });
  checker.start();
  try {
    const end = Date.now() + 3000;
    while (found.length === 0 && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(found, ["2.1.0"]);
    assert.equal(calls, 2);
  } finally {
    checker.stop();
  }
});

test("a message to the windows that fails does not hide the release", async () => {
  const checker = new UpdateChecker({
    current: "2.0.0",
    url: "http://x",
    onFound: () => {
      throw new Error("the window is not ready");
    },
    fetchFn: answer(release),
  });
  assert.equal(await checker.check(), true);
  assert.equal(checker.available?.version, "2.1.0");
});
