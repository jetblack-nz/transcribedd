# Quick Start Guide (Supabase MVP)

Get your podcast transcription system running in **2 hours** (not weeks).

---

## 🎯 Goal

By the end of this guide, you'll have:
- ✅ Web app deployed and accessible
- ✅ Podcast search working
- ✅ User authentication set up
- ✅ Database ready for jobs
- ✅ **Total cost: $0**

---

## ⚡ Super Quick Start (10 Minutes)

### Step 1: Create Supabase Project (2 min)

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Fill in:
   - Name: `transcribedd`
   - Database Password: (generate strong password, save it!)
   - Region: Choose closest to you
6. Click "Create new project"
7. Wait ~2 minutes for project to spin up

### Step 2: Get Your Credentials (1 min)

1. In Supabase Dashboard, go to **Settings** → **API**
2. Copy these:
   - `Project URL`: https://xxxxx.supabase.co
   - `anon public key`: eyJhbGc...long string
3. Save them for Step 4

### Step 3: Setup Database (3 min)

1. In Supabase Dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy this SQL:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Profiles table  
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  worker_token_hash TEXT,
  worker_token_created_at TIMESTAMPTZ,
  worker_token_last_used_at TIMESTAMPTZ,
  worker_token_revoked_at TIMESTAMPTZ,
  subscription TEXT DEFAULT 'free',
  jobs_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
```

4. Click "Run" (or press Cmd/Ctrl + Enter)
5. Should see "Success. No rows returned"

### Step 4: Create Storage Buckets (2 min)

1. In Supabase Dashboard, go to **Storage**
2. Click "New bucket"
3. Create bucket: `transcripts`
   - Name: `transcripts`
  - Public: ☐ No
   - Click "Create bucket"
4. Click "New bucket" again
5. Create bucket: `audio-files` (optional, for caching)
   - Name: `audio-files`
   - Public: ☐ No
   - Click "Create bucket"

### Step 5: Configure Storage Policies (2 min)

1. Click on `transcripts` bucket
2. Go to **Policies** tab
3. Click "New policy"
4. Template: "Allow authenticated users to upload"
5. Edit to:

```sql
-- Allow users to upload their own transcripts
CREATE POLICY "Users can upload own transcripts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'transcripts' AND (storage.foldername(name))[1] = auth.uid()::text);
```

6. Click "Save policy"

---

## 🌐 Deploy Web App (30 Minutes)

### Step 1: Get Podcast Index API Key (5 min)

1. Go to https://api.podcastindex.org/
2. Click "Get API Key"
3. Fill in form (it's free!)
4. Check email for credentials:
   - API Key
   - API Secret
5. Save these for Edge Function secrets (not frontend env)

### Step 2: Fork & Deploy (5 min)

**Option A: Deploy from GitHub (Recommended)**

1. Fork this repo on GitHub
2. Go to https://vercel.com
3. Sign in with GitHub
4. Click "Add New Project"
5. Import your forked repo
6. Configure:
   - Framework Preset: React (or auto-detect)
   - Root Directory: `web-app/frontend`
7. Add Environment Variables:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
    VITE_PODCAST_SEARCH_FUNCTION_URL=your-edge-function-url
   ```
8. Click "Deploy"
9. Wait ~2 minutes
10. Your app is live! 🎉

**Option B: Manual Setup (if you want to customize first)**

See "Development Setup" section below.

### Step 3: Test Your Web App (5 min)

1. Visit your Vercel URL (e.g., `transcribedd.vercel.app`)
2. Click "Sign Up"
3. Create account with email
4. Check email for confirmation link
5. Log in
6. Try searching for a podcast
7. Select an episode
8. Click "Transcribe" to create a job

### Step 4: Configure Edge Function Secrets (5 min)

Run in your project root:

```bash
supabase secrets set PODCAST_INDEX_KEY=your-podcast-index-key
supabase secrets set PODCAST_INDEX_SECRET=your-podcast-index-secret
```

Deploy your search proxy function (example):

```bash
supabase functions deploy podcast-search
```

For transcript downloads (private bucket), deploy a signed URL function:

```bash
supabase functions deploy get-transcript-url
```

---

## 🖥️ Setup macOS App (45 Minutes)

### Step 1: Install Prerequisites (10 min)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3
brew install python@3.11

# Install Whisper
pip3 install openai-whisper

