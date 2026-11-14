#!/bin/sh
# Builds tools/build/mBot Bridge.app. macOS only lets a program with its own description of why
# it wants Bluetooth use it, so the bridge has to be a small app. Start and stop it with:
#   open -n --stdout /tmp/mbot-bridge.log --stderr /tmp/mbot-bridge.log "tools/build/mBot Bridge.app"
#   pkill -x mbot-bridge
set -e
cd "$(dirname "$0")"
app="build/mBot Bridge.app/Contents"
mkdir -p "$app/MacOS"
swiftc -O -swift-version 5 mbot-bridge.swift -o "$app/MacOS/mbot-bridge"
cat > "$app/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>local.ola-mbot.bridge</string>
  <key>CFBundleName</key><string>mBot Bridge</string>
  <key>CFBundleExecutable</key><string>mbot-bridge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>NSBluetoothAlwaysUsageDescription</key><string>Talks to the mBot robot, to test the Olá, mBot! app on it.</string>
</dict>
</plist>
EOF
codesign --force --sign - "build/mBot Bridge.app"
echo "built tools/build/mBot Bridge.app"
