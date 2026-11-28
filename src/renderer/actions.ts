import type { OpenTabRef, SessionInfo } from "@shared/types";
import { clampFontSize } from "./font-size";
import {
  activate as activatePane,
  addTab,
  cycle,
  detach as detachPane,
  dockBack,
  type LayoutMode,
  moveTab,
  moveTabToEnd,
  type PaneState,
  removeTab,
  selectPane as selectPaneState,
  setLayout as setLayoutState,
  show,
} from "./panes";
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH } from "./sidebar-width";
import { getState, setState, type Tab } from "./state";
import {
  applyTheme,
  createEntry,
  disposeEntry,
  focusEntry,
  getEntry,
  onProcessExit,
} from "./terminals";
import { themeNamed } from "./themes";

const hive = (): typeof window.hive => window.hive;

const paneKeys = [
  "tabIds",
  "detached",
  "slots",
  "activePane",
  "selectedTabId",
  "layout",
] as const;

function paneState(): PaneState {
  const { tabIds, detached, slots, activePane, selectedTabId, layout } =
    getState();
  return { tabIds, detached, slots, activePane, selectedTabId, layout };
}

function applyPanes(next: PaneState): void {
  setState(Object.fromEntries(paneKeys.map((key) => [key, next[key]])));
}

// MARK: Tabs

/** After a reload of the page: makes a terminal for every restored tab. It attaches to the process that still runs. */
export function restoreTerminals(): void {
  const theme = themeNamed(getState().themeName);
  for (const tab of getState().tabs) {
    createEntry(tab.id, tab.folder, tab.resume, theme);
  }
}

export function newSession(): void {
  const { selectedFolder } = getState();
  openTab({
    id: crypto.randomUUID(),
    folder: selectedFolder,
    title: "New Session",
    resume: false,
  });
}

export function openSession(session: SessionInfo): void {
  const tab = getState().tabs.find((item) => item.id === session.id);
  if (tab) {
    activateTab(tab.id);
    return;
  }
  openTab({
    id: session.id,
    folder: getState().selectedFolder,
    title: session.title,
    resume: true,
  });
}

function openTab(tab: Tab): void {
  createEntry(tab.id, tab.folder, tab.resume, themeNamed(getState().themeName));
  setState((current) => ({ tabs: [...current.tabs, tab] }));
  applyPanes(addTab(paneState(), tab.id));
  syncOpenTabs();
  void refresh();
}

export function activateTab(id: string): void {
  applyPanes(activatePane(paneState(), id));
  if (getState().detached.includes(id)) {
    hive().windows.undock(
      id,
      getState().tabs.find((tab) => tab.id === id)?.title ?? "Hive",
    );
  }
}

/** Closes a tab and its session. `windowIsGone` is true when the undocked window has closed already. */
export function closeTab(id: string, windowIsGone = false): void {
  if (!windowIsGone && getState().detached.includes(id)) {
    hive().windows.dock(id);
  }
  hive().pty.kill(id);
  disposeEntry(id);
  setState((current) => ({
    tabs: current.tabs.filter((tab) => tab.id !== id),
  }));
  applyPanes(removeTab(paneState(), id));
  syncOpenTabs();
  void refresh();
}

/** Puts a tab before or after another tab, or at the end when `targetId` is null. The cards on the left follow the same order. */
export function reorderTab(
  id: string,
  targetId: string | null,
  after: boolean,
): void {
  setState({ tabDrop: null });
  const next =
    targetId === null
      ? moveTabToEnd(paneState(), id)
      : moveTab(paneState(), id, targetId, after);
  applyPanes(next);
  setState((current) => {
    const position = (tabId: string): number => next.tabIds.indexOf(tabId);
    return {
      tabs: [...current.tabs].sort(
        (left, right) => position(left.id) - position(right.id),
      ),
      openSessions: [...current.openSessions].sort(
        (left, right) => position(left.id) - position(right.id),
      ),
    };
  });
  syncOpenTabs();
}

export function selectPane(index: number): void {
  applyPanes(selectPaneState(paneState(), index));
}

