# Worker V2 — Deployment Guide

These files are the V2-compatible versions of the Hetzner worker scripts.
**Do NOT deploy to Hetzner until the V2 onboarding (VITE_ONBOARDING_V2=true) is validated.**

## What changed vs V1

| File | Change |
|------|--------|
| `queue-organizer.js` | `|| 6` fallback → `|| 5` (wave-1), `|| 30` → `|| 50` (total), `getOrCreateDailyReport` queries actual count dynamically |
| `generate-nightly-schedule-BRAND-AWARE.js` | `MAX_PROMPTS_PER_USER = 30` → `50` |
| `end-of-day-processor.js` | No code changes needed — it already uses dynamic counts |

## Why backward-compatible

The worker reads actual prompt counts from the DB. V1 brands (30 prompts) and V2 brands (50 prompts) are handled correctly by the same code — no version flag needed in the worker.

## Deployment steps

```bash
# 1. Backup current files on Hetzner
ssh -i ~/.ssh/hetzner_key root@135.181.203.202 "
  cp /root/be-visible.ai/worker/queue-organizer.js /root/be-visible.ai/worker/queue-organizer.js.v1-backup &&
  cp /root/be-visible.ai/worker/generate-nightly-schedule-BRAND-AWARE.js /root/be-visible.ai/worker/generate-nightly-schedule-BRAND-AWARE.js.v1-backup
"

# 2. SCP new files
scp -i ~/.ssh/hetzner_key worker-v2/queue-organizer.js root@135.181.203.202:/root/be-visible.ai/worker/queue-organizer.js
scp -i ~/.ssh/hetzner_key worker-v2/generate-nightly-schedule-BRAND-AWARE.js root@135.181.203.202:/root/be-visible.ai/worker/generate-nightly-schedule-BRAND-AWARE.js

# 3. Verify syntax
ssh -i ~/.ssh/hetzner_key root@135.181.203.202 "node --check /root/be-visible.ai/worker/queue-organizer.js && echo OK"
```

## Rollback (if something breaks)

```bash
ssh -i ~/.ssh/hetzner_key root@135.181.203.202 "
  cp /root/be-visible.ai/worker/queue-organizer.js.v1-backup /root/be-visible.ai/worker/queue-organizer.js &&
  cp /root/be-visible.ai/worker/generate-nightly-schedule-BRAND-AWARE.js.v1-backup /root/be-visible.ai/worker/generate-nightly-schedule-BRAND-AWARE.js
"
```
