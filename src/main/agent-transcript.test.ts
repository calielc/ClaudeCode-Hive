import assert from "node:assert/strict";
import { test } from "node:test";
import {
  endsWithAnswer,
  lastModel,
  parseTranscript,
  toolSummary,
} from "./agent-transcript";

const line = (value: unknown): string => JSON.stringify(value);

const transcript = [
  line({ type: "user", message: { role: "user", content: "Find the bug." } }),
  line({ type: "attachment", attachment: { type: "skill_listing" } }),
  line({
    type: "assistant",
    message: {
      content: [
        { type: "thinking", thinking: "Look at the log." },
        { type: "tool_use", name: "Bash", input: { command: "git log" } },
      ],
    },
  }),
  line({
    type: "user",
    message: {
      content: [
        { type: "tool_result", content: "abc123 fix", is_error: false },
      ],
    },
  }),
  line({
    type: "assistant",
    message: { content: [{ type: "text", text: "Found it." }] },
  }),
].join("\n");

test("parseTranscript turns the records into readable entries and skips the others", () => {
  assert.deepEqual(parseTranscript(transcript), [
    { kind: "prompt", text: "Find the bug." },
    { kind: "thinking", text: "Look at the log." },
    { kind: "tool", name: "Bash", text: "git log" },
    { kind: "result", text: "abc123 fix", error: false },
    { kind: "text", text: "Found it." },
  ]);
});

test("parseTranscript reads text parts of a tool result and ignores broken lines", () => {
  const raw = [
    "not json",
    line({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            content: [
              { type: "text", text: "one" },
              { type: "text", text: "two" },
            ],
            is_error: true,
          },
        ],
      },
    }),
  ].join("\n");
  assert.deepEqual(parseTranscript(raw), [
    { kind: "result", text: "one\ntwo", error: true },
  ]);
});

test("parseTranscript cuts a very long tool result", () => {
  const raw = line({
    type: "user",
    message: { content: [{ type: "tool_result", content: "x".repeat(5000) }] },
  });
  const [entry] = parseTranscript(raw);
  assert.ok(
    entry?.kind === "result" &&
      entry.text.length < 1700 &&
      entry.text.includes("more characters"),
  );
});

test("toolSummary picks the most telling input field", () => {
  assert.equal(toolSummary({ file_path: "a.ts", other: 1 }), "a.ts");
  assert.equal(toolSummary({ pattern: "foo" }), "foo");
  assert.equal(toolSummary({ x: 1 }), '{"x":1}');
  assert.equal(toolSummary(null), "");
});

test("endsWithAnswer is true only when the last message is an answer without a tool call", () => {
  assert.equal(endsWithAnswer(transcript), true);
  const running = [
    line({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Read", input: {} }] },
    }),
  ].join("\n");
  assert.equal(endsWithAnswer(running), false);
  const waiting = [
    line({
      type: "assistant",
      message: { content: [{ type: "text", text: "ok" }] },
    }),
    line({
      type: "user",
      message: { content: [{ type: "tool_result", content: "r" }] },
    }),
  ].join("\n");
  assert.equal(endsWithAnswer(waiting), false);
  assert.equal(endsWithAnswer(""), false);
});

test("lastModel returns the model of the last assistant message that names one", () => {
  const raw = [
    '{"type":"assistant","message":{"model":"claude-haiku-4-5","content":[]}}',
    '{"type":"user","message":{"content":"x"}}',
    '{"type":"assistant","message":{"model":"<synthetic>","content":[]}}',
    'not json "model"',
  ].join("\n");
  assert.equal(lastModel(raw), "claude-haiku-4-5");
  assert.equal(lastModel(""), undefined);
});
