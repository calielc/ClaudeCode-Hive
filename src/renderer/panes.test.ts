import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activate,
  addTab,
  CAPACITY,
  cycle,
  detach,
  dockBack,
  initialPaneState,
  moveTab,
  moveTabToEnd,
  type PaneState,
  removeTab,
  selectPane,
  setLayout,
  show,
} from "./panes.ts";

/** Opens the tabs one by one, then goes back to the first one, as a user would. */
function withTabs(layout: PaneState["layout"], ...ids: string[]): PaneState {
  const state = ids.reduce(
    (current, id) => addTab(current, id),
    initialPaneState(layout),
  );
  return ids.length > 0 ? activate(state, ids[0] as string) : state;
}

const visible = (state: PaneState): (string | null)[] =>
  state.slots.slice(0, CAPACITY[state.layout]);

test("first tab fills the single pane", () => {
  const state = withTabs("single", "a");
  assert.deepEqual(visible(state).slice(0, 1), ["a"]);
  assert.equal(state.selectedTabId, "a");
});

test("switching to side by side: current tab first, the next tab second", () => {
  let state = withTabs("single", "a", "b", "c");
  state = activate(state, "b");
  state = setLayout(state, "sideBySide");
  assert.deepEqual(visible(state).slice(0, 2), ["b", "c"]);
  assert.equal(state.selectedTabId, "b");
});

test("the next tab wraps around the end of the tab list", () => {
  let state = withTabs("single", "a", "b", "c");
  state = activate(state, "c");
  state = setLayout(state, "sideBySide");
  assert.deepEqual(visible(state).slice(0, 2), ["c", "a"]);
});

test("grid fills four panes in tab order after the current tab", () => {
  let state = withTabs("single", "a", "b", "c", "d", "e");
  state = activate(state, "b");
  state = setLayout(state, "grid");
  assert.deepEqual(visible(state), ["b", "c", "d", "e"]);
});

test("clicking a visible tab only selects its pane and moves nothing", () => {
  let state = withTabs("single", "a", "b", "c");
  state = setLayout(state, "sideBySide");
  const before = [...state.slots];
  state = activate(state, "b");
  assert.deepEqual(state.slots, before);
  assert.equal(state.activePane, before.indexOf("b"));
  assert.equal(state.selectedTabId, "b");
});

test("clicking a hidden tab replaces the session in the selected pane", () => {
  let state = withTabs("single", "a", "b", "c");
  state = setLayout(state, "sideBySide");
  assert.deepEqual(visible(state).slice(0, 2), ["a", "b"]);
  state = selectPane(state, 1);
  state = activate(state, "c");
  assert.deepEqual(visible(state).slice(0, 2), ["a", "c"]);
  assert.equal(state.selectedTabId, "c");
  assert.ok(state.tabIds.includes("b"), "the replaced tab stays open");
});

test("a new tab goes to the first empty pane before it replaces anything", () => {
  let state = withTabs("single", "a");
  state = setLayout(state, "sideBySide");
  assert.deepEqual(visible(state).slice(0, 2), ["a", null]);
  state = addTab(state, "b");
  assert.deepEqual(visible(state).slice(0, 2), ["a", "b"]);
  state = addTab(state, "c");
  assert.deepEqual(
    visible(state).slice(0, 2),
    ["a", "c"],
    "all panes are full, so c replaces the selected pane",
  );
});

test("dropping a visible tab on another pane swaps the two panes", () => {
  let state = withTabs("single", "a", "b");
  state = setLayout(state, "sideBySide");
  state = show(state, "b", 0);
  assert.deepEqual(visible(state).slice(0, 2), ["b", "a"]);
});

test("closing a visible tab fills its pane with the next hidden tab", () => {
  let state = withTabs("single", "a", "b", "c");
  state = setLayout(state, "sideBySide");
  state = removeTab(state, "a");
  assert.deepEqual(visible(state).slice(0, 2), ["c", "b"]);
});

test("a shrinking layout keeps the active session", () => {
  let state = withTabs("single", "a", "b", "c", "d");
  state = setLayout(state, "grid");
  state = selectPane(state, 3);
  assert.equal(state.selectedTabId, "d");
  state = setLayout(state, "single");
  assert.equal(state.slots[0], "d");
  assert.equal(state.activePane, 0);
});

test("undocking removes the tab from its pane, docking brings it back", () => {
  let state = withTabs("single", "a", "b");
  state = setLayout(state, "sideBySide");
  state = detach(state, "a");
  assert.ok(!state.slots.includes("a"));
  state = dockBack(state, "a");
  assert.ok(state.slots.includes("a"));
  assert.equal(state.selectedTabId, "a");
});

test("Ctrl+Tab cycles forwards and backwards and wraps", () => {
  let state = withTabs("single", "a", "b", "c");
  state = activate(state, "c");
  assert.equal(cycle(state, false), "a");
  assert.equal(cycle(state, true), "b");
  assert.equal(cycle(withTabs("single", "a"), false), null);
});

