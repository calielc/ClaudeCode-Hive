import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentSummary, TranscriptEntry } from '@shared/types'
import { endsWithAnswer, lastModel, parseTranscript } from './agent-transcript'
import { projectDirectory } from './paths'

const STALE_MS = 15 * 60 * 1000
const MAX_BYTES = 6 * 1024 * 1024
/** Session ids and agent ids are letters, digits and dashes. Anything else could point outside the session folder. */
const SAFE_ID = /^[A-Za-z0-9-]+$/

type Json = Record<string, unknown>

function agentDirectory(folder: string, sessionId: string): string | undefined {
  return SAFE_ID.test(sessionId) ? join(projectDirectory(folder), sessionId, 'subagents') : undefined
}

/** All agents of a session, running and done, in the order they started. */
export async function listAgents(folder: string, sessionId: string): Promise<AgentSummary[]> {
  const directory = agentDirectory(folder, sessionId)
  if (!directory) {
    return []
  }
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return []
  }
  const found: { agent: AgentSummary; started: number }[] = []
  for (const name of names.filter((item) => item.endsWith('.meta.json'))) {
    const id = name.slice(0, -'.meta.json'.length)
    try {
      const transcript = join(directory, `${id}.jsonl`)
      const info = await stat(transcript)
      const meta = JSON.parse(await readFile(join(directory, name), 'utf8')) as Json
      const agentType = typeof meta.agentType === 'string' ? meta.agentType : undefined
      const description = typeof meta.description === 'string' ? meta.description : (agentType ?? 'Agent')
      const quiet = Date.now() - info.mtimeMs > STALE_MS
      const raw = await readFile(transcript, 'utf8')
      const running = meta.finished !== true && !quiet && !endsWithAnswer(raw)
      found.push({ agent: { id, description, agentType, model: lastModel(raw), running, updated: info.mtimeMs }, started: info.birthtimeMs || info.ctimeMs })
    } catch {
      continue
    }
  }
  return found.sort((left, right) => left.started - right.started).map((item) => item.agent)
}

const transcriptCache = new Map<string, { modified: number; entries: TranscriptEntry[] }>()

/** The readable transcript of one agent. A file that is too large returns its last part. */
export async function readAgentTranscript(folder: string, sessionId: string, agentId: string): Promise<TranscriptEntry[]> {
  const directory = agentDirectory(folder, sessionId)
  if (!directory || !SAFE_ID.test(agentId)) {
    return []
  }
  const file = join(directory, `agent-${agentId.replace(/^agent-/, '')}.jsonl`)
  try {
    const info = await stat(file)
    const cached = transcriptCache.get(file)
    if (cached && cached.modified === info.mtimeMs) {
      return cached.entries
    }
    let raw = await readFile(file, 'utf8')
    if (raw.length > MAX_BYTES) {
      // Drop the first partial line of the cut.
      raw = raw.slice(raw.length - MAX_BYTES)
      raw = raw.slice(raw.indexOf('\n') + 1)
    }
    const entries = parseTranscript(raw)
    transcriptCache.set(file, { modified: info.mtimeMs, entries })
    return entries
  } catch {
    return []
  }
}
