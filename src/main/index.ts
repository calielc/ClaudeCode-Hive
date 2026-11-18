import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell } from 'electron'
import type { OpenTabRef, PtyAttachOptions } from '@shared/types'
import { isAppUrl, isOpenable } from './external-url'
import { hooksStatus, installHooks } from './hooks'
import { PtyManager } from './pty'
import { searchSessions } from './search'
import { scan } from './sessions'
import { readUsage, readWaitingMessage, StatusMonitor } from './status'

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

function notify(id: string, body: string): void {
  const tab = openTabs.find((item) => item.id === id)
  if (!tab || BrowserWindow.getAllWindows().some((window) => window.isFocused()) || !Notification.isSupported()) {
    return
  }
  const notification = new Notification({ title: tab.title, body })
  notification.on('click', () => {
    const target = undocked.get(id) ?? [...mainWindows][0]
    if (target) {
      target.show()
      target.focus()
    }
    broadcast('windows:reveal', id)
  })
  notification.show()
}

const monitor = new StatusMonitor((id, previous, next) => {
  if (next === 'waiting' && previous !== 'waiting') {
    void readWaitingMessage(id).then((message) => notify(id, message ?? 'Needs your input'))
  } else if (next === 'ready' && previous === 'working') {
    notify(id, 'Finished')
  }
})

function registerIpc(): void {
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
  app.setAppUserModelId(app.isPackaged ? 'com.calielc.hive' : 'Hive')
}

if (process.env.HIVE_SCREENSHOT) {
  // A test run must paint even when other windows cover it.
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
  if (isMac) {
    app.dock?.setIcon(nativeImage.createFromPath(iconPath()))
  }
  registerIpc()
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
