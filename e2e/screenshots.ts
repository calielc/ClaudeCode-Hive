/**
 * Takes the pictures for the documentation from the real app. Run `npm run screenshots`.
 *
 * The app runs against a made-up home folder with demo sessions, and `demo-claude.cjs` draws the terminals.
 * No real session, folder or file of the user is shown. The pictures go to `docs/images`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { card, eventually, type Hive, launchHive, settleFocus } from "./app";
import {
  createFixture,
  DAY,
  type Fixture,
  MINUTE,
  writeAgent,
  writeSession,
} from "./fixture";

const root = process.cwd();
const outDir = join(root, "docs", "images");

/** The ids end with the number of the scene that `demo-claude.cjs` draws. */
const IDS = {
  login: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  search: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  notes: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  deps: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
  darkMode: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5",
  flaky: "ffffffff-ffff-4fff-8fff-fffffffffff6",
  old: "99999999-9999-4999-8999-999999999997",
} as const;

/** Calls an action of the test seam `window.__hive`. */
function call(page: Page, name: string, ...args: unknown[]): Promise<void> {
  return page.evaluate(
    ({ action, values }) => {
      const seam = (
        window as unknown as {
          __hive: Record<string, (...a: unknown[]) => void>;
        }
      ).__hive;
      seam[action]?.(...values);
    },
    { action: name, values: args },
  );
}

