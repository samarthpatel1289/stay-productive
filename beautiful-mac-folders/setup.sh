#!/bin/bash
set -euo pipefail

# Ensure running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Error: This script is only supported on macOS."
  exit 1
fi

echo "Setting up beautiful-mac-folders..."

# 1. Create Folder Actions directory if missing
TARGET_DIR="$HOME/Library/Workflows/Applications/Folder Actions"
mkdir -p "$TARGET_DIR"

# 2. Compile AppleScript to binary format
SCRIPT_SOURCE="AutoStyleFolder.applescript"
SCRIPT_TARGET="$TARGET_DIR/AutoStyleFolder.scpt"

if [[ -f "$SCRIPT_SOURCE" ]]; then
  echo "Compiling Folder Action script to $SCRIPT_TARGET..."
  osacompile -o "$SCRIPT_TARGET" "$SCRIPT_SOURCE"
  echo "✓ Folder Action script compiled successfully!"
else
  echo "Error: Source script $SCRIPT_SOURCE not found."
  exit 1
fi

echo ""
echo "Setup complete! Next steps:"
echo "1. Import the Shortcut to your Mac."
echo "2. Open Finder, right-click a folder you want to auto-style (like your user home folder or iCloud Drive)."
echo "3. Choose Quick Actions -> Folder Actions Setup..."
echo "4. Enable Folder Actions, and attach the 'AutoStyleFolder' script."
echo ""
echo "For full details, please refer to the README.md!"
