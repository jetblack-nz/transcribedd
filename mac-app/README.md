# macOS Desktop Application

The Transcribedd Worker - a native macOS application that processes transcription jobs using local Whisper AI.

## Overview

This is a macOS desktop app (menu bar app) that:
- Polls the API for pending transcription jobs
- Downloads podcast audio files
- Runs Whisper AI locally for transcription
- Uploads completed transcripts back to Azure
- Provides status notifications and progress updates

## Tech Stack Decision

**Option A: Native Swift + SwiftUI** (Recommended)
- Best performance and native macOS integration
- Smaller app size (~10-20MB)
- Better battery efficiency
- System tray/menu bar integration
- Native notifications
- Requires: Xcode, macOS development experience

**Option B: Electron + React**
- Cross-platform potential (Windows/Linux later)
- Reuse web frontend code
- JavaScript/TypeScript consistency
- Larger app size (~150MB+)
- Higher memory usage
- Requires: Node.js, Electron knowledge

**Decision:** See [docs/plan/DECISIONS.md](../docs/plan/DECISIONS.md)

## Structure

### Swift/SwiftUI (if chosen)
```
mac-app/
├── TranscribeddWorker/
│   ├── Models/
│   │   ├── Job.swift
│   │   ├── Settings.swift
│   │   └── TranscriptResult.swift
│   ├── Services/
│   │   ├── APIService.swift
│   │   ├── DownloadManager.swift
│   │   ├── WhisperService.swift
│   │   └── UploadManager.swift
│   ├── Views/
│   │   ├── MenuBarView.swift
│   │   ├── PreferencesView.swift
│   │   └── ProgressView.swift
│   ├── Utils/
│   └── App.swift
└── TranscribeddWorker.xcodeproj
```

### Electron (if chosen)
```
mac-app/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # React UI
│   ├── services/      # Background services
│   └── preload/
├── package.json
└── electron-builder.json
```

## Whisper Integration

### Option A: Python Whisper
```bash
# Install
pip install openai-whisper

# Usage in app
python3 -m whisper audio.mp3 --model medium --output_format all
```

### Option B: whisper.cpp (Recommended for production)
```bash
# Build whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make

# Download models
bash ./models/download-ggml-model.sh medium

# Usage
./main -m models/ggml-medium.bin -f audio.wav
```

**whisper.cpp advantages:**
- 2-4x faster on M-series Macs
- Lower memory usage
- No Python runtime needed
- Better battery life

## Features

### Core Functionality
- [x] Job polling (every 30 seconds)
- [x] Audio file download with progress
- [x] Whisper transcription
- [x] Multiple format output (TXT, SRT, VTT, JSON)
- [x] Result upload to Azure
- [x] Error handling and retry logic

### User Interface
- [x] Menu bar icon with status
- [x] Preferences/Settings window
- [x] Active job progress display
- [x] Notification on completion
- [x] Job history viewer

### Settings
- API endpoint URL
- User API key
- Polling interval
- Whisper model selection (tiny/base/small/medium/large)
- Auto-start on login
- Notification preferences
- Storage location for temp files

## Development Setup

### Prerequisites
- macOS 12.0+
- Xcode 14+ (for Swift)
  OR
- Node.js 18+ (for Electron)
- Python 3.8+ (for Whisper)
- Azure account credentials

### Swift Development
```bash
# Open in Xcode
open TranscribeddWorker.xcodeproj

# Install dependencies (if using Swift Package Manager)
# Dependencies managed in Xcode

# Run
# Press Cmd+R in Xcode
```

### Electron Development
```bash
cd mac-app
npm install
npm run dev
```

### Install Whisper
```bash
# Python version
pip install openai-whisper

# OR whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
```

## Configuration

Create `settings.json` in app's Application Support folder:
```json
{
  "apiEndpoint": "https://transcribedd-api.azurewebsites.net",
  "apiKey": "your-api-key",
  "pollingInterval": 30,
  "whisperModel": "medium",
  "autoStart": true,
  "notificationsEnabled": true,
  "tempDirectory": "~/Library/Application Support/Transcribedd/temp"
}
```

## Building & Distribution

### Code Signing (Required for macOS)
1. Join Apple Developer Program ($99/year)
2. Create Developer ID certificate
3. Sign the app

### Notarization (Required for macOS)
```bash
# Submit for notarization
xcrun notarytool submit TranscribeddWorker.zip \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID"
```

### Distribution Options
1. **Direct Download** - DMG file from website
2. **Homebrew Cask** - `brew install transcribedd-worker`
3. **Mac App Store** - Full review process required

## Auto-Updates

**For native Swift:**
- Use Sparkle framework
- Host appcast.xml on Azure

**For Electron:**
- Use electron-updater
- Uses GitHub releases or custom server

## Testing

### Unit Tests
```bash
# Swift: Cmd+U in Xcode
# Electron: npm test
```

### Integration Tests
- Test API connection
- Test Whisper integration
- Test full job workflow
- Test error scenarios

## Performance Targets

- Job polling: <500ms response time
- Audio download: Full bandwidth utilization
- Transcription: ~5 minutes for 1-hour podcast (medium model)
- Upload: <30 seconds for typical transcript
- Memory usage: <200MB idle, <2GB during transcription

## Troubleshooting

Common issues and solutions coming soon.

## Security

- API keys stored in macOS Keychain
- HTTPS for all API calls
- Temporary files deleted after upload
- No audio/transcript data persisted locally (optional setting)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.
