import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from 'electron'
import type { OpenTabRef, PtyAttachOptions } from '@shared/types'
import { isAppUrl, isOpenable } from './external-url'
import { hooksStatus, installHooks } from './hooks'
import { PtyManager } from './pty'
import { searchSessions } from './search'
import { scan } from './sessions'
import { listAgents, readAgentTranscript } from './agents'
import { readUsage, readWaitingInfo, StatusMonitor } from './status'

const isMac = process.platform === 'darwin'
const mainWindows = new Set<BrowserWindow>()
const undocked = new Map<string, BrowserWindow>()
let openTabs: OpenTabRef[] = []

function iconPath(): string {
  return join(__dirname, '../../build/icon.png')
}

function loadRenderer(window: BrowserWindow, hash = ''): void {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) {
    void window.loadURL(`${url}#${hash}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

/** Opens a web link in the default browser of the system. `HIVE_OPEN_LOG` writes the link to a file instead, for tests. */
function openExternal(url: string): void {
  if (!isOpenable(url)) {
    return
  }
  if (process.env.HIVE_OPEN_LOG) {
    appendFileSync(process.env.HIVE_OPEN_LOG, `${url}\n`)
    return
  }
  void shell.openExternal(url)
}

function baseWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: '#1a1b26',
    icon: nativeImage.createFromPath(iconPath()),
    // Terminals must keep running when the window is covered, so the page is not throttled in the background.
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    ...options
  })
  // A link never opens a window of the app. A new window would have no browser session, so a login page asks to log in again.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, process.env['ELECTRON_RENDERER_URL'])) {
      event.preventDefault()
      openExternal(url)
    }
  })
  // Chromium can keep Ctrl+Tab for itself on some systems, so the page never gets the key. The main process sees it first.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Tab' && input.control && !input.meta && !input.alt) {
      event.preventDefault()
      window.webContents.send('shortcut:cycle', input.shift)
    }
  })
  return window
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args)
  }
}

function createMainWindow(): BrowserWindow {
  const window = baseWindow({ width: 1400, height: 860, minWidth: 900, minHeight: 500, title: 'Hive' })
  mainWindows.add(window)
  window.on('closed', () => mainWindows.delete(window))
  loadRenderer(window)
  return window
}

function nextScreenPosition(window: BrowserWindow): void {
  const displays = screen.getAllDisplays()
  if (displays.length < 2) {
    return
  }
  const current = screen.getDisplayMatching(window.getBounds())
  const index = displays.findIndex((display) => display.id === current.id)
  const target = displays[(index + 1) % displays.length].workArea
  const { width, height } = window.getBounds()
  window.setBounds({ x: Math.round(target.x + (target.width - width) / 2), y: Math.round(target.y + (target.height - height) / 2), width, height })
}

function undock(id: string, title: string): void {
  const existing = undocked.get(id)
  if (existing) {
    existing.focus()
    return
  }
  const window = baseWindow({ width: 900, height: 600, title })
  undocked.set(id, window)
  // Open on another display when there is one.
  const main = [...mainWindows][0]
  if (main) {
    const others = screen.getAllDisplays().filter((display) => display.id !== screen.getDisplayMatching(main.getBounds()).id)
    if (others.length > 0) {
      const area = others[0].workArea
      window.setBounds({ x: area.x + 80, y: area.y + 80, width: 900, height: 600 })
    }
  }
  window.on('closed', () => {
    undocked.delete(id)
    broadcast('windows:docked-back', id)
  })
  loadRenderer(window, `/terminal/${id}?title=${encodeURIComponent(title)}`)
}

const ptys = new PtyManager(
  (id, data) => broadcast('pty:data', id, data),
  (exit) => broadcast('pty:exit', exit)
)

function reveal(id: string): void {
  const target = undocked.get(id) ?? [...mainWindows][0]
  if (target) {
    target.show()
    target.focus()
  }
  broadcast('windows:reveal', id)
}

// A toast that nothing refers to can be collected before the user presses a button on it.
const liveToasts = new Set<Notification>()

/** A toast for a session. A permission question gets Yes and No buttons that answer in the terminal. */
function notify(id: string, body: string, permission = false): void {
  const tab = openTabs.find((item) => item.id === id)
  if (!tab || BrowserWindow.getAllWindows().some((window) => window.isFocused()) || !Notification.isSupported()) {
    return
  }
  const notification = new Notification({
    title: tab.title,
    body,
    ...(permission ? { actions: [{ type: 'button' as const, text: 'Yes' }, { type: 'button' as const, text: 'No' }] } : {})
  })
  liveToasts.add(notification)
  notification.on('click', () => reveal(id))
  notification.on('action', (_event, index) => {
    // Answer only while the session still waits for this question. Else the key would land in a later prompt.
    void readWaitingInfo(id).then((info) => {
      if (!info?.permission) {
        return
      }
      // 1 picks Yes in the permission list. Escape says No.
      ptys.write(id, index === 0 ? '1' : '\x1b')
    })
  })
  notification.on('close', () => liveToasts.delete(notification))
  notification.show()
}

const monitor = new StatusMonitor((id, previous, next) => {
  if (next === 'waiting' && previous !== 'waiting') {
    void readWaitingInfo(id).then((info) => notify(id, info?.message ?? 'Needs your input', info?.permission ?? false))
  } else if (next === 'ready' && previous === 'working') {
    notify(id, 'Finished')
  }
})

let tray: Tray | undefined

/** The tray icon opens Hive. Its tooltip, the taskbar badge and the dock badge show how many sessions wait for you. */
function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }))
  tray.setToolTip('Hive')
  const showHive = (): void => {
    const window = [...mainWindows][0] ?? createMainWindow()
    window.show()
    window.focus()
  }
  tray.on('click', showHive)
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show Hive', click: showHive }, { label: 'Quit', role: 'quit' }]))
}

function showWaiting(count: number, badge: string): void {
  tray?.setToolTip(count > 0 ? `Hive: ${count} waiting for you` : 'Hive')
  if (process.platform === 'win32') {
    const image = count > 0 && badge ? nativeImage.createFromDataURL(badge) : null
    for (const window of mainWindows) {
      window.setOverlayIcon(image, count > 0 ? `${count} waiting for you` : '')
    }
  } else {
    app.setBadgeCount(count)
  }
}

function registerIpc(): void {
  ipcMain.handle('agents:list', (_event, folder: string, sessionId: string) => listAgents(folder, sessionId))
  ipcMain.handle('agents:transcript', (_event, folder: string, sessionId: string, agentId: string) =>
    readAgentTranscript(folder, sessionId, agentId)
  )
  ipcMain.on('badge:set', (_event, count: number, badge: string) => {
    if (Number.isInteger(count) && count >= 0 && typeof badge === 'string' && badge.startsWith('data:image/png;base64,')) {
      showWaiting(count, badge)
    }
  })
  ipcMain.handle('sessions:scan', (_event, folder: string, open: OpenTabRef[]) => scan(folder, open))
  ipcMain.handle('sessions:search', (_event, folder: string, text: string) => searchSessions(folder, text))
  ipcMain.handle('app:defaultFolder', () => (existsSync(join(homedir(), 'code')) ? join(homedir(), 'code') : homedir()))
  ipcMain.handle('usage:read', () => readUsage())
  ipcMain.handle('hooks:status', () => hooksStatus())
  ipcMain.handle('hooks:install', () => installHooks())
  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: homedir() })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.on('app:openExternal', (_event, url: string) => openExternal(url))
  // Only a folder opens. A file path could start a program.
  ipcMain.on('app:openFolder', (_event, path: string) => {
    if (typeof path === 'string' && existsSync(path) && statSync(path).isDirectory()) {
      void shell.openPath(path)
    }
  })
  ipcMain.on('tabs:setOpen', (_event, tabs: OpenTabRef[]) => {
    openTabs = tabs
  })
  ipcMain.handle('pty:attach', (_event, id: string, options: PtyAttachOptions) => ptys.attach(id, options))
  ipcMain.on('pty:write', (_event, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_event, id: string) => ptys.kill(id))
  ipcMain.on('windows:undock', (_event, id: string, title: string) => undock(id, title))
  ipcMain.on('windows:dock', (_event, id: string) => undocked.get(id)?.close())
  ipcMain.on('windows:nextDisplay', (_event, id: string) => {
    const window = undocked.get(id)
    if (window) {
      nextScreenPosition(window)
    }
  })
  ipcMain.on('windows:setTitle', (_event, id: string, title: string) => undocked.get(id)?.setTitle(title))
}

/** For tests: `HIVE_EXEC_JS` runs a script in the window, `HIVE_PROBE_JS` runs one after the wait and prints its result, `HIVE_SCREENSHOT` saves a picture of it and quits. */
async function screenshotMode(window: BrowserWindow): Promise<void> {
  const target = process.env.HIVE_SCREENSHOT
  if (!target) {
    return
  }
  window.webContents.on('console-message', (event) => console.log('[renderer]', event.message))
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const script = process.env.HIVE_EXEC_JS
      if (script) {
        try {
          console.log('[script result]', await window.webContents.executeJavaScript(script, true))
        } catch (error) {
          console.log('[script error]', String(error))
        }
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.HIVE_WAIT_MS ?? 2500)))
      }
      if (process.env.HIVE_PROBE_JS) {
        console.log('[probe]', await window.webContents.executeJavaScript(process.env.HIVE_PROBE_JS, true))
      }
      writeFileSync(target, (await window.webContents.capturePage()).toPNG())
      // Other windows (undocked terminals) get their own picture.
      const others = BrowserWindow.getAllWindows().filter((item) => item !== window)
      for (const [index, other] of others.entries()) {
        writeFileSync(`${target}.window${index + 1}.png`, (await other.webContents.capturePage()).toPNG())
      }
      app.quit()
    }, 2500)
  })
}

app.setName('Hive')
// Windows names the source of a toast after the app user model id. Without it, the toast says "Electron".
// A packaged app uses its appId, which the installer shortcut carries. The dev app uses the plain name.
if (process.platform === 'win32') {
  const appId = app.isPackaged ? 'com.calielc.hive' : 'Hive'
  app.setAppUserModelId(appId)
  // An app id with no shortcut falls back to the name of the exe, which is "Electron" in dev. A registry entry gives
  // the id a name and an icon for toasts. It lives under the current user, so it needs no rights.
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${appId}`
  for (const [name, value] of [['DisplayName', 'Hive'], ['IconUri', iconPath()]]) {
    execFile('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], () => undefined)
  }
}

if (process.env.HIVE_SCREENSHOT) {
  // A test run must paint even when other windows cover it.
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
}

/** The application menu. The page sends the theme names and the current one, and the menu shows them as a Theme menu. */
function buildMenu(themeNames: string[], currentTheme: string): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      {
        label: 'Theme',
        submenu: themeNames.map((name) => ({
          label: name,
          type: 'radio' as const,
          checked: name === currentTheme,
          click: () => {
            for (const window of mainWindows) {
              window.webContents.send('theme:set', name)
            }
          }
        }))
      },
      { role: 'windowMenu' }
    ])
  )
}

void app.whenReady().then(() => {
  buildMenu([], '')
  ipcMain.on('theme:menu', (_event, names: string[], current: string) => buildMenu(names, current))
  if (isMac) {
    app.dock?.setIcon(nativeImage.createFromPath(iconPath()))
  }
  registerIpc()
  createTray()
  const window = createMainWindow()
  void screenshotMode(window)
  monitor.start()

  app.on('activate', () => {
    if (mainWindows.size === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

app.on('before-quit', () => {
  monitor.stop()
  ptys.killAll()
})