test("Ctrl+Tab skips a tab in its own window", () => {
  let state = withTabs("single", "a", "b", "c", "d");
  state = detach(state, "b");
  state = detach(state, "c");
  assert.equal(cycle(activate(state, "a"), false), "d");
  assert.equal(cycle(activate(state, "d"), false), "a");
  assert.equal(cycle(activate(state, "a"), true), "d");
  assert.equal(cycle(activate(state, "d"), true), "a");
});

test("Ctrl+Tab from a selected tab in its own window goes to the first or last docked tab", () => {
  let state = withTabs("single", "a", "b", "c");
  state = detach(state, "b");
  state = activate(state, "b");
  assert.equal(state.selectedTabId, "b");
  assert.equal(cycle(state, false), "a");
  assert.equal(cycle(state, true), "c");
});

test("Ctrl+Tab does nothing when fewer than two tabs are docked", () => {
  let state = withTabs("single", "a", "b", "c");
  state = detach(state, "b");
  state = detach(state, "c");
  assert.equal(cycle(state, false), null);
  assert.equal(cycle(state, true), null);
  state = detach(state, "a");
  assert.equal(cycle(state, false), null);
});

test("undocking the selected tab selects the docked tab that takes its pane", () => {
  let state = withTabs("single", "a", "b", "c");
  state = activate(state, "b");
  state = detach(state, "b");
  assert.ok(state.selectedTabId !== "b");
  assert.ok(state.selectedTabId === "a" || state.selectedTabId === "c");
  assert.equal(state.selectedTabId, state.slots[state.activePane]);
  assert.deepEqual(state.tabIds, ["a", "b", "c"]);
  assert.deepEqual(state.detached, ["b"]);
});

test("undocking a tab that is not selected keeps the selection", () => {
  let state = withTabs("single", "a", "b", "c");
  state = activate(state, "a");
  state = detach(state, "c");
  assert.equal(state.selectedTabId, "a");
});

test("undocking the last docked tab leaves no selected tab and no pane session", () => {
  let state = withTabs("sideBySide", "a", "b");
  state = detach(state, "a");
  state = detach(state, "b");
  assert.equal(state.selectedTabId, null);
  assert.deepEqual(visible(state), [null, null]);
  assert.deepEqual(state.tabIds, ["a", "b"]);
  assert.deepEqual(state.detached, ["a", "b"]);
});

test("docking back keeps the tab order and selects the tab", () => {
  let state = withTabs("single", "a", "b", "c");
  state = detach(state, "b");
  state = dockBack(state, "b");
  assert.deepEqual(state.tabIds, ["a", "b", "c"]);
  assert.deepEqual(state.detached, []);
  assert.equal(state.selectedTabId, "b");
  assert.equal(state.slots[0], "b");
});

test("a tab moves before or after another tab", () => {
  const state = withTabs("single", "a", "b", "c", "d");
  assert.deepEqual(moveTab(state, "d", "a", false).tabIds, [
    "d",
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(moveTab(state, "a", "c", true).tabIds, ["b", "c", "a", "d"]);
  assert.deepEqual(moveTab(state, "a", "c", false).tabIds, [
    "b",
    "a",
    "c",
    "d",
  ]);
  assert.deepEqual(moveTabToEnd(state, "a").tabIds, ["b", "c", "d", "a"]);
});

test("moving a tab onto itself or onto an unknown tab changes nothing", () => {
  const state = withTabs("single", "a", "b", "c");
  assert.deepEqual(moveTab(state, "b", "b", true).tabIds, ["a", "b", "c"]);
  assert.deepEqual(moveTab(state, "b", "zzz", true).tabIds, ["a", "b", "c"]);
  assert.deepEqual(moveTab(state, "zzz", "a", true).tabIds, ["a", "b", "c"]);
});

test("reordering does not change which session shows in which pane", () => {
  let state = withTabs("single", "a", "b", "c");
  state = setLayout(state, "sideBySide");
  const before = [...state.slots];
  state = moveTab(state, "c", "a", false);
  assert.deepEqual(state.slots, before);
  assert.equal(state.selectedTabId, "a");
});

test("Ctrl+Tab follows the new order", () => {
  let state = withTabs("single", "a", "b", "c");
  state = moveTab(state, "c", "a", false);
  assert.deepEqual(state.tabIds, ["c", "a", "b"]);
  assert.equal(cycle(activate(state, "a"), false), "b");
  assert.equal(cycle(activate(state, "c"), true), "b");
});

test("the 3x3 and 4x4 layouts hold 9 and 16 panes and fill them in tab order", () => {
  const ids = Array.from({ length: 12 }, (_, index) => `t${index}`);
  const nine = setLayout(withTabs("single", ...ids), "grid3");
  assert.deepEqual(visible(nine), ids.slice(0, 9));
  const sixteen = setLayout(nine, "grid4");
  assert.deepEqual(visible(sixteen), [...ids, null, null, null, null]);
  const back = setLayout(selectPane(sixteen, 11), "grid");
  assert.equal(visible(back).length, 4);
  assert.equal(back.activePane, 0);
});
