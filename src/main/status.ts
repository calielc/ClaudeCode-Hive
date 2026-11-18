import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionState, UsageSnapshot, UsageWindow } from '@shared/types'
import { hiveDirectory } from './paths'
import { readStates } from './sessions'

type Json = Record<string, unknown>

/** Watches the status files that the hooks write, for every session in any folder. */
export class StatusMonitor {
  private states = new Map<string, SessionState>()
  private primed = false
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly onChange: (id: string, previous: SessionState | undefined, next: SessionState) => void) {}

  start(): void {
    this.timer = setInterval(() => void this.poll(), 1000)
    void this.poll()
  }

  stop(): void {
    clearInterval(this.timer)
  }

  private async poll(): Promise<void> {
    const current = await readStates()
    // The first read is only a snapshot. It must not notify for old sessions.
    if (this.primed) {
      for (const [id, state] of current) {
        if (this.states.get(id) !== state) {
          this.onChange(id, this.states.get(id), state)
        }
      }
    }
    this.states = current
    this.primed = true
  }
}

/** The text of the last question of a waiting session, from its status file. Empty when there is none. */
export async function readWaitingMessage(id: string): Promise<string | undefined> {
  try {
    const json = JSON.parse(await readFile(join(hiveDirectory(), 'status', `${id}.json`), 'utf8')) as Json
    return json.state === 'waiting' && typeof json.message === 'string' && json.message.trim() ? json.message.trim() : undefined
  } catch {
    return undefined
  }
}

function toWindow(label: string, raw: unknown, percentKey: string): UsageWindow | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const entry = raw as Json
  const percent = typeof entry[percentKey] === 'number' ? (entry[percentKey] as number) : null
  const reset = entry.resets_at
  let resetsAt: number | null = null
  if (typeof reset === 'number' && reset > 0) {
    resetsAt = reset * 1000
  } else if (typeof reset === 'string' && !Number.isNaN(Date.parse(reset))) {
    resetsAt = Date.parse(reset)
  }
  return percent === null && resetsAt === null ? undefined : { label, percent, resetsAt }
}

/** Reads ~/.claude-sessions/usage.json, which the status line wrapper keeps current while a session is open. */
export async function readUsage(): Promise<UsageSnapshot | null> {
  let json: Json
  try {
    json = JSON.parse(await readFile(join(hiveDirectory(), 'usage.json'), 'utf8')) as Json
  } catch {
    return null
  }
  const windows: UsageWindow[] = []
  const five = toWindow('5 hours', json.five_hour, 'used_percentage')
  const week = toWindow('Week', json.seven_day, 'used_percentage')
  if (five) {
    windows.push(five)
  }
  if (week) {
    windows.push(week)
  }
  if (Array.isArray(json.model_scoped)) {
    for (const scoped of json.model_scoped as Json[]) {
      const name = typeof scoped.display_name === 'string' ? scoped.display_name : 'Model'
      const window = toWindow(`Week ${name}`, scoped, 'utilization')
      if (window) {
        windows.push(window)
      }
    }
  }
  const updated = typeof json.updated_at === 'number' ? json.updated_at * 1000 : 0
  return { windows, updatedAt: updated }
}
