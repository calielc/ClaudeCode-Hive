import { contextBridge, ipcRenderer } from 'electron'
import type { HiveApi, OpenTabRef, PtyExit } from '@shared/types'

function listen<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => listener(...(args as Args))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: HiveApi = {
  platform: process.platform,
  debug: process.env.HIVE_DEBUG === '1',
  home: process.env.HOME ?? process.env.USERPROFILE ?? '',
  defaultFolder: () => ipcRenderer.invoke('app:defaultFolder'),
  scan: (folder, open) => ipcRenderer.invoke('sessions:scan', folder, open),
  search: (folder, text) => ipcRenderer.invoke('sessions:search', folder, text),
  readUsage: () => ipcRenderer.invoke('usage:read'),
  hooksStatus: () => ipcRenderer.invoke('hooks:status'),
  installHooks: () => ipcRenderer.invoke('hooks:install'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  setOpenTabs: (tabs: OpenTabRef[]) => ipcRenderer.send('tabs:setOpen', tabs),
  openExternal: (url) => ipcRenderer.send('app:openExternal', url),
  pty: {
    attach: (id, options) => ipcRenderer.invoke('pty:attach', id, options),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (listener) => listen<[string, string]>('pty:data', listener),
    onExit: (listener) => listen<[PtyExit]>('pty:exit', listener)
  },
  setWaitingCount: (count, badge) => ipcRenderer.send('badge:set', count, badge),
  openFolder: (path) => ipcRenderer.send('app:openFolder', path),
  setThemeMenu: (names, current) => ipcRenderer.send('theme:menu', names, current),
  onSetTheme: (listener) => listen<[string]>('theme:set', listener),
  windows: {
    undock: (id, title) => ipcRenderer.send('windows:undock', id, title),
    dock: (id) => ipcRenderer.send('windows:dock', id),
    nextDisplay: (id) => ipcRenderer.send('windows:nextDisplay', id),
    onDockedBack: (listener) => listen<[string]>('windows:docked-back', listener),
    onReveal: (listener) => listen<[string]>('windows:reveal', listener),
    onCycleTabs: (listener) => listen<[boolean]>('shortcut:cycle', listener),
    setTitle: (id, title) => ipcRenderer.send('windows:setTitle', id, title)
  }
}

contextBridge.exposeInMainWorld('hive', api)
