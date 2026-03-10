# Cost Estimates & Budget Planning (Supabase MVP)

## TL;DR
- MVP target cost: `$0/month`
- This is realistic only while usage stays inside free-tier limits
- Add guardrails and alerts on day one to avoid surprise upgrades

## Free Tier Envelope

| Resource | Free Tier Limit | Typical MVP Usage (2-50 users) |
|----------|------------------|----------------------------------|
| Database | 500 MB | ~10-50 MB |
| Storage | 1 GB | ~50-500 MB |
| Bandwidth | 2 GB/month | ~500 MB-1.5 GB/month |
| Realtime Messages | 2 million/month | ~10K-100K/month |
| Auth Users | Unlimited | 2-50 |

Assumption: audio is temporary (24h retention), transcript files are compressed and lifecycle-managed.

## Cost Breakdown (MVP)

| Component | Cost |
|-----------|------|
| Supabase (free tier) | $0 |
| Vercel/Netlify (free tier) | $0 |
| Podcast Index API | $0 |
| Whisper (local on user Mac) | $0 |
| Domain (optional) | ~$12/year |
| Apple Developer account (optional for notarized distribution) | $99/year |

Expected monthly total during MVP: `$0` to very low optional spend.

## Per-Transcription Cost (Practical View)
Within free-tier limits, incremental cloud cost is effectively `$0`.
If free-tier limits are exceeded, incremental cost becomes plan-dependent (typically Supabase Pro first).

## Upgrade Triggers
Move from free tier when any threshold is sustained:
- Database > 70% quota
- Storage > 70% quota
- Bandwidth > 70% quota
- Realtime messages > 70% quota
- Need for stronger SLA/support

Likely first upgrade: Supabase Pro (`$25/month`).

## Scaling Projection

| Phase | Users | Monthly Cost Expectation |
|-------|-------|--------------------------|
| MVP (0-6 months) | 2-50 | $0 (inside limits) |
| Early growth | 50-200 | ~$25-45 |
| Higher growth | 200+ | plan-dependent; evaluate Supabase Pro vs migration |

## Free-Tier Guardrails
Configure these immediately:
- Usage alerts at 70% for DB, storage, bandwidth, realtime
- Weekly dashboard review
- Audio retention fixed at 24h
- Transcript retention policy (default 180d)
- Max episode duration and file-size limits for free tier

If thresholds are crossed:
1. Tighten retention and size limits.
2. Reduce free-tier quotas temporarily.
3. Upgrade to Supabase Pro.

## Monetization Options (Post-MVP)
- Freemium: free plan with caps (for example, 5 jobs/month, 90-minute max)
- Subscription: monthly plan for higher limits
- One-time app purchase + optional premium features

## Comparison vs API-Only Transcription
Commercial transcription APIs charge per audio hour; this architecture keeps transcription local, so cloud spend is dominated by app infrastructure, not model inference costs.

## Bottom Line
A free-cloud MVP is feasible and low risk if you enforce guardrails. Treat `$0/month` as an operational target, not a guarantee, and monitor usage from day one.
