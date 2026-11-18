import { useEffect, useRef, useState } from 'react'
import type { AgentSummary, TranscriptEntry } from '@shared/types'
import { activateTab } from '../actions'
import { setState, useStore } from '../state'

/** Polls a value from the main process while the component is mounted. */
function usePolled<T>(load: () => Promise<T>, initial: T, intervalMs: number, key: string): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    let alive = true
    const tick = (): void => {
      void load().then((next) => {
        if (alive) {
          setValue(next)
        }
      })
    }
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
    // `key` stands for what `load` reads. `load` itself is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])
  return value
}

/** The agents of a session. It stays empty for a session without agents. */
export function useAgents(folder: string, sessionId: string): AgentSummary[] {
  return usePolled(() => window.hive.agents.list(folder, sessionId), [], 2000, `${folder}|${sessionId}`)
}

/**
 * The agents of a session as rows on its card in the left panel. The first row is Main, the session itself. Every other row is an
 * agent. A click on an agent shows its transcript in the pane of the session, and a click on Main shows the terminal.
 * Running agents and the open one always show. Finished agents fold behind a "+N done" row, and a cross hides one.
 */
export function AgentList({ tabId, folder }: { tabId: string; folder: string }) {
  const agents = useAgents(folder, tabId)
  const selected = useStore((state) => state.agentViews[tabId] ?? null)
  const [showDone, setShowDone] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  if (agents.length === 0) {
    return null
  }
  const choose = (agentId: string | null): void => {
    setState((current) => ({ agentViews: { ...current.agentViews, [tabId]: agentId } }))
    activateTab(tabId)
  }
  const folded = agents.filter((agent) => !agent.running && agent.id !== selected && !dismissed.includes(agent.id))
  const visible = agents.filter((agent) => agent.running || agent.id === selected || (showDone && !dismissed.includes(agent.id)))
  return (
    <div className="agent-list" onClick={(event) => event.stopPropagation()}>
      <div className={`agent-row ${selected === null ? 'active' : ''}`} onClick={() => choose(null)}>
        <span className="agent-glyph">▣</span>
        <span className="agent-name">Main</span>
      </div>
      {visible.map((agent) => (
        <div
          key={agent.id}
          className={`agent-row ${selected === agent.id ? 'active' : ''} ${agent.running ? '' : 'done'}`}
          title={agent.description}
          onClick={() => choose(agent.id)}
        >
          <i className={`dot ${agent.running ? 'working' : 'ready'}`} />
          <span className="agent-name">{agent.agentType ? `${agent.agentType}: ${agent.description}` : agent.description}</span>
          {!agent.running && agent.id !== selected && (
            <span
              className="agent-dismiss"
              role="button"
              title="Hide this agent"
              onClick={(event) => {
                event.stopPropagation()
                setDismissed((current) => [...current, agent.id])
              }}
            >
              ✕
            </span>
          )}
        </div>
      ))}
      {folded.length > 0 && (
        <div className="agent-row more" onClick={() => setShowDone(!showDone)}>
          <span className="agent-name">{showDone ? 'Hide done' : `+${folded.length} done`}</span>
        </div>
      )}
    </div>
  )
}

/** The transcript of one agent as a conversation. It reads the file again while the agent runs. */
export function AgentTranscript({ folder, sessionId, agentId }: { folder: string; sessionId: string; agentId: string }) {
  const entries = usePolled<TranscriptEntry[]>(() => window.hive.agents.transcript(folder, sessionId, agentId), [], 1500, `${folder}|${sessionId}|${agentId}`)
  const box = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  // Follow the end of the transcript, unless the reader scrolled up.
  useEffect(() => {
    const element = box.current
    if (element && stuck.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [entries])
  return (
    <div
      className="agent-transcript"
      ref={box}
      onScroll={(event) => {
        const element = event.currentTarget
        stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
    >
      {entries.length === 0 && <div className="agent-empty">Nothing to show yet.</div>}
      {entries.map((entry, index) => (
        <TranscriptItem key={index} entry={entry} />
      ))}
    </div>
  )
}

function TranscriptItem({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'tool') {
    return (
      <div className="t-tool">
        <span className="t-name">▸ {entry.name}</span> <span className="t-summary">{entry.text}</span>
      </div>
    )
  }
  if (entry.kind === 'result') {
    const lines = entry.text.split('\n').length
    return (
      <details className={`t-result ${entry.error ? 'error' : ''}`}>
        <summary>{entry.error ? 'Error' : 'Result'} · {lines} {lines === 1 ? 'line' : 'lines'}</summary>
        <pre>{entry.text}</pre>
      </details>
    )
  }
  if (entry.kind === 'thinking') {
    return (
      <details className="t-thinking">
        <summary>Thinking</summary>
        <pre>{entry.text}</pre>
      </details>
    )
  }
  return (
    <div className={`t-${entry.kind}`}>
      <div className="t-label">{entry.kind === 'prompt' ? 'Prompt' : 'Agent'}</div>
      <div className="t-text">{entry.text}</div>
    </div>
  )
}
