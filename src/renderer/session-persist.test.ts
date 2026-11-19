import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSession } from "./session-persist.ts";

const good = {
  tabs: [
    { id: "a", folder: "/work", title: "One", resume: true },
    { id: "b", folder: "/work", title: "Two", resume: false },
  ],
  tabIds: ["b", "a"],
  detached: ["b"],
  slots: ["a", null, null, null],
  activePane: 0,
  selectedTabId: "a",
};

test("a saved session comes back as it was saved, with the tab order of the tabs", () => {
  const session = parseSession(JSON.stringify(good));
  assert.deepEqual(
    session?.tabs.map((tab) => tab.id),
    ["a", "b"],
  );
  assert.deepEqual(session?.slots, ["a", null, null, null]);
  assert.deepEqual(session?.detached, ["b"]);
  assert.equal(session?.selectedTabId, "a");
  assert.equal(session?.tabs[1]?.resume, false);
});

test("nothing saved, or a broken value, gives no session", () => {
  assert.equal(parseSession(null), null);
  assert.equal(parseSession(""), null);
  assert.equal(parseSession("{not json"), null);
  assert.equal(parseSession("42"), null);
  assert.equal(parseSession('{"tabs":"x"}'), null);
});

test("entries that do not fit are dropped, not trusted", () => {
  const session = parseSession(
    JSON.stringify({
      tabs: [
        { id: "a", folder: "/w", title: "A" },
        { id: 5 },
        { id: "a", folder: "/w", title: "duplicate" },
        null,
      ],
      detached: ["a", "ghost"],
      slots: ["ghost", "a", 7],
      activePane: 99,
      selectedTabId: "ghost",
    }),
  );
  assert.deepEqual(
    session?.tabs.map((tab) => tab.title),
    ["A"],
  );
  assert.deepEqual(session?.detached, ["a"]);
  assert.deepEqual(session?.slots, [null, "a", null, null]);
  assert.equal(session?.activePane, 0);
  assert.equal(session?.selectedTabId, null);
  assert.equal(session?.tabs[0]?.resume, true);
});
