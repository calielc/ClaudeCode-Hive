// Claude Code hook. Writes the state of a session to ~/.claude-sessions/status/<id>.json.
// Usage: hook.cjs <state>   (state is working, waiting, ready or end). The hook input JSON arrives on stdin.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const state = process.argv[2] || 'ready'
let raw = ''
process.stdin.on('data', (chunk) => {
  raw += chunk
})
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw)
    const id = data.session_id
    if (!id) {
      return
    }
    // The idle reminder comes 60 seconds after a turn ended. The turn is already "ready".
    if (state === 'waiting' && data.notification_type === 'idle_prompt') {
      return
    }
    const directory = path.join(os.homedir(), '.claude-sessions', 'status')
    fs.mkdirSync(directory, { recursive: true })
    const file = path.join(directory, id + '.json')
    if (state === 'end') {
      try {
        fs.unlinkSync(file)
      } catch {}
    } else {
      fs.writeFileSync(file, JSON.stringify({ state, ts: Date.now() / 1000 }))
    }
  } catch {}
})