/** The demo data: a few sessions with agents, the usage of the account, and the hooks as installed. */
function buildDemo(fixture: Fixture): void {
  const demo = [
    {
      id: IDS.login,
      title: "Fix login flow",
      branch: "feature/qr-login",
      model: "claude-sonnet-5-5",
      prompt: "Fix the redirect after the QR login",
      state: "working" as const,
      ageMs: 1 * MINUTE,
    },
    {
      id: IDS.search,
      title: "Refactor search",
      branch: "main",
      model: "claude-opus-5-5",
      prompt: "Refactor the search worker",
      state: "waiting" as const,
      ageMs: 2 * MINUTE,
    },
    {
      id: IDS.notes,
      title: "Write release notes",
      branch: "main",
      model: "claude-haiku-5-5",
      prompt: "Write the release notes",
      ageMs: 9 * MINUTE,
    },
    {
      id: IDS.deps,
      title: "Update dependencies",
      branch: "chore/deps",
      model: "claude-sonnet-5-5",
      prompt: "Update the dependencies",
      ageMs: 14 * MINUTE,
    },
    {
      id: IDS.darkMode,
      title: "Add a dark mode toggle",
      branch: "feature/dark-mode",
      model: "claude-sonnet-5-5",
      prompt: "Add a dark mode toggle",
      ageMs: 3 * 60 * MINUTE,
    },
    {
      id: IDS.flaky,
      title: "Find the flaky checkout test",
      branch: "main",
      model: "claude-opus-5-5",
      prompt: "Find the flaky checkout test",
      ageMs: 7 * 60 * MINUTE,
    },
    {
      id: IDS.old,
      title: "Sketch a plugin API",
      branch: "main",
      model: "claude-sonnet-5-5",
      prompt: "Sketch a plugin API",
      ageMs: 4 * DAY,
    },
  ];
  for (const spec of demo) {
    writeSession(fixture, spec);
  }

  // Three agents for the first session. The first one has a longer transcript, for the picture of the agent view.
  writeAgent(fixture, IDS.login, {
    id: "a1",
    type: "Explore",
    description: "Find the QR login code",
    model: "claude-sonnet-5-5",
    done: false,
    prompt: "Find where the QR login redirects after a scan.",
  });
  writeAgent(fixture, IDS.login, {
    id: "a2",
    type: "Plan",
    description: "Plan the redirect fix",
    model: "claude-haiku-5-5",
    done: true,
    prompt: "Plan the fix for the redirect.",
    ageMs: 2 * MINUTE,
  });
  writeAgent(fixture, IDS.login, {
    id: "a3",
    type: "general-purpose",
    description: "Review the diff",
    model: "claude-opus-5-5",
    done: false,
    prompt: "Review the diff for mistakes.",
  });
  const transcript = [
    {
      type: "user",
      message: {
        content:
          "Find where the QR login redirects after a scan. Report the file and the line.",
      },
    },
    {
      type: "assistant",
      message: {
        model: "claude-sonnet-5-5",
        content: [
          {
            type: "thinking",
            thinking:
              "The redirect is probably set in the login handler. I will search for the word redirect in the source folder.",
          },
          {
            type: "tool_use",
            id: "t1",
            name: "Grep",
            input: { pattern: "redirect", path: "src" },
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content:
              "src/login/qr.ts:41: window.location.assign(redirect)\nsrc/login/session.ts:12: export function redirect(user)\nsrc/login/session.ts:30: return redirect(user)\nsrc/app/routes.ts:8: const redirect = '/home'",
          },
        ],
      },
    },
    {
      type: "assistant",
      message: {
        model: "claude-sonnet-5-5",
        content: [
          {
            type: "text",
            text: "The scan handler calls redirect on line 41. I will read that file to see where the address comes from.",
          },
          {
            type: "tool_use",
            id: "t2",
            name: "Read",
            input: { file_path: "src/login/qr.ts" },
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t2",
            content:
              "export function onScan(code) {\n  const user = verify(code)\n  const redirect = user.lastPage ?? '/'\n  window.location.assign(redirect)\n}",
          },
        ],
      },
    },
    {
      type: "assistant",
      message: {
        model: "claude-sonnet-5-5",
        content: [
          {
            type: "text",
            text: "The address comes from user.lastPage. When it is empty, the code falls back to the root and skips the home route. I will check the route table next.",
          },
          {
            type: "tool_use",
            id: "t3",
            name: "Read",
            input: { file_path: "src/app/routes.ts" },
          },
        ],
      },
    },
  ];
  writeFileSync(
    join(fixture.projectDirectory, IDS.login, "subagents", "agent-a1.jsonl"),
    `${transcript.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );

  // Usage of the account, and the hooks as the "Install hooks" button writes them.
  const hiveDirectory = join(fixture.home, ".claude-sessions");
  mkdirSync(hiveDirectory, { recursive: true });
  const seconds = (offsetMs: number): number =>
    Math.floor((Date.now() + offsetMs) / 1000);
  writeFileSync(
    join(hiveDirectory, "usage.json"),
    JSON.stringify({
      five_hour: { used_percentage: 42, resets_at: seconds(2 * 60 * MINUTE) },
      seven_day: { used_percentage: 68, resets_at: seconds(3 * DAY) },
      model_scoped: [
        { display_name: "Opus", utilization: 88, resets_at: seconds(3 * DAY) },
      ],
      updated_at: seconds(0),
    }),
  );
  writeFileSync(
    join(fixture.home, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "node hook.cjs ready" }] },
        ],
      },
      statusLine: { type: "command", command: "node statusline-tap.cjs" },
    }),
  );
}

async function open(
  hive: Hive,
  title: string,
  id: string,
  marker: RegExp,
): Promise<void> {
  await hive.page
    .locator(".row", {
      has: hive.page.locator(".row-title", { hasText: title }),
    })
    .click();
  await eventually(async () => {
    if (!marker.test(await hive.terminalText(id))) {
      throw new Error(`The terminal of ${title} is not ready.`);
    }
  }, 20_000);
}

async function shoot(
  hive: Hive,
  name: string,
  locator?: string,
): Promise<void> {
  await settleFocus(hive.page);
  // Move the mouse away, so no hover state shows in the picture.
  await hive.page.mouse.move(2, 2);
  const path = join(outDir, `${name}.png`);
  await (locator
    ? hive.page.locator(locator).screenshot({ path })
    : hive.page.screenshot({ path }));
  console.log(`Saved ${path}`);
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const fixture = createFixture({ homeName: "acme-shop", withSessions: false });
  buildDemo(fixture);
  const demoScript = join(root, "e2e", "demo-claude.cjs").replace(/\\/g, "/");
  const hive = await launchHive({
    fixture,
    env: { HIVE_PTY_COMMAND: `node ${demoScript} {id}` },
  });
  const { page } = hive;
  try {
    await page.locator(".row").first().waitFor();
    await open(hive, "Fix login flow", IDS.login, /Fixing the redirect/);
    await open(hive, "Refactor search", IDS.search, /Run this command/);
    await open(hive, "Write release notes", IDS.notes, /release notes/);

    // Colour tags.
    await call(page, "setTag", [IDS.login], "blue");
    await call(page, "setTag", [IDS.search], "orange");
    await call(page, "setTag", [IDS.notes], "green");

    // Two panes side by side, with the first session on the left.
    await call(page, "activateTab", IDS.login);
    await call(page, "setLayout", "sideBySide");
    await shoot(hive, "overview");
    await shoot(hive, "left-panel", ".sidebar");

    // The transcript of an agent replaces the terminal of its session.
    await card(page, "Fix login flow")
      .locator(".agent-row", { hasText: "Find the QR login code" })
      .click();
    await page.locator(".agent-transcript").first().waitFor();
    await shoot(hive, "agent-transcript");
    await card(page, "Fix login flow")
      .locator(".agent-row", { hasText: "Main" })
      .click();

    // Four panes. The fourth session opens now, so the left panel has room for the list in the first pictures.
    await open(hive, "Update dependencies", IDS.deps, /three updates/);
    await call(page, "setTag", [IDS.deps], "purple");
    await call(page, "activateTab", IDS.login);
    await call(page, "setLayout", "grid");
    await shoot(hive, "grid");

    // The left panel hidden, so the panes use the full width.
    await page.locator(".sidebar-toggle").click();
    await eventually(async () => {
      if (await page.locator(".sidebar").isVisible()) {
        throw new Error("The panel is still visible.");
      }
    });
    await shoot(hive, "left-panel-hidden");
  } finally {
    await hive.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
