# macOS Desktop Application

The Transcribedd Worker — a native macOS menu-bar app that processes transcription jobs using local Whisper AI.

## Overview

- Polls Supabase for pending transcription jobs (10-second interval)
- Atomically claims a job via `claim_next_job` SQL RPC
- Downloads the podcast audio file
- Runs **whisper.cpp** (`whisper-cli`) locally for transcription
- Uploads the completed transcript to Supabase Storage
- Updates job status in real time

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Swift + SwiftUI (native macOS, menu-bar app) |
| Backend | Supabase (Auth, Database, Storage) |
| Transcription | whisper.cpp via Homebrew (`whisper-cli`) |
| Min OS | macOS 14 Sonoma |

**Decision history:** [docs/plan/DECISIONS.md](../docs/plan/DECISIONS.md)

## Project Structure

```
mac-app/
└── TranscribeddWorker/
    ├── App.swift                        # @main entry, MenuBarExtra + Settings scenes
    ├── AppState.swift                   # ObservableObject — drives UI, owns polling loop
    ├── Models/
    │   └── Job.swift                    # Codable Job struct + JobStatus enum
    ├── Settings/
    │   └── AppSettings.swift            # UserDefaults + Keychain-backed settings
    ├── Services/
    │   ├── SupabaseService.swift        # Auth, DB (claim/complete/fail), Storage upload
    │   ├── TranscriptionService.swift   # Runs whisper-cli subprocess
    │   └── DownloadManager.swift        # Downloads audio to temp directory
    ├── Views/
    │   ├── MenuBarView.swift            # Menu popover — status, current job, recent jobs
    │   └── PreferencesView.swift        # Settings tabs (Supabase / Whisper)
    ├── Utils/
    │   └── KeychainHelper.swift         # SecItem wrapper for storing password
    └── Resources/
        └── TranscribeddWorker.entitlements
```

## Whisper Integration

whisper.cpp is installed via Homebrew:

```bash
brew install whisper-cpp
# Installed binaries: whisper-cli, whisper-cpp, whisper-server, …
```

The app calls `whisper-cli` as a subprocess:

```bash
whisper-cli -m ~/.cache/whisper/ggml-small.bin \
            -otxt \
            --output-file /tmp/audio \
            -t 8 \
            /tmp/audio.mp3
# → writes /tmp/audio.txt
```

Models are downloaded once and cached in `~/.cache/whisper/`. The Preferences window
has a **Download small model** button that fetches `ggml-small.bin` from HuggingFace.

| Model | Size | Speed (M3) | Accuracy |
|-------|------|------------|----------|
| tiny  | 75 MB | ~30s/hr audio | Basic |
| base  | 142 MB | ~60s/hr audio | Good |
| **small** | **466 MB** | **~2min/hr audio** | **Recommended** |
| medium | 1.5 GB | ~5min/hr audio | High |

## Xcode Setup (one-time)

### Prerequisites

- macOS 14 Sonoma or later
- Xcode 15+
- whisper.cpp: `brew install whisper-cpp`

### 1. Create the Xcode project

1. Open Xcode → **File › New › Project…**
2. Choose **macOS › App**
3. Fill in:
   - Product Name: `TranscribeddWorker`
   - Bundle Identifier: `com.yourname.TranscribeddWorker`
   - Interface: **SwiftUI**
   - Language: **Swift**
4. Save into `mac-app/`
5. Delete the generated `ContentView.swift`

### 2. Add source files

Drag all files from `mac-app/TranscribeddWorker/` into the Xcode project (check **Copy items if needed** = OFF, **Add to target** = TranscribeddWorker).

### 3. Add Supabase Swift SDK

**File › Add Package Dependencies…**  
URL: `https://github.com/supabase-community/supabase-swift`  
Version: `2.0.0` or later  
Select product: **Supabase**

### 4. Configure the target

| Setting | Value |
|---------|-------|
| Deployment Target | macOS 13.0 |
| Signing & Capabilities → Entitlements File | `TranscribeddWorker/Resources/TranscribeddWorker.entitlements` |
| Info.plist → `LSUIElement` | `YES` (hides Dock icon — menu-bar only) |
| Info.plist → `NSAppTransportSecurity` | not needed (HTTPS only) |

### 5. Run

Press **⌘R**. A waveform icon appears in the menu bar.  
Open **Settings** and enter your Supabase credentials + whisper model path.  
Click **Test Connection**, then **Start**.

## Security Notes

- Password is stored in the macOS Keychain (never UserDefaults)
- No app sandbox — required to launch `whisper-cli` from `/opt/homebrew/bin`
- Downloaded audio is written to `tmp/` and deleted immediately after transcription
- Transcripts are uploaded to a private Supabase Storage bucket scoped to the user's UUID

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

