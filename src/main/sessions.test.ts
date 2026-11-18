import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { projectDirectory } from './paths.ts'
import { scan } from './sessions.ts'

const line = (value: object): string => `${JSON.stringify(value)}\n`

function setup(): { folder: string; directory: string } {
  const root = mkdtempSync(join(tmpdir(), 'hive-sessions-'))
  process.env.CLAUDE_CONFIG_DIR = join(root, 'claude')
  process.env.HOME = join(root, 'home')
  const folder = join(root, 'work', 'my-repo')
  mkdirSync(join(folder, '.git'), { recursive: true })
  const directory = projectDirectory(folder)
  mkdirSync(directory, { recursive: true })
  return { folder, directory }
}

test('a session is named by /rename first, then by the title Claude made, then by the first prompt', async () => {
  const { folder, directory } = setup()
  writeFileSync(join(directory, 'renamed.jsonl'), line({ type: 'ai-title', aiTitle: 'Claude title' }) + line({ type: 'custom-title', customTitle: 'My name' }))
  writeFileSync(join(directory, 'titled.jsonl'), line({ type: 'ai-title', aiTitle: 'Claude title' }))
  writeFileSync(join(directory, 'prompt.jsonl'), line({ type: 'user', message: { role: 'user', content: 'Fix the login bug please' } }))
  writeFileSync(join(directory, 'empty.jsonl'), '')
  const { sessions } = await scan(folder, [])
  const title = (id: string): string | undefined => sessions.find((session) => session.id === id)?.title
  assert.equal(title('renamed'), 'My name')
  assert.equal(title('titled'), 'Claude title')
  assert.equal(title('prompt'), 'Fix the login bug please')
  assert.equal(title('empty'), 'New Session')
})

test('sessions are sorted by last activity, newest first', async () => {
  const { folder, directory } = setup()
  writeFileSync(join(directory, 'old.jsonl'), line({ type: 'ai-title', aiTitle: 'Old' }))
  writeFileSync(join(directory, 'new.jsonl'), line({ type: 'ai-title', aiTitle: 'New' }))
  utimesSync(join(directory, 'old.jsonl'), new Date(Date.now() - 86_400_000 * 3), new Date(Date.now() - 86_400_000 * 3))
  const { sessions } = await scan(folder, [])
  assert.deepEqual(sessions.map((session) => session.id), ['new', 'old'])
})

test('an open session gets details: repo, branch, model, last prompt and the running agents', async () => {
  const { folder, directory } = setup()
  writeFileSync(
    join(directory, 'live.jsonl'),
    line({ type: 'ai-title', aiTitle: 'Live one' }) +
      line({ type: 'assistant', cwd: join(folder, 'src'), gitBranch: 'feat/x', message: { model: 'claude-sonnet-5-5' } }) +
      line({ type: 'last-prompt', lastPrompt: 'do the thing' })
  )
  const agents = join(directory, 'live', 'subagents')
  mkdirSync(agents, { recursive: true })
  writeFileSync(join(agents, 'agent-run.meta.json'), JSON.stringify({ description: 'Review diff', finished: false }))
  writeFileSync(join(agents, 'agent-run.jsonl'), line({ type: 'assistant', message: { model: 'claude-opus-4-1-20250805' } }))
  writeFileSync(join(agents, 'agent-done.meta.json'), JSON.stringify({ description: 'Old agent', finished: true }))
  writeFileSync(join(agents, 'agent-done.jsonl'), line({ type: 'assistant', message: {} }))

  const { open } = await scan(folder, [{ id: 'live', folder, title: 'ignored' }])
  assert.equal(open.length, 1)
  assert.equal(open[0].title, 'Live one')
  assert.equal(open[0].details?.repo, 'my-repo')
  assert.equal(open[0].details?.branch, 'feat/x')
  assert.equal(open[0].details?.model, 'claude-sonnet-5-5')
  assert.equal(open[0].details?.lastPrompt, 'do the thing')
  assert.deepEqual(open[0].details?.agents.map((agent) => [agent.description, agent.model]), [['Review diff', 'claude-opus-4-1-20250805']])
})

test('a new session without a file still gets a card, and a tab of another folder is read from its own folder', async () => {
  const { folder, directory } = setup()
  const other = join(folder, '..', 'other-repo')
  mkdirSync(join(other, '.git'), { recursive: true })
  mkdirSync(projectDirectory(other), { recursive: true })
  writeFileSync(join(projectDirectory(other), 'elsewhere.jsonl'), line({ type: 'ai-title', aiTitle: 'Elsewhere' }))
  const { open } = await scan(folder, [
    { id: 'brand-new', folder, title: 'New Session' },
    { id: 'elsewhere', folder: other, title: 'x' }
  ])
  assert.equal(open[0].title, 'New Session')
  assert.equal(open[0].details?.repo, 'my-repo')
  assert.equal(open[1].title, 'Elsewhere')
  assert.equal(open[1].details?.repo, 'other-repo')
  assert.ok(directory.length > 0)
})

test('an agent that was quiet for 15 minutes counts as stale', async () => {
  const { folder, directory } = setup()
  writeFileSync(join(directory, 's.jsonl'), line({ type: 'ai-title', aiTitle: 'S' }))
  const agents = join(directory, 's', 'subagents')
  mkdirSync(agents, { recursive: true })
  writeFileSync(join(agents, 'agent-stale.meta.json'), JSON.stringify({ description: 'Stale', finished: false }))
  writeFileSync(join(agents, 'agent-stale.jsonl'), '')
  const past = new Date(Date.now() - 20 * 60_000)
  utimesSync(join(agents, 'agent-stale.jsonl'), past, past)
  const { open } = await scan(folder, [{ id: 's', folder, title: 's' }])
  assert.deepEqual(open[0].details?.agents, [])
})
