import type { HiveApi, OpenTabRef, PtyExit, UpdateInfo } from "@shared/types";
import { contextBridge, ipcRenderer } from "electron";

function listen<Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void,
): () => void {
  const handler = (
    _event: Electron.IpcRendererEvent,
    ...args: unknown[]
  ): void => listener(...(args as Args));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: HiveApi = {
  platform: process.platform,
  debug: process.env.HIVE_DEBUG === "1",
  // The main process resolves the home folder of the user with the operating system. A shell can set HOME to a path style that Windows does not use, such as /c/Users/name.
  home: ipcRenderer.sendSync("app:home") as string,
  defaultFolder: () => ipcRenderer.invoke("app:defaultFolder"),
  scan: (folder, open) => ipcRenderer.invoke("sessions:scan", folder, open),
  search: (folder, text) => ipcRenderer.invoke("sessions:search", folder, text),
  readUsage: () => ipcRenderer.invoke("usage:read"),
  hooksStatus: () => ipcRenderer.invoke("hooks:status"),
  installHooks: () => ipcRenderer.invoke("hooks:install"),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  setOpenTabs: (tabs: OpenTabRef[]) => ipcRenderer.send("tabs:setOpen", tabs),
  openExternal: (url) => ipcRenderer.send("app:openExternal", url),
  pty: {
    attach: (id, options) => ipcRenderer.invoke("pty:attach", id, options),
    write: (id, data) => ipcRenderer.send("pty:write", id, data),
    resize: (id, cols, rows) => ipcRenderer.send("pty:resize", id, cols, rows),
    kill: (id) => ipcRenderer.send("pty:kill", id),
    onData: (listener) => listen<[string, string]>("pty:data", listener),
    onExit: (listener) => listen<[PtyExit]>("pty:exit", listener),
  },
  agents: {
    list: (folder, sessionId) =>
      ipcRenderer.invoke("agents:list", folder, sessionId),
    transcript: (folder, sessionId, agentId) =>
      ipcRenderer.invoke("agents:transcript", folder, sessionId, agentId),
  },
  shells: {
    list: (folder, sessionId) =>
      ipcRenderer.invoke("shells:list", folder, sessionId),
    output: (folder, sessionId, shellId) =>
      ipcRenderer.invoke("shells:output", folder, sessionId, shellId),
  },
  background: {
    list: (folder, sessionId) =>
      ipcRenderer.invoke("background:list", folder, sessionId),
    detail: (folder, sessionId, id) =>
      ipcRenderer.invoke("background:detail", folder, sessionId, id),
  },
  setWaitingCount: (count, badge) =>
    ipcRenderer.send("badge:set", count, badge),
  openFolder: (path) => ipcRenderer.send("app:openFolder", path),
  setThemeMenu: (names, current) =>
    ipcRenderer.send("theme:menu", names, current),
  onSetTheme: (listener) => listen<[string]>("theme:set", listener),
  update: {
    get: () => ipcRenderer.invoke("update:get"),
    onAvailable: (listener) =>
      listen<[UpdateInfo]>("update:available", listener),
  },
  windows: {
    undock: (id, title) => ipcRenderer.send("windows:undock", id, title),
    dock: (id) => ipcRenderer.send("windows:dock", id),
    onDockedBack: (listener) =>
      listen<[string]>("windows:docked-back", listener),
    onClosed: (listener) => listen<[string]>("windows:closed", listener),
    onReveal: (listener) => listen<[string]>("windows:reveal", listener),
    onCycleTabs: (listener) => listen<[boolean]>("shortcut:cycle", listener),
    setTitle: (id, title) => ipcRenderer.send("windows:setTitle", id, title),
  },
};

contextBridge.exposeInMainWorld("hive", api);
