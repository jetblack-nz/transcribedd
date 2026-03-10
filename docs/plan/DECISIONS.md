# Technology & Architecture Decisions

## MVP Strategy: Ultra-Lean Cloud with Supabase

**Goal**: Build a working MVP in 2 weeks with $0 infrastructure cost.

**Approach**: Use Supabase (all-in-one backend) instead of Azure for MVP. Migrate to Azure later if needed.

---

## Final Decisions Made ✅

### 1. Backend Platform

**Decision**: **Supabase** (not Azure, not custom backend)

**Why**:
- ✅ Free tier perfect for 2-50 users
- ✅ Database + Storage + Auth + Realtime in one service
- ✅ No backend code to write
- ✅ 10 minute setup vs 2 hours for Azure
- ✅ Row Level Security built-in
- ✅ Realtime subscriptions (no polling!)

**Migration path**: When you outgrow free tier, move to Azure using original architecture docs.

### 2. Frontend Framework

**Decision**: **React + TypeScript** (or Next.js)

**Why**:
- ✅ Popular, well-documented
- ✅ Great Supabase client library
- ✅ Easy to deploy (Vercel/Netlify free tier)
- ✅ Rich ecosystem
- ✅ TypeScript for type safety

### 3. Frontend Hosting

**Decision**: **Vercel** or **Netlify** (free tier)

**Why**:
- ✅ Free for personal projects
- ✅ Automatic deployments from Git
- ✅ Global CDN included
- ✅ Serverless functions if needed
- ✅ Zero configuration

### 4. macOS App Framework

**Decision**: **Native Swift + SwiftUI**

