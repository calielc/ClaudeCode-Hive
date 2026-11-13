#!/bin/zsh
# Builds a release binary and wraps it in Hive.app, with the icon.
set -e
cd "$(dirname "$0")/.."
swift build -c release
BIN=$(swift build -c release --show-bin-path)/Hive
APP=Hive.app
rm -rf "$APP" ClaudeSessions.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Hive"

ICONSET=$(mktemp -d)/AppIcon.iconset
"$BIN" --export-icon "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Hive</string>
<key>CFBundleDisplayName</key><string>Hive</string>
<key>CFBundleIdentifier</key><string>local.hive</string>
<key>CFBundleExecutable</key><string>Hive</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
P
codesign --force --sign - "$APP" 2>/dev/null || true
echo "Built $APP"
