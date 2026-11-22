import assert from "node:assert/strict";
import { test } from "node:test";
import { withoutSessionMarkers } from "./pty-env.ts";

test("the markers of a parent Claude Code session are removed", () => {
  const clean = withoutSessionMarkers({
    CLAUDECODE: "1",
    CLAUDE_CODE_CHILD_SESSION: "1",
    CLAUDE_CODE_CHILD_NOTES_DIR: "/tmp/notes",
    CLAUDE_CODE_SESSION_ID: "abc",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    CLAUDE_CODE_EXECPATH: "/bin/claude",
    CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/s",
    CLAUDE_CODE_BRIDGE_SESSION_ID: "x",
    CLAUDE_PID: "42",
    PATH: "/usr/bin",
  });
  assert.deepEqual(clean, { PATH: "/usr/bin" });
});

test("the settings that the user chooses stay", () => {
  const env = {
    CLAUDE_CONFIG_DIR: "/home/me/.claude",
    CLAUDE_CODE_USE_BEDROCK: "1",
    ANTHROPIC_API_KEY: "key",
    HOME: "/home/me",
  };
  assert.deepEqual(withoutSessionMarkers(env), env);
});

test("a variable without a value is left out", () => {
  assert.deepEqual(withoutSessionMarkers({ A: undefined, B: "1" }), { B: "1" });
});
