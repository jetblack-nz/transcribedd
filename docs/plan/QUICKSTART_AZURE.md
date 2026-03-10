# Quick Start Checklist — Azure Migration

> **⚠️ This is the Azure migration guide, not the current MVP setup.**
> The active MVP uses Supabase ($0/month). For current development, see [QUICKSTART_SUPABASE.md](QUICKSTART_SUPABASE.md).
> Use this guide when you are ready to migrate beyond Supabase's free tier.

## Prerequisites Setup

### 1. Azure Account
- [ ] Create Azure account (https://azure.microsoft.com/free/)
- [ ] Set up subscription
- [ ] Install Azure CLI: `brew install azure-cli`
- [ ] Login: `az login`
- [ ] Create resource group: `az group create --name transcribedd-rg --location eastus`

### 2. Development Tools
- [ ] Install Node.js 18+ (`brew install node`)
- [ ] Install Python 3.8+ (`brew install python`)
- [ ] Install Xcode from App Store
- [ ] Install Xcode Command Line Tools: `xcode-select --install`
- [ ] Install Git (`brew install git`)
- [ ] Install VS Code or your preferred editor

### 3. Azure Resources (After deciding stack)
- [ ] Run provisioning script:
  - `./scripts/setup/setup-azure.sh --database postgres` (matches DECISIONS.md)
  - `./scripts/setup/setup-azure.sh --database cosmos` (free-tier-friendly alternative)
- [ ] Verify resources from `scripts/setup/.azure-output.env`
  - App Service Plan (F1)
  - Linux Web App
  - Storage Account with `audio-files` + `transcripts`
  - Azure Queue Storage queue: `transcription-jobs`
  - Database endpoint/connection values
- [ ] Configure JWT auth (RS256) and refresh token flow
- [ ] Set up Azure Key Vault for production secrets

## Project Setup

### 4. Repository Structure
- [ ] Review DECISIONS.md (choices are finalized)
- [ ] Create initial folder structure
- [ ] Set up .gitignore
- [ ] Initialize package.json files
- [ ] Set up .env.example files

### 5. Configuration
- [ ] Create .env files (DON'T commit these!)
- [ ] Store Azure connection strings
- [ ] Store API keys
- [ ] Configure CORS settings

## Development Phase 1

### 6. Web App Backend
- [ ] Set up Node.js + Express + TypeScript project
- [ ] Create database schema/models
- [ ] Implement user authentication (RS256 JWT)
- [ ] Create job management endpoints:
  - POST /api/jobs (create transcription job)
  - GET /api/jobs (list user's jobs)
  - GET /api/jobs/:id (get job details)
  - GET /api/jobs/:id/transcript (download transcript)
- [ ] Integrate podcast search API
- [ ] Implement blob storage upload/download
- [ ] Set up job queue publishing
- [ ] Add API key hashing + rotate/revoke support
- [ ] Add retention jobs (audio 24h, transcripts 180d)

### 7. Web App Frontend
- [ ] Create React + TypeScript project
- [ ] Set up Tailwind CSS
- [ ] Implement authentication UI
- [ ] Create podcast search interface
- [ ] Create episode list/details view
- [ ] Create transcription job dashboard
- [ ] Add transcript viewer/download

### 8. Deploy to Azure
- [ ] Build production bundles
- [ ] Deploy backend to App Service
- [ ] Deploy frontend (Static Web Apps or App Service)
- [ ] Test in production environment
- [ ] Set up custom domain (optional)

## Development Phase 2

### 9. macOS App
- [ ] Create Xcode project (Swift + SwiftUI)
- [ ] Design system tray UI
- [ ] Implement job polling from API
- [ ] Build audio file downloader
- [ ] Install Whisper:
  - Python: `pip install openai-whisper` (MVP)
  - Later optimization: build whisper.cpp
- [ ] Integrate Whisper transcription
- [ ] Implement progress tracking
- [ ] Add transcript upload functionality
- [ ] Implement API key authentication
- [ ] Add local preferences storage

### 10. Testing & Polish
- [ ] Test complete end-to-end flow
- [ ] Add error handling
- [ ] Implement retry logic
- [ ] Add logging and monitoring
- [ ] Create user documentation
- [ ] Test on different Mac models

### 11. Distribution
- [ ] Code sign macOS app
- [ ] Notarize with Apple
- [ ] Create installer/DMG
- [ ] Set up distribution method
- [ ] Add auto-update mechanism

## Immediate Next Steps (This Week)

**Priority 1:**
1. Review PROJECT_PLAN.md
2. Confirm finalized decisions and security defaults in DECISIONS.md
3. Set up Azure account and run `scripts/setup/setup-azure.sh`
4. Create initial project structure

**Priority 2:**
5. Set up web app backend skeleton
6. Test Azure connections (database, storage, queue)
7. Create simple API health check endpoint
8. Deploy hello-world to Azure

**Priority 3:**
9. Start podcast search integration
10. Begin React frontend setup
11. Test podcast discovery flow

## Estimated Timeline

- **Week 1**: Azure setup + Backend skeleton + Podcast discovery
- **Week 2**: Frontend + Job management + First deployment
- **Week 3**: macOS app + Whisper integration
- **Week 4**: Integration + Testing + Polish

## Useful Commands

```bash
# Azure CLI
az login
az account list
az group create --name transcribedd-rg --location eastus
az webapp up --name transcribedd-api --runtime "NODE:18-lts"

# Node.js setup
npm init -y
npm install express cors dotenv @azure/storage-blob @azure/storage-queue
npm install -D typescript @types/node @types/express nodemon

# Python setup (for local Whisper on macOS worker)
python3 -m venv venv
source venv/bin/activate
pip install openai-whisper

# Git
git add .
git commit -m "Initial project setup"
git push
```

## Cost Tracking

Keep an eye on Azure costs:
```bash
az consumption usage list --start-date 2026-03-01 --end-date 2026-03-31
```

Set up cost alerts in Azure Portal!

## Questions?

Refer to:
- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Full architecture and plan
- [DECISIONS.md](DECISIONS.md) - Technology choices
- [README.md](README.md) - Project overview
