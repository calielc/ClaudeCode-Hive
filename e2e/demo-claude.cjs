// A stand-in for the `claude` command that draws a made-up conversation. `npm run screenshots` uses it, so the pictures in
// the documentation show demo data and never a real session. The first argument is the id of the session. The last
// character of the id chooses the scene.
const id = process.argv[2] || "";
const scene = id.slice(-1);

const esc = "\x1b[";
const reset = `${esc}0m`;
const dim = (text) => `${esc}2m${text}${reset}`;
const bold = (text) => `${esc}1m${text}${reset}`;
const orange = (text) => `${esc}38;5;209m${text}${reset}`;
const green = (text) => `${esc}32m${text}${reset}`;
const blue = (text) => `${esc}38;5;111m${text}${reset}`;
const yellow = (text) => `${esc}33m${text}${reset}`;

const width = 40;
// The length that a text has on the screen, without the color codes.
const colorCodes = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const visible = (text) => text.replace(colorCodes, "").length;
const pad = (text, size) =>
  text + " ".repeat(Math.max(0, size - visible(text)));

const box = (...rows) => [
  dim(`╭${"─".repeat(width)}╮`),
  ...rows.map((row) => dim("│ ") + pad(row, width - 2) + dim(" │")),
  dim(`╰${"─".repeat(width)}╯`),
];

function header(branch) {
  return [
    ...box(
      `${orange("✻")} ${bold("Demo session")}`,
      dim(`  ~/acme-shop  ·  ${branch}`),
    ),
    "",
  ];
}

const scenes = {
  1: [
    ...header("feature/qr-login"),
    `${dim(">")} Fix the redirect after the QR login`,
    "",
    `${green("●")} I will start with the login code.`,
    "",
    `${green("●")} Grep(redirect)`,
    dim("  ⎿ 4 matches in 2 files"),
    `${green("●")} Read(src/login/qr.ts)`,
    dim("  ⎿ Read 112 lines"),
    `${green("●")} Edit(src/login/qr.ts)`,
    dim("  ⎿ Updated with 3 additions"),
    "",
    `${orange("✻")} Fixing the redirect… ${dim("(18s · esc to interrupt)")}`,
  ],
  2: [
    ...header("main"),
    `${dim(">")} Refactor the search worker`,
    "",
    `${green("●")} The worker reads 4 files at a time.`,
    "  I will move the matching into a",
    "  helper that the tests can call.",
    "",
    `${green("●")} Update(src/search-core.ts)`,
    dim("  ⎿ Updated with 12 additions"),
    "",
    ...box(
      bold("Run this command?"),
      "  npm test",
      `${blue("❯")} 1. Yes`,
      "  2. No",
    ),
  ],
  3: [
    ...header("main"),
    `${dim(">")} Write the release notes`,
    "",
    `${green("●")} Here are the notes for version 2.1:`,
    "",
    bold("  Added"),
    "  - Hide the left panel with Ctrl+B",
    "  - A notice when a new release exists",
    "",
    bold("  Fixed"),
    "  - The search key keeps its focus",
    "",
    ...box(">"),
    dim("  ? for shortcuts"),
  ],
  4: [
    ...header("chore/deps"),
    `${dim(">")} Update the dependencies`,
    "",
    `${green("●")} Bash(npm outdated)`,
    dim("  ⎿ 3 packages can be updated"),
    `${green("●")} Bash(npm update)`,
    dim("  ⎿ Updated 3 packages"),
    `${green("●")} Bash(npm test)`,
    dim("  ⎿ 62 tests passed"),
    "",
    `${green("●")} All three updates pass the tests.`,
    "",
    ...box(">"),
    dim("  ? for shortcuts"),
  ],
};

const lines = scenes[scene] ?? [yellow("Demo session")];
process.stdout.write(`${lines.join("\r\n")}\r\n`);
process.stdin.on("data", () => undefined);
setInterval(() => undefined, 1000000);
