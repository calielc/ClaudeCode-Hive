import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVENTS,
  type HookGroup,
  hooksStatusOf,
  isOurHook,
  isOurTap,
  type Json,
  mergeSettings,
} from "./hooks-settings.ts";

const options = {
  runner: '"/usr/bin/node"',
  hookFile: "/home/me/.claude-sessions/hook.cjs",
  tapFile: "/home/me/.claude-sessions/statusline-tap.cjs",
};

function groups(settings: Json, event: string): HookGroup[] {
  return (settings.hooks as Record<string, HookGroup[]>)[event] ?? [];
}

test("the hooks of Hive are told from the hooks of other tools", () => {
  assert.equal(isOurHook('node "/h/.claude-sessions/hook.cjs" ready'), true);
  assert.equal(isOurHook('python3 "/h/.claude-sessions/hook.py" ready'), true);
  assert.equal(isOurHook("my-own-hook.sh"), false);
  assert.equal(isOurHook("node /elsewhere/hook.cjs"), false);
  assert.equal(isOurHook(undefined), false);
  assert.equal(isOurTap('node "/h/.claude-sessions/statusline-tap.cjs"'), true);
  assert.equal(isOurTap("ccusage statusline"), false);
});

test("an empty settings file gets one hook for each event and the wrapper", () => {
  const { settings, originalStatusLine } = mergeSettings({}, options);
  for (const [event, state] of Object.entries(EVENTS)) {
    const entries = groups(settings, event).flatMap((group) => group.hooks);
    assert.equal(entries.length, 1, event);
    assert.equal(
      entries[0]?.command,
      `"/usr/bin/node" "${options.hookFile}" ${state}`,
    );
  }
  assert.deepEqual(settings.statusLine, {
    type: "command",
    command: `"/usr/bin/node" "${options.tapFile}"`,
  });
  assert.equal(originalStatusLine, "");
});

test("the hooks and settings of the user stay", () => {
  const input: Json = {
    model: "opus",
    permissions: { allow: ["Bash(ls)"] },
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "notify-me.sh" }] }],
      PostToolUse: [{ hooks: [{ type: "command", command: "lint.sh" }] }],
    },
    statusLine: { type: "command", command: "ccusage statusline" },
  };
  const { settings, originalStatusLine } = mergeSettings(input, options);
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
  const stop = groups(settings, "Stop").flatMap((group) => group.hooks);
  assert.equal(stop[0]?.command, "notify-me.sh");
  assert.equal(stop.length, 2);
  assert.equal(groups(settings, "PostToolUse").length, 1);
  assert.equal(originalStatusLine, "ccusage statusline");
});

test("the older entries of Hive are replaced, also the Python ones", () => {
  const input: Json = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: 'python3 "/h/.claude-sessions/hook.py" ready',
            },
            { type: "command", command: "keep-me.sh" },
          ],
        },
      ],
    },
  };
  const { settings } = mergeSettings(input, options);
  const commands = groups(settings, "Stop")
    .flatMap((group) => group.hooks)
    .map((entry) => entry?.command);
  assert.deepEqual(commands, [
    "keep-me.sh",
    `"/usr/bin/node" "${options.hookFile}" ready`,
  ]);
});

test("a second run changes nothing and keeps the first original status line", () => {
  const first = mergeSettings(
    { statusLine: { type: "command", command: "ccusage statusline" } },
    options,
  );
  const second = mergeSettings(first.settings, options);
  assert.deepEqual(second.settings, first.settings);
  // The status line is the wrapper now. The file with the original command must not be overwritten.
  assert.equal(second.originalStatusLine, undefined);
});

test("the input is not changed", () => {
  const input: Json = { hooks: { Stop: [] } };
  const copy = structuredClone(input);
  mergeSettings(input, options);
  assert.deepEqual(input, copy);
});

test("the status tells which parts are installed", () => {
  assert.deepEqual(hooksStatusOf({}), {
    hooksInstalled: false,
    usageInstalled: false,
  });
  assert.deepEqual(hooksStatusOf(mergeSettings({}, options).settings), {
    hooksInstalled: true,
    usageInstalled: true,
  });
  assert.deepEqual(
    hooksStatusOf({
      hooks: { Stop: [{ hooks: [{ command: "other.sh" }] }] },
      statusLine: { command: "ccusage" },
    }),
    { hooksInstalled: false, usageInstalled: false },
  );
});