/** Opens the page of the newer release in the browser. */
export function openUpdatePage(): void {
  const { update } = getState();
  if (update) {
    hive().openExternal(update.url);
  }
}

/** Closes the notice of the newer release. The next release shows it again. */
export function dismissUpdate(): void {
  const { update } = getState();
  if (update) {
    setState({ dismissedUpdate: update.version });
  }
}

/**
 * Shows the left panel if it is hidden, and focuses the search field. The field focuses itself in an effect, after the
 * page has shown the panel. A field that is still hidden cannot take the focus.
 */
export function focusSearch(): void {
  setState((current) => ({
    sidebarHidden: false,
    searchFocusRequest: current.searchFocusRequest + 1,
  }));
}

/** Hides the left panel, or shows it again. */
export function toggleSidebar(): void {
  setState((current) => ({ sidebarHidden: !current.sidebarHidden }));
}

export function setSidebarWidth(width: number): void {
  setState({ sidebarWidth: clampSidebarWidth(width) });
}

export function resetSidebarWidth(): void {
  setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
}

export function setLayout(layout: LayoutMode): void {
  applyPanes(setLayoutState(paneState(), layout));
}

export function cycleTabs(backwards: boolean): void {
  const target = cycle(paneState(), backwards);
  if (target) {
    activateTab(target);
  }
}

/** A session or tab dropped on a pane. Dropping a visible tab on another pane swaps the two. */
export function dropOnPane(id: string, pane: number): void {
  setState({ dropTarget: null });
  const state = getState();
  if (state.tabs.some((tab) => tab.id === id)) {
    if (state.detached.includes(id)) {
      applyPanes({ ...paneState(), activePane: pane });
      hive().windows.dock(id);
    } else {
      applyPanes(show(paneState(), id, pane));
    }
    return;
  }
  const session = state.sessions.find((item) => item.id === id);
  if (session) {
    applyPanes({ ...paneState(), activePane: pane });
    openSession(session);
  }
}

export function undock(id: string): void {
  const tab = getState().tabs.find((item) => item.id === id);
  if (!tab || getState().detached.includes(id)) {
    return;
  }
  applyPanes(detachPane(paneState(), id));
  hive().windows.undock(id, tab.title);
}

export function dock(id: string): void {
  hive().windows.dock(id);
}

export function selectedTab(): Tab | undefined {
  const { tabs, selectedTabId } = getState();
  return tabs.find((tab) => tab.id === selectedTabId);
}

// MARK: Settings

/** Makes the font of all terminals bigger (plus steps) or smaller (minus steps). */
export function changeFontSize(steps: number): void {
  setState((current) => ({
    fontSize: clampFontSize(current.fontSize + steps),
  }));
}

export function setTheme(name: string): void {
  setState({ themeName: name });
  applyTheme(themeNamed(name));
}

export function setTag(ids: string[], tag: string | null): void {
  setState((current) => {
    const tags = { ...current.tags };
    for (const id of ids) {
      if (tag) {
        tags[id] = tag;
      } else {
        delete tags[id];
      }
    }
    return { tags };
  });
}

function selectFolder(folder: string): void {
  if (folder !== getState().selectedFolder) {
    setState({ selectedFolder: folder, isLoading: true, sessions: [] });
    void refresh();
  }
}

/** The folder button: the folder picker of the system. */
export async function pickFolder(): Promise<void> {
  const folder = await hive().pickFolder();
  if (folder) {
    selectFolder(folder);
  }
}

/** A folder path typed into the folder field. Gives false when the path is not a folder, so the field can show it. */
export async function openTypedFolder(path: string): Promise<boolean> {
  const folder = await hive().resolveFolder(path);
  if (!folder) {
    return false;
  }
  selectFolder(folder);
  return true;
}

export function setSplit(patch: { splitX?: number; splitY?: number }): void {
  const clamp = (value: number): number =>
    Math.min(0.85, Math.max(0.15, value));
  setState({
    ...(patch.splitX === undefined ? {} : { splitX: clamp(patch.splitX) }),
    ...(patch.splitY === undefined ? {} : { splitY: clamp(patch.splitY) }),
  });
}

// MARK: Data from the main process

let scanning = false;
let scanAgain = false;