**Why**:
- ✅ Native performance and feel
- ✅ Better battery life
- ✅ Smaller app size (~10-20MB vs ~150MB Electron)
- ✅ System tray/notifications work perfectly
- ✅ M1/M2/M3 optimizations
- ❌ macOS only (but that's your target anyway)

###  5. Whisper Implementation

**Decision**: **Python OpenAI Whisper** for MVP  
**Future**: Migrate to **whisper.cpp** for 2-4x speed improvement

**Why**:
- ✅ Official implementation, reliable
- ✅ Easy to install: `pip install openai-whisper`
- ✅ Good documentation
- ✅ Works on all Macs (Intel + Apple Silicon)
- ⏰ Can upgrade to whisper.cpp later for performance

**Default model**: `small` (good balance of speed/accuracy)

### 6. Authentication

**Decision**: **Supabase Auth** (built-in)

**Why**:
- ✅ Email authentication out of the box
- ✅ JWT tokens handled automatically
- ✅ Session management included
- ✅ Magic links, social auth available
- ✅ No custom code needed

**macOS app auth**: One-time worker token, hash stored in profile

### 7. Database

**Decision**: **Supabase PostgreSQL** (built-in)

**Why**:
- ✅ Included with Supabase
- ✅ Familiar SQL
- ✅ Row Level Security
- ✅ Realtime subscriptions
- ✅ 500MB free tier (plenty for MVP)

### 8. File Storage

**Decision**: **Supabase Storage** (built-in)

**Why**:
- ✅ Included with Supabase
- ✅ S3-compatible API
- ✅ 1GB free tier
- ✅ Access policies per user
- ✅ Public/private buckets

**Buckets**:
- `audio-files` (temporary, auto-delete after 24h)
- `transcripts` (private; access via signed URLs)

### 9. Job Queue/Realtime Updates

**Decision**: **Supabase Realtime** (WebSocket subscriptions)

**Why**:
- ✅ No polling needed!
- ✅ Instant updates to UI and macOS app
- ✅ Built into Supabase
- ✅ 2M messages/month free
- ❌ No dedicated queue, but database IS the queue

**How it works**:
- macOS app subscribes to `jobs` table changes
- When new job added → instant notification
- When job completes → instant UI update

### 10. Podcast API

**Decision**: **Podcast Index API**

**Why**:
- ✅ Completely free
- ✅ Comprehensive podcast database
- ✅ Good documentation
- ✅ Active community
- ✅ No rate limits for reasonable use

**Signup**: https://api.podcastindex.org/

### 11. Deployment Strategy

**Decisions**:
- **Web app**: Push to Git → Auto-deploy to Vercel/Netlify
- **macOS app**: Direct distribution for MVP (send .app to users)

**Why**:
- ✅ Simplest possible for MVP
- ✅ Zero CI/CD configuration
- ✅ Free
- ⏰ Add proper code signing/notarization later

### 12. Security Baseline (MVP)

**Decisions**:
- **Transcript storage is private** (no public bucket URLs)
- **Downloads use short-lived signed URLs** (5-15 minutes)
- **Worker credentials are hashed at rest** (show raw token only once)
- **Podcast Index secret stays server-side** (Supabase Edge Function)
- **Atomic job claim** via SQL function to avoid double-processing

**Why**:
- ✅ Prevents transcript data leakage
- ✅ Avoids browser exposure of API secrets
- ✅ Reduces blast radius if DB is leaked
- ✅ Prevents race conditions with multiple workers

---

## Technology Stack Summary

| Component | Choice | Cost |
|-----------|--------|------|
| **Backend** | Supabase | $0/month (free tier) |
| **Frontend** | React + TypeScript | Free (open source) |
| **Hosting** | Vercel/Netlify | $0/month (free tier) |
| **Database** | Supabase PostgreSQL | $0/month (included) |
| **Storage** | Supabase Storage | $0/month (included) |
| **Auth** | Supabase Auth | $0/month (included) |
| **Realtime** | Supabase Realtime | $0/month (included) |
| **macOS App** | Swift + SwiftUI | Free (Xcode) |
| **Whisper** | Python openai-whisper | $0 (runs locally) |
| **Podcast API** | Podcast Index | $0/month (free) |
| **TOTAL** | | **$0/month** ✨ |

---

## What We're NOT Using (For MVP)

❌ **Azure** - Too complex and costly for MVP  
❌ **Custom Backend** - Supabase handles it  
❌ **Express/FastAPI** - Not needed  
❌ **Queue System** - Database + Realtime is enough  
❌ **Redis** - Over-engineering  
❌ **Docker/Kubernetes** - Way overkill  
❌ **Complex CI/CD** - Git push = deploy  

---

## Comparison: Original Plan vs MVP Plan

| Aspect | Original (Azure) | New Plan (Supabase) |
|--------|------------------|----------------------|
| **Backend Code** | ~1000 lines | ~50 lines |
| **Services to Manage** | 7+ (App Service, DB, Storage, Queue, etc.) | 1 (Supabase) |
| **Setup Time** | 2-4 hours | 10 minutes |
| **Monthly Cost** | $15-60 | $0 |
| **Dev Time** | 4 weeks | 2 weeks |
| **Complexity** | High | Low |
| **Good for** | 100+ paying users | 2-50 users MVP |
| **Scalability** | Excellent | Good (migrate later) |

---

## Migration Path (Future)

When you outgrow Supabase free tier (probably 6-12+ months):

**Option A**: Upgrade to Supabase Pro ($25/month)
- Handles 100-500 users easily
- Still way cheaper than Azure

**Option B**: Migrate to Azure
- Use original architecture docs (already created!)
- Database schema is the same (PostgreSQL)
- Swap Supabase client for Azure SDKs
- Add custom backend (Node.js/Express)
- Most React code stays the same

**Don't migrate until you have to.** Supabase free tier is generous.

---

## Decision Log

| Decision | Date | Decided By |
|----------|------|------------|
| Use Supabase for MVP | 2026-03-10 | Stefan |
| Swift + SwiftUI for macOS | 2026-03-10 | Stefan |
| React for frontend | 2026-03-10 | Stefan |
| Python Whisper (small model) | 2026-03-10 | Stefan  |
| Podcast Index API | 2026-03-10 | Stefan |
| Deploy to Vercel/Netlify | 2026-03-10 | Stefan |

---

## Questions Resolved ✅

- ✅ **Backend**: Supabase (no custom backend for MVP)
- ✅ **Database**: Supabase PostgreSQL (included)
- ✅ **Authentication**: Supabase Auth (included)
- ✅ **Storage**: Supabase Storage (included)
- ✅ **Queue**: Realtime subscriptions (no traditional queue)
- ✅ **macOS App**: Swift + SwiftUI
- ✅ **Whisper**: Python openai-whisper, small model default
- ✅ **Podcast API**: Podcast Index (free)
- ✅ **Deployment**: Vercel/Netlify (free)
- ✅ **Cost**: $0/month for 2-50 users

**Result**: MVP-ready stack that scales when needed. 🚀