# Test Whisper
whisper --help
# Should show help message
```

### Step 2: Create Xcode Project (15 min)

1. Open Xcode
2. File → New → Project
3. Choose "macOS" → "App"
4. Product Name: `TranscribeddWorker`
5. Interface: SwiftUI
6. Language: Swift
7. Click "Next" → "Create"

### Step 3: Add Dependencies (5 min)

1. File → Add Packages...
2. Search: `https://github.com/supabase-community/supabase-swift`
3. Add Package
4. Select: Supabase, Functions, PostgREST, Realtime, Storage

### Step 4: Basic Implementation (15 min)

See `mac-app/README.md` for detailed implementation guide.

**Minimum MVP code** (~100 lines):
- Initialize Supabase client
- Subscribe to jobs table realtime
- Download audio from URL
- Run Whisper command
- Upload transcript to Supabase Storage
- Update job status in database

---

## 🔧 Development Setup (Local)

If you want to develop locally before deploying:

### Frontend Setup

```bash
# Clone repo
git clone https://github.com/jetblack-nz/transcribedd.git
cd transcribedd/web-app/frontend

# Install dependencies
npm install

# Create .env.local
cat > .env.local << EOF
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PODCAST_SEARCH_FUNCTION_URL=your-edge-function-url
EOF

# Run dev server
npm run dev

# Opens at http://localhost:5173
```

### Test Authentication

1. Go to http://localhost:5173
2. Sign up with email
3. Check Supabase Dashboard → Authentication → Users
4. Should see your new user!

### Test Database

1. In app, create a job
2. Check Supabase Dashboard → Table Editor → jobs
3. Should see your job with status 'pending'!

---

## ✅ Verification Checklist

Before moving on, verify everything works:

**Supabase**:
- [ ] Project created and running
- [ ] Database tables created (jobs, profiles)
- [ ] Storage buckets created (transcripts, audio-files)
- [ ] Row Level Security enabled
- [ ] Realtime enabled on jobs table
- [ ] Transcripts bucket is private
- [ ] Podcast Index secret is stored in Edge Function env only

**Web App**:
- [ ] Deployed to Vercel/Netlify
- [ ] Can access URL
- [ ] Can sign up / sign in
- [ ] Can search podcasts
- [ ] Can create transcription job
- [ ] Job appears in Supabase database

**macOS App** (Next step):
- [ ] Xcode project created
- [ ] Supabase Swift SDK installed
- [ ] Whisper installed and working
- [ ] Can connect to Supabase
- [ ] Can subscribe to realtime updates

---

## 🐛 Troubleshooting

### "Failed to fetch" errors in web app

**Fix**: Check CORS settings in Supabase
1. Dashboard → Settings → API
2. Add your Vercel URL to allowed origins

### Can't sign up / "Invalid email"

**Fix**: Enable email auth
1. Dashboard → Authentication → Providers
2. Enable "Email"
3. Save

### Jobs table not updating in real-time

**Fix**: Enable Realtime
1. Dashboard → Database → Replication
2. Check that `jobs` table is in publication
3. Or run: `ALTER PUBLICATION supabase_realtime ADD TABLE jobs;`

### Whisper not found in macOS app

**Fix**: Ensure Python path is correct
```bash
which python3
which whisper

# If not found:
pip3 install --upgrade openai-whisper
```

---

## 🎉 Next Steps

You now have a working foundation! Next:

1. **Customize UI** - Make it your style
2. **Test end-to-end** - Create job → transcribe → download
3. **Add features** - Transcript viewer, better error handling
4. **Invite users** - Get feedback from your first 2-50 users
5. **Iterate** - Build what users actually want

---

## 📚 Additional Resources

- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Full implementation roadmap
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design details
- [ENV_SETUP.md](ENV_SETUP.md) - Environment variables reference
- [Supabase Docs](https://supabase.com/docs) - Official documentation
- [Whisper GitHub](https://github.com/openai/whisper) - Whisper documentation

---

## 💰 Cost Tracking

Monitor your Supabase usage:
1. Dashboard → Project → Usage
2. Watch:
   - Database size (500MB limit)
   - Storage (1GB limit)
   - Bandwidth (2GB/month limit)

**You'll get email warnings** before hitting limits.

---

## 🚀 Deploy Timeline

- **Hour 1**: Supabase setup + Web app deploy
- **Hour 2**: macOS app basics + test
- **Week 1**: Polish web UI, add features
- **Week 2**: Complete macOS app, test with users

**Total**: 2 weeks to production-ready MVP with $0 costs.

Now go build something awesome! 🎨