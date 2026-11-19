// Status line wrapper for Hive.
// Claude Code sends the usage limits (5 hour window, week) to the status line command.
// This script saves them to ~/.claude-sessions/usage.json, then runs the original status line command
// with the same input, so the status line looks the same as before.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const base = path.join(os.homedir(), ".claude-sessions");
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const limits = JSON.parse(raw)?.rate_limits;
    if (limits && typeof limits === "object") {
      fs.mkdirSync(base, { recursive: true });
      const snapshot = {
        updated_at: Date.now() / 1000,
        five_hour: limits.five_hour,
        seven_day: limits.seven_day,
        model_scoped: limits.model_scoped,
      };
      const temp = path.join(base, "usage.json.tmp");
      fs.writeFileSync(temp, JSON.stringify(snapshot));
      fs.renameSync(temp, path.join(base, "usage.json"));
    }
  } catch {}

  let original = "";
  try {
    original = fs
      .readFileSync(path.join(base, "statusline-original.txt"), "utf8")
      .trim();
  } catch {}
  if (original) {
    const result = spawnSync(original, {
      shell: true,
      input: raw,
      stdio: ["pipe", "inherit", "inherit"],
    });
    process.exit(result.status === null ? 1 : result.status);
  }
});
