# Transcribedd

> Discover podcasts online, transcribe locally, access anywhere.

**Ultra-Lean MVP**: Built with Supabase for $0/month infrastructure costs.

## What is Transcribedd?

Transcribedd is a podcast transcription system that combines cloud-based podcast discovery with local AI transcription for maximum privacy and zero API costs.

### How it works:

1. 🔍 **Discover** - Browse and search podcasts through the web app (Supabase + React)
2. 📥 **Queue** - Select episodes to transcribe
3. 💻 **Transcribe** - Your macOS app downloads and transcribes using local Whisper AI
4. ☁️ **Access** - Download or view your transcripts from anywhere
5. ⚡ **Real-time** - Instant status updates via WebSocket (no polling!)

## Key Features

- **Cloud Discovery**: Search millions of podcasts via web interface
- **Local Processing**: Transcription happens on your Mac (private, no API costs)
- **Fast & Accurate**: OpenAI Whisper provides state-of-the-art transcription
- **Real-time Updates**: No polling! Instant status updates via WebSocket
- **Multiple Formats**: Download as TXT, SRT, VTT, or JSON
- **Actually Free**: $0/month for 2-50 users (not a trial, not a gimmick)

## Project Status

🚧 **Planning Complete** → ▶️ **Ready to Build**

- ✅ Architecture designed for Supabase MVP
- ✅ Cost analysis: $0/month confirmed
- ✅ 2-week implementation plan ready
- 📅 **Next**: Start Phase 1 development (Web App + Supabase)

## Tech Stack

### MVP Stack (Current Implementation)
- **Backend Platform**: **Supabase** (all-in-one) - FREE tier
  - PostgreSQL database (included)
  - File storage (included)
  - Authentication (included)
  - Realtime WebSocket (included)
- **Frontend**: React + TypeScript
- **Hosting**: Vercel/Netlify - FREE tier
- **macOS App**: Swift + SwiftUI (native)
- **AI Transcription**: OpenAI Whisper (runs locally, free)
- **Podcast API**: Podcast Index API (free)

**Total Infrastructure Cost**: **$0/month** for 2-50 users ✨

### Future Migration Path (Post-MVP)
When you outgrow Supabase free tier (6-12+ months):
- Azure App Service
- Azure Database for PostgreSQL
- Azure Blob Storage  
- Custom Node.js backend

*(Original Azure architecture docs preserved for future migration)*

## Getting Started

### 🚀 Quick Start (2 Hours to Deploy)

1. **Create free Supabase account** at supabase.com
2. **Set up database** (copy/paste SQL schema)
3. **Deploy web app** to Vercel (3 clicks)
4. **Build macOS app** in Xcode

**Detailed Guide**: [Quick Start](docs/plan/QUICKSTART_SUPABASE.md)

### 📚 Deep Dive

1. 📋 [Project Plan](docs/plan/PROJECT_PLAN.md) - 2-week roadmap with Supabase
2. 🏗️ [Architecture](docs/plan/ARCHITECTURE.md) - Simplified system design
3. ⚙️ [Technology Decisions](docs/plan/DECISIONS.md) - Why Supabase for MVP
4. 💰 [Cost Analysis](docs/plan/COSTS.md) - $0/month breakdown

### Prerequisites

- **For Web App**: Node.js 18+, free Supabase account, free Vercel account
- **For macOS App**: Xcode, Python 3.8+ (for Whisper)
- **APIs (Free)**: Podcast Index API key

**Time to first deploy**: 2 hours  
**Cost**: $0/month

## Documentation

### 📁 Planning & Architecture
- **[📋 Project Plan](docs/plan/PROJECT_PLAN.md)** - 2-week Supabase MVP roadmap
- **[🏗️ Architecture](docs/plan/ARCHITECTURE.md)** - Simplified Supabase design
- **[⚙️ Technology Decisions](docs/plan/DECISIONS.md)** - Supabase stack rationale
- **[🚀 Quick Start (Supabase)](docs/plan/QUICKSTART_SUPABASE.md)** - Get running in 2 hours
- **[🔐 Environment Setup](docs/plan/ENV_SETUP.md)** - Supabase configuration
- **[💰 Cost Analysis](docs/plan/COSTS.md)** - $0/month breakdown + scaling path

### 🛠️ Component Documentation
- **[Web App](web-app/README.md)** - React frontend + Supabase integration
- **[macOS App](mac-app/README.md)** - Swift worker with Whisper
- **[Shared Code](shared/README.md)** - Shared TypeScript types (optional for MVP)
- **[Scripts](scripts/README.md)** - Utility scripts

### 📝 General
- **[Contributing](CONTRIBUTING.md)** - Development workflow and guidelines
- **[License](LICENSE)** - MIT License

### 📖 Additional Resources
- [Supabase Documentation](https://supabase.com/docs) - Official Supabase docs
- [Whisper GitHub](https://github.com/openai/whisper) - OpenAI Whisper documentation
- [Podcast Index API](https://podcastindex-org.github.io/docs-api/) - Podcast API docs

## Repository Structure

```
transcribedd/
├── docs/                         # 📚 All documentation
│   ├── plan/                    # Planning & architecture docs
│   │   ├── PROJECT_PLAN.md      # 2-week Supabase MVP roadmap
│   │   ├── ARCHITECTURE.md      # Simplified system design
│   │   ├── DECISIONS.md         # Supabase stack rationale
│   │   ├── QUICKSTART_SUPABASE.md  # 2-hour setup guide
│   │   ├── ENV_SETUP.md         # Supabase configuration
│   │   └── COSTS.md             # $0/month breakdown
│   └── README.md                # Documentation index
├── web-app/                     # 🌐 React web application
│   ├── src/                     # React + TypeScript + Supabase
│   └── README.md
├── mac-app/                     # 🖥️  macOS worker app
│   ├── TranscribeddWorker/      # Swift + SwiftUI + Whisper
│   └── README.md
├── shared/                      # 🔗 Shared types (optional for MVP)
│   └── README.md
├── scripts/                     # 🛠️  Utility scripts
│   └── README.md
├── .gitignore
├── README.md                    # You are here
├── CONTRIBUTING.md              # Contribution guidelines
└── LICENSE                      # MIT License
```

**Note**: No `backend/` folder needed! Supabase handles all backend logic (database, API, auth, storage) as a managed service.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development workflow
- Code style guidelines
- Testing requirements
- Pull request process

### Quick Contribution Steps
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
