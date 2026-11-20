import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listAgents, readAgentTranscript } from "./agents.ts";
import { projectDirectory } from "./paths.ts";

const SESSION = "11111111-1111-4111-8111-111111111111";
const line = (value: object): string => `${JSON.stringify(value)}\n`;

function setup(): { folder: string; directory: string } {
  const root = mkdtempSync(join(tmpdir(), "hive-agents-"));
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  const folder = join(root, "work");
  const directory = join(projectDirectory(folder), SESSION, "subagents");
  mkdirSync(directory, { recursive: true });
  return { folder, directory };
}

const working = line({
  type: "assistant",
  message: {
    model: "claude-sonnet-5-5",
    content: [{ type: "tool_use", id: "t", name: "Read", input: {} }],
  },
});
const answered = line({
  type: "assistant",
  message: {
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: "Done." }],
  },
});

function agent(
  directory: string,
  id: string,
  meta: object,
  transcript: string,
): void {
  writeFileSync(join(directory, `${id}.meta.json`), JSON.stringify(meta));
  writeFileSync(join(directory, `${id}.jsonl`), transcript);
}

test("an agent runs until it answers, is marked finished, or goes quiet", async () => {
  const { folder, directory } = setup();
  agent(directory, "agent-run", { description: "Search" }, working);
  agent(directory, "agent-answer", { agentType: "Plan" }, answered);
  agent(
    directory,
    "agent-flag",
    { description: "Flagged", finished: true },
    working,
  );
  agent(directory, "agent-old", { description: "Old" }, working);
  const old = new Date(Date.now() - 20 * 60 * 1000);
  utimesSync(join(directory, "agent-old.jsonl"), old, old);

  const agents = await listAgents(folder, SESSION);
  const byId = new Map(agents.map((item) => [item.id, item]));
  assert.equal(byId.get("agent-run")?.running, true);
  assert.equal(byId.get("agent-run")?.model, "claude-sonnet-5-5");
  assert.equal(byId.get("agent-answer")?.running, false);
  assert.equal(byId.get("agent-flag")?.running, false);
  assert.equal(byId.get("agent-old")?.running, false);
  // The description falls back to the type.
  assert.equal(byId.get("agent-answer")?.description, "Plan");
  assert.equal(agents.length, 4);
});

test("an agent without a transcript is skipped, and a session without agents gives an empty list", async () => {
  const { folder, directory } = setup();
  writeFileSync(
    join(directory, "agent-lonely.meta.json"),
    JSON.stringify({ description: "No file" }),
  );
  writeFileSync(join(directory, "agent-bad.meta.json"), "{not json");
  writeFileSync(join(directory, "agent-bad.jsonl"), working);
  assert.deepEqual(await listAgents(folder, SESSION), []);
  assert.deepEqual(
    await listAgents(folder, "22222222-2222-4222-8222-222222222222"),
    [],
  );
});

test("an id with a path in it is refused", async () => {
  const { folder } = setup();
  assert.deepEqual(await listAgents(folder, "../../etc"), []);
  assert.deepEqual(await listAgents(folder, `${SESSION}/..`), []);
  assert.deepEqual(await readAgentTranscript(folder, "..", "a1"), []);
  assert.deepEqual(await readAgentTranscript(folder, SESSION, "../x"), []);
});

test("the transcript of an agent is read with or without the prefix, and a change is seen", async () => {
  const { folder, directory } = setup();
  const user = line({ type: "user", message: { content: "Find it." } });
  writeFileSync(join(directory, "agent-a1.jsonl"), user);
  const first = await readAgentTranscript(folder, SESSION, "a1");
  assert.equal(first.length, 1);
  assert.deepEqual(
    await readAgentTranscript(folder, SESSION, "agent-a1"),
    first,
  );
  // A new file time makes the app read the file again.
  writeFileSync(join(directory, "agent-a1.jsonl"), user + answered);
  const later = new Date(Date.now() + 5000);
  utimesSync(join(directory, "agent-a1.jsonl"), later, later);
  assert.equal((await readAgentTranscript(folder, SESSION, "a1")).length, 2);
  assert.deepEqual(await readAgentTranscript(folder, SESSION, "none"), []);
});
