import { parentPort } from 'node:worker_threads'
import { searchDirectory } from './search-core'

interface Request {
  requestId: number
  directory: string
  text: string
}

parentPort?.on('message', async (request: Request) => {
  const ids = await searchDirectory(request.directory, request.text)
  parentPort?.postMessage({ requestId: request.requestId, ids })
})
