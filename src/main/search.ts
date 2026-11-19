import { Worker } from "node:worker_threads";
import { projectDirectory } from "./paths";
import workerPath from "./search.worker?modulePath";

interface Reply {
  requestId: number;
  ids: string[];
}

let worker: Worker | undefined;
let counter = 0;
const waiting = new Map<number, (ids: string[]) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(workerPath);
    worker.on("message", (reply: Reply) => {
      waiting.get(reply.requestId)?.(reply.ids);
      waiting.delete(reply.requestId);
    });
  }
  return worker;
}

/** Full text search over the transcripts of one folder, including what sub agents did. It runs in a worker thread. */
export function searchSessions(
  folder: string,
  text: string,
): Promise<string[]> {
  return new Promise((resolve) => {
    counter += 1;
    waiting.set(counter, resolve);
    getWorker().postMessage({
      requestId: counter,
      directory: projectDirectory(folder),
      text,
    });
  });
}
