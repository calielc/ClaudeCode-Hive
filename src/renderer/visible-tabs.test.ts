import assert from "node:assert/strict";
import { test } from "node:test";
import * as panes from "./panes.ts";
import { addTab, detach, dockBack, initialPaneState } from "./panes.ts";

type Tab = { id: string; title: string };

const tabs: Tab[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: `Session ${id.toUpperCase()}`,
}));

const ids = (list: Tab[]): string[] => list.map((tab) => tab.id);

/** The helper is read through the namespace, so a missing export fails each test and not the whole file. */
function visibleTabs(list: Tab[], detached: string[]): Tab[] {
  const helper = (
    panes as unknown as {
      visibleTabs?: (list: Tab[], detached: string[]) => Tab[];
    }
  ).visibleTabs;
  assert.equal(typeof helper, "function", "panes.ts must export visibleTabs");
  return (helper as (list: Tab[], detached: string[]) => Tab[])(list, detached);
}

test("visibleTabs lists every tab when nothing is undocked", () => {
  assert.deepEqual(ids(visibleTabs(tabs, [])), ["a", "b", "c", "d"]);
});

test("visibleTabs leaves out an undocked tab in the middle and keeps the order", () => {
  assert.deepEqual(ids(visibleTabs(tabs, ["b"])), ["a", "c", "d"]);
  assert.deepEqual(ids(visibleTabs(tabs, ["c", "b"])), ["a", "d"]);
});

test("visibleTabs leaves out the first and the last tab", () => {
  assert.deepEqual(ids(visibleTabs(tabs, ["a"])), ["b", "c", "d"]);
  assert.deepEqual(ids(visibleTabs(tabs, ["d"])), ["a", "b", "c"]);
});

test("visibleTabs is empty when every tab is undocked", () => {
  assert.deepEqual(visibleTabs(tabs, ["a", "b", "c", "d"]), []);
});

test("visibleTabs is empty when there are no tabs", () => {
  assert.deepEqual(visibleTabs([], ["a"]), []);
});

test("visibleTabs ignores an undocked id that is not in the tabs", () => {
  assert.deepEqual(ids(visibleTabs(tabs, ["ghost", "b"])), ["a", "c", "d"]);
});

test("visibleTabs returns the same tab objects and does not change its input", () => {
  const detached = ["b"];
  const result = visibleTabs(tabs, detached);
  assert.equal(result[0], tabs[0]);
  assert.equal(tabs.length, 4);
  assert.deepEqual(detached, ["b"]);
});

test("a tab comes back at its original position after undock and dock", () => {
  let state = ["a", "b", "c", "d"].reduce(
    (current, id) => addTab(current, id),
    initialPaneState("single"),
  );
  for (const id of ["a", "b", "d"]) {
    const before = ids(visibleTabs(tabs, []));
    state = detach(state, id);
    assert.ok(!ids(visibleTabs(tabs, state.detached)).includes(id));
    state = dockBack(state, id);
    assert.deepEqual(ids(visibleTabs(tabs, state.detached)), before);
  }
});
