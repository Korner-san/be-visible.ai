# Worker V3

Isolated prototype for the next worker engine. Nothing in this folder is wired to production cron, Vercel, or the current `/worker` runtime.

## Current Safety Rule

All top-level scripts run in dry-run mode by default. They inspect Supabase and print the decision they would make, but they do not write rows, start Browserless sessions, kill processes, or edit crontab.

`--execute` currently fails on purpose. We will enable execution only after the dry-run plans match the intended architecture.

## Scripts

- `node onboarding-dispatcher.js` plans the next onboarding batch.
- `node daily-scheduler.js --date=YYYY-MM-DD` plans one UTC daily schedule.
- `node execute-onboarding-batch.js <schedule_id>` inspects one onboarding schedule and prints the execution contract.
- `node recovery-watchdog.js` identifies running schedules that are past the 10-minute hard timeout.
- `node retry-scheduler.js` plans failed-batch retries for the UTC retry window.

## Invariants

- Daily batches have priority over onboarding.
- Every browser run is 5 prompts.
- A browser run may contain prompts from multiple brands. Ownership lives on `worker_v3_batch_items`, not only on the batch row.
- ChatGPT/browser batches have a 10-minute hard timeout.
- Onboarding wave 1 uses one account and produces a partial dashboard after 5 prompts.
- Onboarding wave 2 runs the remaining 45 prompts and can produce the full dashboard later.
- Daily EOD runs at 23:59 UTC after retry attempts.
- Account leases are the source of truth for avoiding duplicate Browserless work once execution is enabled.

## Pending Database File

- `migrations/001_worker_account_leases.sql` defines the lease table v3 needs before real execution is enabled. It is kept inside `worker-v3` so it cannot be picked up by normal Supabase migration flow by accident.
- `migrations/002_mixed_brand_batches.sql` defines the mixed-brand browser-run model: one batch row, five item rows, and per-item provider/EOD ownership.

The PR-ready Supabase migration copies live in:

- `supabase/migrations/20260428000001_create_worker_account_leases.sql`
- `supabase/migrations/20260428000002_create_worker_v3_mixed_brand_batches.sql`
