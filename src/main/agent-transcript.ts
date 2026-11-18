import type { TranscriptEntry } from '@shared/types'

type Json = Record<string, unknown>

const MAX_TEXT = 20_000
const MAX_THINKING = 4_000
const MAX_RESULT = 1_500

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n… ${text.length - limit} more characters` : text
}

/** One line that says what a tool call does. The command, the file or the pattern, whichever the input has. */
export function toolSummary(input: unknown): string {
  if (typeof input !== 'object' || input === null) {
    return ''
  }
  const fields = input as Json
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    if (typeof fields[key] === 'string' && fields[key]) {
      return clip(fields[key] as string, 240).replace(/\s+/g, ' ')
    }
  }
  return clip(JSON.stringify(fields), 240)
}

function resultText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'object' && part !== null && typeof (part as Json).text === 'string' ? ((part as Json).text as string) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** Turns the lines of an agent transcript into a short list that a person can read. Other record types are skipped. */
export function parseTranscript(raw: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue
    }
    let json: Json
    try {
      json = JSON.parse(line) as Json
    } catch {
      continue
    }
    const message = json.message as Json | undefined
    if (!message || (json.type !== 'user' && json.type !== 'assistant')) {
      continue
    }
    const content = message.content
    if (typeof content === 'string') {
      entries.push({ kind: json.type === 'user' ? 'prompt' : 'text', text: clip(content, MAX_TEXT) })
      continue
    }
    if (!Array.isArray(content)) {
      continue
    }
    for (const part of content as Json[]) {
      if (part.type === 'text' && typeof part.text === 'string') {
        entries.push({ kind: json.type === 'user' ? 'prompt' : 'text', text: clip(part.text, MAX_TEXT) })
      } else if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) {
        entries.push({ kind: 'thinking', text: clip(part.thinking, MAX_THINKING) })
      } else if (part.type === 'tool_use') {
        entries.push({ kind: 'tool', name: typeof part.name === 'string' ? part.name : 'tool', text: toolSummary(part.input) })
      } else if (part.type === 'tool_result') {
        entries.push({ kind: 'result', text: clip(resultText(part.content), MAX_RESULT), error: part.is_error === true })
      }
    }
  }
  return entries
}

/** An agent is done when its last message is an answer with no tool call after it. */
export function endsWithAnswer(raw: string): boolean {
  const lines = raw.split('\n').filter((line) => line.trim())
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const json = JSON.parse(lines[index]) as Json
      if (json.type !== 'assistant' && json.type !== 'user') {
        continue
      }
      const content = (json.message as Json | undefined)?.content
      return json.type === 'assistant' && Array.isArray(content) && !content.some((part) => (part as Json).type === 'tool_use')
    } catch {
      continue
    }
  }
  return false
}
