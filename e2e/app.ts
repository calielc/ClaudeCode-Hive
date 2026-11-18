import { createRequire } from 'node:module'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright-core'
import { createFixture, type Fixture } from './fixture'

const root = process.cwd()

export interface HiveState {
  selectedTabId: string | null
  layout: string
  tabs: { id: string; title: string }[]
  slots: (string | null)[]
  tags: Record<string, string>
  detached: string[]
  agentViews: Record<string, string | null>
  folders: string[]
}

/** A running Hive with a fixture, and a few helpers to read it. */
export interface Hive {
  app: ElectronApplication
  page: Page
  fixture: Fixture
  /** The state of the page, from the test seam `window.__hive`. */
  state(): Promise<HiveState>
  /** The text on the screen of the terminal of a session. */
  terminalText(id: string): Promise<string>
  close(): Promise<void>
}

type HiveSeam = { getState(): HiveState; terminalText(id: string): string }

/** Starts the built app (`out/main/index.js`) against a fresh fixture. Run `npm run build` first. */
export async function launchHive(options: { fixture?: Fixture } = {}): Promise<Hive> {
  const fixture = options.fixture ?? createFixture()
  const script = join(root, 'e2e', 'fake-claude.cjs').replace(/\\/g, '/')
  if (/\s/.test(script)) {
    throw new Error(`The path of the e2e folder must not hold a space: ${script}`)
  }
  // `HIVE_E2E_PACKAGED` is the path of a packaged app. Then the tests start that app and not the built files.
  const packaged = process.env.HIVE_E2E_PACKAGED
  const electronPath = packaged ?? (createRequire(join(root, 'package.json'))('electron') as string)
  const app = await electron.launch({
    executablePath: electronPath,
    cwd: root,
    args: [
      ...(packaged ? [] : [join(root, 'out', 'main', 'index.js')]),
      `--user-data-dir=${fixture.userData}`,
      // The sandbox of Chromium needs a setting on some Linux runners.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
    ],
    env: {
      ...(process.env as Record<string, string>),
      HOME: fixture.home,
      USERPROFILE: fixture.home,
      CLAUDE_CONFIG_DIR: join(fixture.home, '.claude'),
      // An empty value makes the app load the built files and not a dev server.
      ELECTRON_RENDERER_URL: '',
      HIVE_DEBUG: '1',
      HIVE_PTY_COMMAND: `node ${script}`
    }
  })
  const page = await app.firstWindow()
  await page.locator('.sidebar').waitFor()
  return {
    app,
    page,
    fixture,
    state: () => page.evaluate(() => (window as unknown as { __hive: HiveSeam }).__hive.getState()),
    terminalText: (id) => page.evaluate((sessionId) => (window as unknown as { __hive: HiveSeam }).__hive.terminalText(sessionId), id),
    close: async () => {
      await app.close().catch(() => undefined)
      fixture.cleanup()
    }
  }
}

/** Tries a check again and again until it passes or the time is over. The last failure is the error. */
export async function eventually(check: () => Promise<void> | void, timeoutMs = 10_000, intervalMs = 150): Promise<void> {
  const end = Date.now() + timeoutMs
  for (;;) {
    try {
      await check()
      return
    } catch (error) {
      if (Date.now() > end) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}

/** The card of an open session in the left panel. */
export function card(page: Page, title: string): Locator {
  return page.locator('.card', { has: page.locator('.card-title', { hasText: title }) })
}

/** The plain row of a session that is not open. */
export function row(page: Page, title: string): Locator {
  return page.locator('.row', { has: page.locator('.row-title', { hasText: title }) })
}

/** The tab of a session in the top bar. */
export function tab(page: Page, title: string): Locator {
  return page.locator('.tab', { has: page.locator('.tab-title', { hasText: title }) })
}
