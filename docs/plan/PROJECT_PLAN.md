# Transcribedd - Podcast Discovery & Transcription System

## Project Overview
A **lean, cloud-enabled MVP** podcast transcription system consisting of:
1. **Web App (Supabase)** - Podcast discovery, job management, and transcript delivery
2. **macOS Desktop App** - Local transcription worker using Whisper AI

**MVP Strategy**: Start ultra-lean with $0 infrastructure costs, scale to Azure later if needed.

## System Architecture

### High-Level Flow
```
User → Web App (Discover Podcast) → Create Transcription Job in Supabase
                ↓
        Supabase Realtime (Database)
                ↓
macOS App (Realtime Subscription) → Download Audio → Whisper Transcription
                ↓
        Upload Transcript → Supabase Storage
                ↓
        User Downloads from Web App
```

## Technology Stack

### Web Application (Ultra-Lean)
- **Frontend**: 
  - React + TypeScript (or Next.js)
  - Tailwind CSS for styling
  - Podcast search/discovery UI
  - Transcription status dashboard
  
- **Backend**: 
  - **Supabase** (all-in-one backend)
    - PostgreSQL database (built-in)
    - File storage (built-in)
    - Realtime subscriptions (no polling needed!)
    - Authentication (built-in)
    - Row Level Security for data protection
  - No custom backend code needed initially
  
- **Hosting**: 
  - Vercel/Netlify free tier (static site + serverless functions)
  - OR Supabase Edge Functions (free tier included)

### macOS Desktop Application
- **Framework**: 
  - Swift + SwiftUI (native macOS app)
  
- **Core Features**:
  - Realtime job subscription (Supabase Realtime)
  - Audio file downloader
  - Whisper integration (Python Whisper for MVP; whisper.cpp later)
  - Progress tracking and notifications
  - Auto-upload completed transcriptions to Supabase Storage

### Third-Party Services
- **Podcast APIs**:
  - Podcast Index API (free, comprehensive) - PRIMARY
  - iTunes Search API (Apple) - BACKUP
  
- **Whisper**:
  - OpenAI Whisper (Python package) for MVP
  - whisper.cpp (C++ implementation) - migration path for performance

## Database Schema (Supabase PostgreSQL)

### Jobs Table
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  podcast_title TEXT NOT NULL,
  episode_title TEXT NOT NULL,
  episode_url TEXT NOT NULL,
  audio_file_url TEXT,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  transcript_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  worker_id TEXT,
  error_message TEXT
);

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

-- Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### Profiles Table (extends Supabase auth.users)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  -- Store only a hash of worker token material (never plaintext)
  worker_token_hash TEXT,
  worker_token_created_at TIMESTAMPTZ,
  worker_token_last_used_at TIMESTAMPTZ,
  worker_token_revoked_at TIMESTAMPTZ,
  subscription TEXT DEFAULT 'free',
  jobs_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automatically create profile on signup
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (
    NEW.id,
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Podcasts Cache (Optional - for faster search)
```sql
CREATE TABLE podcasts_cache (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  feed_url TEXT,
  artwork_url TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

## Implementation Phases

### Phase 1: Supabase Setup & Web App Foundation (Week 1)
**Goal**: Basic web app with podcast discovery and Supabase backend

**Day 1-2: Supabase Setup**
- [ ] Create free Supabase project at https://supabase.com
- [ ] Set up database tables (jobs, profiles)
- [ ] Configure Row Level Security policies
- [ ] Enable Realtime for jobs table
- [ ] Create storage buckets:
  - `audio-files` (temporary audio storage)
  - `transcripts` (private completed transcriptions)
- [ ] Configure storage policies (user-specific access)
- [ ] Enable email authentication

**Day 3-5: React Frontend**
- [ ] Set up React + TypeScript project (or Next.js)
- [ ] Install Supabase client: `npm install @supabase/supabase-js`
- [ ] Implement Supabase authentication UI
  - Sign up / sign in
  - Session management
- [ ] Integrate Podcast Index API via Supabase Edge Function (secret stays server-side)
  - Search interface
  - Episode browser
- [ ] Build job creation:
  - Select episode → create job in Supabase
  - Realtime job status updates
- [ ] Create job dashboard:
  - List user's jobs
  - Show real-time status updates
  - Download transcript button

**Day 6-7: Deployment**
- [ ] Deploy to Vercel/Netlify (free tier)
- [ ] Set up environment variables
- [ ] Test end-to-end flow
- [ ] Create user guide

**Deliverables**:
- Working web app (free hosting)
- Users can sign up/login
- Users can search podcasts
- Users can create transcription jobs
- Real-time job status updates
- **Cost: $0/month**

### Phase 2: macOS Worker App (Week 2)
**Goal**: Desktop app that processes transcription jobs

**Day 1-3: Swift Project Setup**
- [ ] Create Xcode Swift/SwiftUI project
- [ ] Install Dependencies:
  - Supabase Swift client (or use REST API)
  - Python 3.8+ (for Whisper)
  - Whisper: `pip install openai-whisper`
- [ ] Create system tray/menu bar app
- [ ] Add preferences window:
  - Supabase URL
  - Worker's one-time token (stored in Keychain)
  - Whisper model selection
  - Auto-start on login

**Day 4-6: Core Functionality**
- [ ] Implement Supabase Realtime subscription
  - Subscribe to new 'pending' jobs
  - Atomically claim job via SQL RPC (`claim_next_job`)
- [ ] Build audio downloader:
  - Download from episode URL
  - Save to temp directory
  - Show progress in UI
- [ ] Integrate Whisper transcription:
  - Run: `whisper audio.mp3 --model small --output_format all`
  - Parse outputs: .txt, .srt, .vtt, .json
  - Show progress and notifications
- [ ] Implement transcript upload:
  - Upload files to Supabase Storage
  - Update job record with transcript paths
  - Mark job as 'completed'
- [ ] Add error handling and retry logic

**Day 7: Polish & Testing**
- [ ] Add notifications for completed jobs
- [ ] Implement cleanup (delete local files)
- [ ] Test full workflow
- [ ] Create macOS app icon
- [ ] Write macOS app documentation

**Deliverables**:
- macOS app that:
  - Subscribes to jobs in realtime (no polling!)
  - Downloads audio files
  - Transcribes using Whisper
  - Uploads results to Supabase
  - Shows progress/status
- **Cost: $0/month**

---

## 🎉 MVP Complete in 2 Weeks!

At this point, you have a **fully functional, free podcast transcription system**:
- ✅ Web app for discovering podcasts and managing jobs
- ✅ macOS app for local transcription
- ✅ Real-time updates (no polling!)
- ✅ Secure storage and authentication
- ✅ **Total cost: $0/month**

---

## Future Enhancements (Post-MVP)

### Quick Wins (Days, not weeks)
- [ ] Transcript viewer in web app (rich text display)
- [ ] Download options for different formats (TXT, SRT, VTT, JSON)
- [ ] Better error messages and retry logic
- [ ] Job history and search filters
- [ ] Usage statistics dashboard
- [ ] Email notifications on job completion

### Advanced Features (When you have users asking for them)
- [ ] Speaker diarization (who said what)
- [ ] Multiple language support and auto-translation
- [ ] Searchable transcript text (full-text search)
- [ ] Podcast subscription/RSS support
- [ ] Multi-worker support (multiple Macs)
- [ ] Optimize with whisper.cpp for 2-4x speed
- [ ] Mobile app (iOS) for viewing transcripts
- [ ] API for third-party integrations

### Scaling Path (When you outgrow Supabase free tier)
- [ ] Migrate to Azure/AWS (use existing architecture docs)
- [ ] Add CDN for faster downloads
- [ ] Implement caching layer
- [ ] Add queue system for priority processing
- [ ] Set up monitoring and analytics

**Migration trigger**: When you hit Supabase free tier limits:
- 500MB database storage
- 1GB file storage 
- 2GB bandwidth per month
- 2 million realtime messages per month

For 2-50 users, you'll stay under these limits for months/years.

## Development Setup

### Prerequisites
- **Node.js 18+** and npm (for web app)
- **Python 3.8+** (for Whisper)
- **Xcode** (for macOS app) - Free from Mac App Store
- **Git** (for version control)
- **Supabase account** - Free at https://supabase.com

### Quick Start (5 minutes)

**1. Create Supabase Project**
```bash
# Go to https://supabase.com
# Click "New Project"
# Note your project URL and anon key
```

**2. Clone and Setup**
```bash
# Clone repository
git clone https://github.com/jetblack-nz/transcribedd.git
cd transcribedd

# Setup web app
cd web-app/frontend
npm install

# Create .env.local
echo "VITE_SUPABASE_URL=your-project-url" > .env.local
echo "VITE_SUPABASE_ANON_KEY=your-anon-key" >> .env.local
echo "VITE_PODCAST_SEARCH_FUNCTION_URL=your-edge-function-url" >> .env.local

# Run development server
npm run dev
# Opens at http://localhost:5173
```

**3. Setup Database**
- Go to Supabase Dashboard → SQL Editor
- Copy SQL from `docs/plan/PROJECT_PLAN.md` (database schema section)
- Run the SQL to create tables
- Enable Realtime on jobs table

**4. macOS App**
```bash
cd ../../mac-app
# Open in Xcode or create new project
# Install Whisper: pip install openai-whisper
# Build and run
```

That's it! No complex Azure setup, no configuration hell.

## Project Structure
```
transcribedd/
├── web-app/                 # Web application
│   ├── frontend/           # React/Next.js + Supabase
│   │   ├── src/
│   │   │   ├── components/ # UI components
│   │   │   ├── pages/      # Pages/routes
│   │   │   ├── lib/        # Supabase client, utilities
│   │   │   └── types/      # TypeScript types
│   │   ├── public/
│   │   └── package.json
│   └── README.md
├── mac-app/                # macOS desktop application
│   ├── TranscribeddWorker/ # Swift/SwiftUI project
│   │   ├── Models/         # Data models
│   │   ├── Services/       # Supabase, Whisper, Download
│   │   ├── Views/          # SwiftUI views
│   │   └── Utils/          # Helpers
│   └── README.md
├── shared/                 # Shared types (optional for MVP)
│   └── types.ts
├── scripts/                # Utility scripts
│   └── supabase-setup.sql # Database initialization
├── docs/                   # Documentation
│   └── plan/               # Planning docs
└── README.md               # Project overview
```

**Note**: No backend folder needed! Supabase handles all backend logic.

## Cost Breakdown: Supabase Free Tier

### Month 1-∞ (MVP)

| Service | Free Tier | Your Usage (2-50 users) | Cost |
|---------|-----------|-------------------------|------|
| **Supabase Database** | 500MB | ~10-50MB | $0 |
| **Supabase Storage** | 1GB | ~50-500MB | $0 |
| **Supabase Bandwidth** | 2GB | ~500MB-1.5GB | $0 |
| **Supabase Realtime** | 2M messages/month | ~10K-100K | $0 |
| **Vercel/Netlify Hosting** | 100GB bandwidth | ~1-10GB | $0 |
| **Podcast Index API** | Unlimited | N/A | $0 |
| **Whisper (local)** | N/A | Runs on user's Mac | $0 |
| **TOTAL** | | | **$0/month** |

### When You'll Need to Upgrade

Supabase will stay free until you hit:
- **500MB database** (~10,000+ jobs stored)
- **1GB storage** (~20+ hours of audio cached + 5,000+ transcripts)
- **2GB bandwidth** (~50,000+ podcast downloads/month)

**For 2-50 users**: You'll stay on free tier for 6-12+ months.

**When you grow**: Supabase Pro is $25/month (still way cheaper than Azure).

### Cost Per Transcription

| Component | Cost |
|-----------|------|
| Database write (1 job record) | $0 |
| Storage (1 transcript ~500KB) | $0 |
| Bandwidth (download transcript) | $0 |
| Realtime messages (status updates) | $0 |
| **Total per transcription** | **$0** |

**vs Commercial APIs**:
- AssemblyAI: $0.37/hour
- AWS Transcribe: $1.44/hour  
- Azure Speech: $1.00/hour
- **Your solution**: $0/hour ✨

### Scaling Path

When you outgrow Supabase free tier:

1. **Supabase Pro** ($25/month) - Handles 100-500 users
2. **Azure Migration** (~$100/month) - Use original architecture docs
3. **Custom Infrastructure** ($500+/month) - When you need it

But that's a good problem to have! 🚀

## Security Considerations

### Supabase Built-in Security
- ✅ **Row Level Security (RLS)** - Database-level access control
- ✅ **JWT tokens** - Secure authentication (handled by Supabase)
- ✅ **HTTPS everywhere** - All Supabase endpoints are HTTPS
- ✅ **Storage policies** - File-level access control
- ✅ **Signed URLs** - Time-limited download access for private files

### Custom Security Measures
- [ ] macOS app: Store worker token in macOS Keychain
- [ ] Worker token lifecycle: generate once, store hash only, rotate/revoke support
- [ ] Use private storage bucket for transcripts (no public URLs)
- [ ] Use signed URLs with 5-15 minute TTL for transcript downloads
- [ ] Keep Podcast Index secret in Supabase Edge Function only (never Vite client env)
- [ ] Input validation on all forms (XSS, SQL injection prevention)
- [ ] Rate limiting on job creation (max 5 jobs per hour per user - MVP)
- [ ] File size limits (max 200MB audio files)
- [ ] URL validation for podcast downloads
- [ ] Atomic job claiming to prevent duplicate worker processing

### Data Privacy
- Audio files: Auto-delete after 24 hours (storage policy)
- Transcripts: User can delete anytime
- User data: GDPR-compliant (Supabase is)
- No audio stored in permanent storage

**Note**: Supabase handles most security for you - no need to build JWT logic, manage sessions, etc.

## Testing Strategy

### MVP (Keep it simple)
- **Manual Testing**: Test complete workflow end-to-end
- **Browser Testing**: Test on Safari, Chrome, Firefox
- **macOS Testing**: Test on M1/M2/M3 and Intel Macs

### Post-MVP (Add as you grow)
- **Unit Tests**: Vitest for frontend utilities
- **Integration Tests**: Test Supabase client interactions
- **E2E Tests**: Playwright for critical user flows
- **Mac App Tests**: XCTest for Swift components

**For MVP**: Manual testing is fine. Don't over-engineer.

## Deployment Strategy

### Web App (Insanely Simple)
1. **Push to GitHub**
2. **Connect Vercel/Netlify** (literally 3 clicks)
3. **Add environment variables** (Supabase URL + key)
4. **Deploy** (automatic on git push)

**That's it**. No Azure setup, no complex CI/CD, no infrastructure as code.

### macOS App
- **MVP**: Direct distribution (send to your 2-50 users)
- **Post-MVP**: 
  - Code signing with Apple Developer account ($99/year)
  - Notarization for macOS Gatekeeper
  - Distribution via website download or GitHub Releases
  - Auto-update with Sparkle framework (optional)

**For 2 users**: Just send them the .app file. Don't overcomplicate.

## Success Metrics (MVP)

Keep it simple. Track what matters:

- ✅ **Does it work?** - Can users transcribe podcasts end-to-end?
- ✅ **Is it fast enough?** - Transcription completes in reasonable time
- ✅ **Are users happy?** - Ask your 2-50 users for feedback
- ✅ **Zero cost?** - Staying under Supabase free tier

**Don't measure** (for MVP):
- Uptime percentages
- Complex analytics
- NPS scores
- Cost per transcription (it's $0)

Add metrics when you have 100+ users and need data to make decisions.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Whisper too slow** | High | Start with 'small' model, upgrade to whisper.cpp later |
| **Supabase free tier exceeded** | Low | Monitor dashboard, upgrade to Pro ($25/mo) if needed |
| **Podcast URLs broken/403** | Medium | Validate URLs, show clear error messages, retry logic |
| **macOS app distribution issues** | Medium | For MVP: direct share. Later: proper code signing |
| **Transcription quality poor** | High | Let users choose model size, test on various podcasts |
| **User Mac is old/slow** | Medium | Document requirements (macOS 12+, 8GB+ RAM) |

**Biggest risk**: Over-engineering for 2 users. **Mitigation**: Stay lean, build only what's needed.

## Next Steps (Start Today!)

### Day 1: Setup (2 hours)
1. ✅ Create Supabase account (5 min)
2. ✅ Create new Supabase project (2 min)
3. ✅ Run SQL schema (5 min)
4. ✅ Get Podcast Index API key (10 min) - https://api.podcastindex.org
5. ✅ Clone repo and setup frontend (30 min)
6. ✅ Test connection to Supabase (15 min)
7. ✅ Deploy to Vercel (10 min)

### Week 1: Web App
Follow Phase 1 checklist above (7 days)

### Week 2: macOS App
Follow Phase 2 checklist above (7 days)

### Day 15: Launch!
Invite your first users and get feedback.

**That's it. You're live in 2 weeks with $0 infrastructure costs.**

## Key Decisions Made

- ✅ **Platform**: Supabase (not Azure) - Free, simpler, faster to build
- ✅ **Frontend**: React + TypeScript
- ✅ **macOS App**: Native Swift + SwiftUI
- ✅ **Whisper**: Python openai-whisper for MVP (small model default)
- ✅ **Podcast API**: Podcast Index API (free)
- ✅ **Deployment**: Vercel/Netlify (free tier)
- ✅ **Timeline**: 2 weeks to MVP
- ✅ **Cost**: $0/month for 2-50 users

## Migration Path to Azure (Future)

If/when you outgrow Supabase:
1. Keep the original Azure architecture docs in `docs/plan/` (already created)
2. The database schema is the same (PostgreSQL)
3. Swap Supabase client for custom backend + Azure services
4. Most frontend code stays the same

**But don't do this until you need to.** Start lean, scale when you have users willing to pay.

---

## Summary: Why This Plan is Better for Your MVP

| Aspect | Original Azure Plan | New Supabase Plan |
|--------|---------------------|-------------------|
| **Cost** | $15-60/month | $0/month |
| **Setup Time** | 2 hours | 10 minutes |
| **Dev Time** | 4 weeks | 2 weeks |
| **Complexity** | High (7+ Azure services) | Low (1 service) |
| **Backend Code** | ~1000 lines | ~50 lines |
| **Good For** | 100+ users, production | 2-50 users, MVP |
| **Learning Curve** | Steep | Gentle |
| **Can Scale?** | Yes | Yes (migrate later) |

**Verdict**: Use Supabase for MVP. Migrate to Azure when you have 100+ paying users.

🚀 **Now go build it!**
