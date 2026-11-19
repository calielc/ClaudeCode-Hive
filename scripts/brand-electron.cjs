// Gives the Electron binary of the dev app the name and the icon of Hive.
// On macOS, the menu bar, the Dock and the app switcher take the name from the Info.plist of Electron.app.
// Without this step, `npm run dev` shows "Electron". The packaged app is already called Hive.
// The step is safe to run again. It does nothing on other systems.
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const NAME = "Hive";

/** Builds an .icns file from a large PNG: the sizes of an iconset, then `iconutil`. */
function makeIcns(png, target) {
  const folder = mkdtempSync(join(tmpdir(), "hive-icon-"));
  const iconset = join(folder, "Hive.iconset");
  mkdirSync(iconset);
  try {
    for (const base of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const pixels = base * scale;
        const file =
          scale === 1
            ? `icon_${base}x${base}.png`
            : `icon_${base}x${base}@2x.png`;
        execFileSync(
          "sips",
          [
            "-z",
            String(pixels),
            String(pixels),
            png,
            "--out",
            join(iconset, file),
          ],
          { stdio: "ignore" },
        );
      }
    }
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", target]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.platform !== "darwin") {
  process.exit(0);
}

let bundle;
try {
  const electronDirectory = dirname(require.resolve("electron/package.json"));
  bundle = join(electronDirectory, "dist", "Electron.app");
  const plist = join(bundle, "Contents", "Info.plist");
  if (!existsSync(plist)) {
    process.exit(0);
  }
  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    execFileSync("plutil", ["-replace", key, "-string", NAME, plist]);
  }
} catch (error) {
  console.warn(`Could not rename the dev app to ${NAME}: ${error.message}`);
  process.exit(0);
}

// A failed icon must not leave the bundle without a valid signature, so the icon has its own try block.
try {
  const icon = join(__dirname, "..", "build", "icon.png");
  if (existsSync(icon)) {
    makeIcns(icon, join(bundle, "Contents", "Resources", "electron.icns"));
  }
} catch (error) {
  console.warn(`Could not set the icon of the dev app: ${error.message}`);
}

try {
  // The change breaks the old signature of the bundle. An ad hoc signature makes it valid for this machine again.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], {
    stdio: "ignore",
  });
} catch (error) {
  console.warn(`Could not sign the dev app again: ${error.message}`);
}
