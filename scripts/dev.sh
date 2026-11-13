#!/bin/zsh
# Builds the debug version and runs it. Stops a running copy first.
cd "$(dirname "$0")/.."
pkill -x Hive 2>/dev/null
swift build || exit 1
exec "$(swift build --show-bin-path)/Hive"
