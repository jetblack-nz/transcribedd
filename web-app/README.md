# Web Application

This folder contains the full-stack web application for podcast discovery and transcript management.

## Structure

```
web-app/
├── frontend/          # React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   ├── public/
│   └── package.json
│
└── backend/           # Node.js + Express API server
    ├── src/
    │   ├── routes/
    │   ├── controllers/
    │   ├── services/
    │   ├── models/
    │   ├── middleware/
    │   └── utils/
    ├── tests/
    └── package.json
```

## Frontend

**Tech Stack:**
- React 18+ with TypeScript
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls
- React Query for data fetching
- Zustand or Context API for state management

**Key Features:**
- Podcast search and discovery
- User authentication
- Job management dashboard
- Transcript viewer
- Download interface

## Backend

**Tech Stack (MVP):**
- [Supabase](https://supabase.com) for database, auth, storage, and realtime
- Supabase Edge Functions for server-side logic (Podcast Index signing, signed URL generation)
- No custom backend server needed for MVP

**Key Features:**
- User authentication via Supabase Auth
- Job management via Supabase PostgREST
- Realtime job status via Supabase Realtime (WebSocket)
- Transcript storage via Supabase Storage (private buckets + signed URLs)
- Podcast search via Supabase Edge Function proxy

## Getting Started

_Setup instructions will be added once development begins._

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account (free at [supabase.com](https://supabase.com))
- See [docs/plan/QUICKSTART_SUPABASE.md](../docs/plan/QUICKSTART_SUPABASE.md) for full setup

### Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

## API Endpoints

See [docs/api/](../docs/api/) for full API documentation (coming soon).

Quick reference:
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/podcasts/search` - Search podcasts
- `POST /api/jobs` - Create transcription job
- `GET /api/jobs` - List user's jobs
- `GET /api/jobs/:id/transcript` - Download transcript

## Environment Variables

See [docs/plan/ENV_SETUP.md](../docs/plan/ENV_SETUP.md) for complete configuration guide.

## Deployment

The web app will be deployed to Azure App Service. Deployment instructions coming soon.

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```
