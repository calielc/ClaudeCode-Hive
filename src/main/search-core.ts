import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { containsFolded, prepareNeedle } from './fold-search'

/** `<id>.jsonl` or `<id>/subagents/<agent>.jsonl`, relative to the project folder, gives the session id. */
export function sessionIdFromPath(relativePath: string): string | undefined {
  const first = relativePath.split(/[\\/]/).filter(Boolean)[0]
  if (!first) {
    return undefined
  }
  return first.endsWith('.jsonl') ? first.slice(0, -'.jsonl'.length) : first
}

async function jsonlFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await jsonlFiles(path)))
    } else if (entry.name.endsWith('.jsonl')) {
      files.push(path)
    }
  }
  return files
}

/** The ids of the sessions in a project folder whose transcripts contain the text, ignoring case. */
export async function searchDirectory(directory: string, text: string): Promise<string[]> {
  const needle = prepareNeedle(text)
  const files = await jsonlFiles(directory)
  const ids = new Set<string>()
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const file = files[next]
      next += 1
      try {
        if (containsFolded(await readFile(file), needle)) {
          const id = sessionIdFromPath(relative(directory, file))
          if (id) {
            ids.add(id)
          }
        }
      } catch {
        continue
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return [...ids]
}
