#!/usr/bin/env bash
# Builds TranscribeddWorker and assembles a proper macOS .app bundle.
# Usage: ./build.sh [debug|release]   (default: debug)
set -euo pipefail

CONFIG="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build/$CONFIG"
APP_NAME="TranscribeddWorker"
APP_BUNDLE="$SCRIPT_DIR/$APP_NAME.app"

echo "==> Building ($CONFIG)…"
cd "$SCRIPT_DIR"
swift build -c "$CONFIG" 2>&1

BINARY="$BUILD_DIR/$APP_NAME"

echo "==> Assembling $APP_NAME.app…"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
cp "TranscribeddWorker/Resources/Info.plist" "$APP_BUNDLE/Contents/"

# Code-sign with entitlements (ad-hoc — works locally without a developer account)
codesign --force --sign - \
    --entitlements "TranscribeddWorker/Resources/TranscribeddWorker.entitlements" \
    --options runtime \
    "$APP_BUNDLE"

echo ""
echo "✅  Built: $APP_BUNDLE"
echo "    Run:  open \"$APP_BUNDLE\""
echo "    Or:   cp -R \"$APP_BUNDLE\" /Applications/"