function openRefs(): OpenTabRef[] {
  return getState().tabs.map((tab) => ({
    id: tab.id,
    folder: tab.folder,
    title: tab.title,
  }));
}

function syncOpenTabs(): void {
  hive().setOpenTabs(openRefs());
}

/** Reads the sessions of the selected folder and the open tabs. Tab titles follow the session names, also after /rename. */
export async function refresh(): Promise<void> {
  if (scanning) {
    scanAgain = true;
    return;
  }
  scanning = true;
  const folder = getState().selectedFolder;
  try {
    const result = await hive().scan(folder, openRefs());
    if (folder === getState().selectedFolder) {
      setState({ sessions: result.sessions, isLoading: false });
    }
    const renamed = new Map(
      result.open.map((session) => [session.id, session.title]),
    );
    setState((current) => {
      const tabs = current.tabs.map((tab) => ({
        ...tab,
        title: renamed.get(tab.id) ?? tab.title,
      }));
      const changed = tabs.some(
        (tab, index) => tab.title !== current.tabs[index]?.title,
      );
      return { openSessions: result.open, ...(changed ? { tabs } : {}) };
    });
    syncOpenTabs();
  } finally {
    scanning = false;
    if (scanAgain) {
      scanAgain = false;
      void refresh();
    }
  }
}

export async function refreshUsage(): Promise<void> {
  setState({ usage: await hive().readUsage() });
}

export async function refreshHooks(): Promise<void> {
  setState({ hooks: await hive().hooksStatus() });
}

export async function installHooks(): Promise<void> {
  setState({ hooks: await hive().installHooks() });
  void refreshUsage();
}

let searchToken = 0;

export function setQuery(query: string): void {
  setState({ query });
  const text = query.trim();
  searchToken += 1;
  const token = searchToken;
  if (text.length < 2) {
    setState({ contentMatches: [], isSearching: false });
    return;
  }
  setState({ isSearching: true });
  setTimeout(async () => {
    if (token !== searchToken) {
      return;
    }
    const ids = await hive().search(getState().selectedFolder, text);
    if (token === searchToken) {
      setState({ contentMatches: ids, isSearching: false });
    }
  }, 300);
}

/**
 * Gives the keyboard to the terminal of the selected pane. A text field that the user works in keeps the focus.
 * The hidden text area of a terminal does not count, because it must give the focus to the selected terminal.
 */
export function focusSelected(): void {
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      (active.tagName === "TEXTAREA" && !active.closest(".xterm")))
  ) {
    return;
  }
  const { selectedTabId } = getState();
  if (selectedTabId) {
    focusEntry(selectedTabId);
  }
}

/** Starts the polling and the listeners of the main window. */
export async function startMainWindow(): Promise<void> {
  const state = getState();
  if (
    state.selectedFolder === hive().home &&
    !localStorage.getItem("hive.settings.v1")
  ) {
    const folder = await hive().defaultFolder();
    setState({ selectedFolder: folder });
  }
  onProcessExit((exit) => {
    // A process that ends by itself (/exit) closes its tab. One that fails right away keeps it, so the error stays readable.
    if (
      getEntry(exit.id) &&
      (exit.exitCode === 0 || exit.ranMs >= 3000) &&
      getState().tabs.some((tab) => tab.id === exit.id)
    ) {
      closeTab(exit.id);
    }
  });
  hive().windows.onDockedBack((id) => {
    if (getState().tabs.some((tab) => tab.id === id)) {
      applyPanes(dockBack(paneState(), id));
    }
  });
  hive().windows.onClosed((id) => {
    if (getState().tabs.some((tab) => tab.id === id)) {
      closeTab(id, true);
    }
  });
  hive().windows.onReveal((id) => {
    if (getState().tabs.some((tab) => tab.id === id)) {
      activateTab(id);
    }
  });
  void hive()
    .update.get()
    .then((update) => setState({ update }));
  hive().update.onAvailable((update) => setState({ update }));
  void refresh();
  void refreshUsage();
  void refreshHooks();
  setInterval(() => void refresh(), 1500);
  setInterval(() => void refreshUsage(), 5000);
}
