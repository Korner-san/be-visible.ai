# Worker V3 Architecture Draft

## Goal

Worker V3 is a clean redesign of the Hetzner worker engine for onboarding and daily report execution.

The main goal is to keep the daily report engine stable while rebuilding onboarding so it is reliable, observable, and recoverable.

## Current Production Context

The production worker runs on Hetzner:

- Server: `root@135.181.203.202`
- Worker path: `/root/be-visible.ai/worker`
- Main app/API runs on Vercel
- Database is Supabase project `tzfvtofjcvpddqfgxdtn`

The live Hetzner worker contains production-only scripts that are not all present locally, including:

- `run-1-prompts-persistent.js`
- `run-2-prompts-persistent.js`
- `run-3-prompts-persistent.js`
- `run-4-prompts-persistent.js`
- `run-5-prompts-persistent.js`
- `run-6-prompts-persistent.js`
- `run-onboarding-chunk.js`
- `orchestrators/chatgpt-orchestrator.js`

Before implementing V3, these live scripts should be copied or mirrored locally so V3 is designed from the real production engine.

## Fixed Product Decisions

- Onboarding uses 50 prompts total.
- Onboarding is two-phase.
- Phase 1 runs 5 prompts, one prompt per topic.
- Phase 1 uses one ChatGPT account only.
- Phase 1 should produce a partial dashboard quickly.
- Phase 2 runs the remaining 45 prompts in the background.
- Phase 2 may use multiple ChatGPT accounts.
- Only one brand onboarding runs at a time for now.
- Daily reports have priority over onboarding.
- Onboarding can use an account if that account has no daily batch starting in the next 10 minutes.
- Wave 2 prompts stay inactive until onboarding fully succeeds.
- Onboarding batches must be visible in the forensic page.
- Onboarding and daily batches must use real persisted work IDs. No `scheduleId = null`.
- V3 should not rely on `daily_schedules.brand_id` as the only ownership field for a browser run.
- A ChatGPT/browser run may contain prompts from multiple brands, but each prompt item must carry its own `brand_id`, `user_id`, `daily_report_id`, provider status, retry state, and EOD ownership.
- Scheduling is UTC-based.
- Daily and onboarding primary execution can run between `00:00-20:00 UTC`.
- Failed batch retry planning happens at `20:00-20:05 UTC`.
- Failed batch retries run between `20:05-23:59 UTC`.
- Phase 2 onboarding uses a rolling lookahead window, not a fixed 4-hour window.
- All batch types use exactly 5 ChatGPT prompts per batch.
- ChatGPT batch hard runtime limit is 10 minutes. If a batch runs longer than 10 minutes, it can be killed and retried.
- V3 runs all providers: ChatGPT, Google AI Overview, and Claude.
- Google AI Overview and Claude are API-based and should not block browser-session recovery logic.
- One onboarding report gets two EOD passes: one after wave 1 and one after wave 2.

## Mixed-Brand Batch Data Model

The old `daily_schedules` model assumes one schedule row belongs to one brand. That is too limiting if we want one browser process to run exactly five prompts while mixing brands.

V3 should separate the browser run from the prompt ownership:

```text
worker_v3_batches
  one row = one Browserless / ChatGPT run
  exactly 5 prompt items
  one ChatGPT account lease
  one execution time
  one batch status

worker_v3_batch_items
  one row = one prompt inside that browser run
  owns brand_id
  owns user_id
  owns prompt_id
  owns daily_report_id when known
  owns onboarding_wave when relevant
  owns per-provider item status
  owns retry identity

worker_v3_model_executions
  provider-level visibility for ChatGPT, Google AI Overview, and Claude
  can track either whole batch work or one item/provider pair

worker_v3_eod_runs
  one row per daily EOD or onboarding EOD pass
  daily EOD is per brand/date at 23:59 UTC
  onboarding EOD is per brand/report/wave
```

This keeps the browser efficient while preventing the dangerous ambiguity where a batch row says `brand_id = A` but contains prompts for brands B and C.

Rules:

- `worker_v3_batches.batch_size` is always `5`.
- `worker_v3_batch_items` must have exactly five rows per batch before the batch can run.
- Daily primary execution must be unique by `(schedule_date, prompt_id)` so one prompt does not run twice for the same report date.
- Onboarding primary execution must be unique by `(prompt_id, onboarding_wave)` so the same onboarding prompt is not duplicated.
- EOD reads item rows by brand/date/report, not by batch row ownership.
- Retry rows should point back to the original failed item or batch.
- The forensic page should show both levels: browser run health and per-brand prompt item status.

## UTC Timeline

V3 should treat the UTC day as a set of scheduling lanes.

```text
00:00-20:00 UTC
  Primary execution window
  - daily report batches
  - onboarding phase 1
  - onboarding phase 2

20:00-20:05 UTC
  Retry planning window
  - scan failed daily batches
  - scan failed onboarding batches
  - create retry schedule for the rest of the UTC day

20:05-23:59 UTC
  Retry / overflow window
  - retry failed batches
  - continue onboarding only when account capacity is available
```

The main purpose of the `20:00-23:59 UTC` window is recovery. It should not be treated as a normal unlimited onboarding window.

## Work Priority

When multiple things want the same ChatGPT account, V3 should use this priority order:

```text
1. Daily batches already scheduled
2. Failed batch retries
3. Onboarding phase 1
4. Onboarding phase 2
```

Notes:

- Daily batches are the highest priority because paying users expect daily reports to run.
- Failed retries are second because they repair the current day's broken work.
- Phase 1 onboarding is important because it unlocks the first partial dashboard.
- Phase 2 onboarding is background work and should be patient.

Phase 1 can run during the retry window if a safe account is available. Phase 2 can also continue during the retry window, but only after daily work and retries are protected.

## Rolling Onboarding Lookahead

V2 tried to reason about onboarding as a fixed wave-2 window. That creates conflicts around `20:00 UTC`, because the retry scheduler also needs the evening.

V3 should treat onboarding as a queue of work, not as a fixed ownership window.

When phase 2 needs to schedule more batches, the dispatcher should:

1. Look ahead from `now`.
2. Search for safe account slots.
3. Respect daily batches, retries, leases, and the 10-minute protection window.
4. Schedule only the batches that safely fit.
5. Leave the rest pending for the next dispatcher run.

Suggested lookahead:

```text
8 hours from now
```

Example:

```text
User completes phase 1 at 20:00 UTC.
Phase 2 has 45 prompts left.
Dispatcher searches 20:00-04:00 UTC for safe slots.
20:05-23:59 UTC retries have priority.
Any phase-2 batches that do not fit safely remain pending and continue after midnight.
```

This means onboarding can spill into the next UTC day. That is acceptable because phase 2 is background processing.

## Scheduling Slot Rules

For every candidate onboarding slot, V3 should check:

- Is the account active and eligible?
- Does the account have a fresh lease?
- Is the account currently running a daily batch?
- Is the account currently running an onboarding batch?
- Is the account assigned to a retry batch at this time?
- Is there a daily batch starting within the next 10 minutes?
- Would this onboarding batch exceed its hard timeout before the account is needed?

If any answer blocks the slot, the dispatcher should skip that account/time and search later.

V3 should avoid creating all phase-2 rows blindly if the rows cannot be safely assigned. It is better to create rows just-in-time or create them in a pending-unassigned state and assign only when a safe account slot exists.

## Browser Session Reality

ChatGPT batches are headless browser work through Browserless.

Expected timing:

- Browser/session connection overhead: 1.5 to 2 minutes.
- Each prompt: about 50 to 60 seconds.
- A 5-prompt batch normally takes about 7 to 10 minutes.
- A 5-prompt batch should have a hard timeout of 10 minutes.
- A 5-prompt batch running longer than 10 minutes is probably harmful and can be killed.

Timeouts should be calculated as:

```text
timeout = connection_budget + prompt_count * prompt_budget + safety_buffer
```

Suggested starting values:

```text
connection_budget = 2 minutes
prompt_budget = 1 minute
safety_buffer = 3 minutes
```

For 5 prompts:

```text
2 + 5 * 1 + 3 = 10 minutes
```

This 10-minute limit should apply to the ChatGPT/browser part of the batch. API providers should be tracked separately and should not cause Browserless account locks.

## Provider Execution Model

V3 should run all providers for both daily and onboarding work:

```text
chatgpt
google_ai_overview
claude
```

ChatGPT is browser-based and needs strict account/session control.

Google AI Overview and Claude are API-based. They are expected to be simpler operationally:

- no Browserless session lease
- no ChatGPT account lease
- no zombie browser process risk
- failures should be captured in `batch_model_executions`
- failures should not block ChatGPT account recovery

Current Google/Claude credits may be unavailable. That is acceptable. Their failures should show clearly in forensic, but should not break ChatGPT onboarding or daily scheduling.

Recommended behavior:

1. Create pending BME rows for all three providers when a batch row is created.
2. Run ChatGPT through the browser executor.
3. Run Google AI Overview and Claude through API runners.
4. Track each provider independently.
5. EOD reads whatever provider results exist.

## Core Principle

One ChatGPT account can only have one browser owner at a time.

Daily batches and onboarding batches can run in the same timeframe, but they must not use the same ChatGPT account at the same time.

V3 should make account ownership explicit. It should not depend only on process grep, prompt status, or schedule status inference.

## Account Availability Rules

An account is available for onboarding only if:

- account is active
- account is eligible
- account has a proxy configured
- account has no currently running daily batch
- account has no currently running onboarding batch
- account has no daily batch starting within the next 10 minutes
- account has no retry batch assigned in the candidate slot
- account does not have a fresh active lease owned by another worker process

Daily batches have priority.

If an onboarding batch is running too long and would block a daily batch, the recovery system should kill the onboarding batch, mark its prompts failed, release the account, and let the daily batch run.

## Proposed V3 Components

### 1. Onboarding Dispatcher

Suggested file:

```text
worker-v3/onboarding-dispatcher.js
```

Responsibilities:

- Find the single active onboarding brand.
- Decide which phase the brand is in.
- Create missing onboarding batch rows in `daily_schedules`.
- Pick available accounts using the 10-minute daily protection window.
- Use the 8-hour rolling lookahead for phase-2 background work.
- Start eligible onboarding batches.
- Never start more than one batch on the same account.
- Never start more than one brand onboarding at the same time.
- Do not steal capacity from retry batches.
- Wake up immediately when an onboarding batch completes.

This dispatcher should not use crontab. It should run on a short interval through cron or a long-running loop, but only one dispatcher instance should run at once.

Recommended trigger model:

```text
webhook /run-v3-onboarding-dispatcher
  called when onboarding starts

webhook /v3-batch-complete
  called when an onboarding batch finishes

cron fallback every 1 minute
  runs dispatcher under a lock
```

The webhook gives fast progress. The cron fallback gives safety if a webhook is missed.

### 2. Onboarding Batch Executor

Suggested file:

```text
worker-v3/execute-onboarding-batch.js
```

Responsibilities:

- Load a real `daily_schedules` row.
- Claim the assigned account.
- Claim up to 5 prompts for the brand/wave.
- Run ChatGPT prompts through the same proven ChatGPT executor used by daily batches.
- Pass the real `scheduleId` into the executor.
- Update `batch_model_executions`.
- Mark each prompt completed or failed.
- Release account ownership when done.
- Trigger reinitialization if the session fails.
- Send webhook only if reinitialization fails.
- Notify the dispatcher when the batch exits.
- Run or trigger API providers for the same prompt IDs.

### 3. Account Lease Helper

Suggested file:

```text
worker-v3/lib/account-lease.js
```

Responsibilities:

- Acquire account lease before a batch starts.
- Renew or timestamp lease while a batch is active.
- Release lease after batch finishes.
- Detect stale leases.
- Give recovery code one reliable place to know who owns an account.

Implementation can use new DB columns or a new table. This needs a Supabase SQL migration before code is finalized.

Possible table:

```sql
worker_account_leases (
  account_id uuid primary key,
  owner_type text not null, -- daily | onboarding | init
  owner_id text not null,   -- schedule_id or operation id
  pid integer,
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  expires_at timestamptz not null
)
```

### 4. Recovery Watchdog

Suggested file:

```text
worker-v3/recovery-watchdog.js
```

Responsibilities:

- Find stale running onboarding batches.
- Find stale account leases.
- Kill harmful local processes.
- Call Browserless stop URL when needed.
- Mark affected schedule rows failed.
- Mark affected onboarding prompts failed.
- Trigger `initialize-persistent-session-db-driven.js`.
- Send Make webhook only if reinitialization fails.
- Provide the failed-batch list used by the retry scheduler.

This should centralize logic that is currently spread across several files.

### 6. Retry Scheduler

Suggested file:

```text
worker-v3/retry-scheduler.js
```

Responsibilities:

- Run at `20:00 UTC`.
- Scan failed daily batches and failed onboarding batches.
- De-duplicate retries.
- Create retry work for `20:05-23:59 UTC`.
- Respect account leases and scheduled daily/onboarding work.
- Prefer earlier retry slots for daily batches before onboarding retries.
- Write normal `daily_schedules` rows so retries appear in forensic.

Retry scheduling should be idempotent. Running it twice should not create duplicate retry rows.

### 5. Shared Batch Timing Helper

Suggested file:

```text
worker-v3/lib/batch-timing.js
```

Responsibilities:

- Calculate expected runtime.
- Calculate hard timeout.
- Calculate stale/zombie threshold.
- Keep daily and onboarding timing assumptions consistent.

Hard timeout for a 5-prompt ChatGPT batch starts at 10 minutes.

## Onboarding State Machine

### Brand States

Relevant existing fields:

- `brands.first_report_status`
- `brands.onboarding_phase`
- `brands.onboarding_completed`
- `brands.onboarding_daily_report_id`
- `brands.onboarding_prompts_sent`

Recommended flow:

```text
queued
  -> running
  -> phase1_complete
  -> succeeded
```

Failure should not permanently trap the brand. Failed batches/prompts should be retryable.

### Prompt States

Relevant existing fields:

- `brand_prompts.onboarding_wave`
- `brand_prompts.onboarding_status`
- `brand_prompts.onboarding_claimed_account_id`
- `brand_prompts.onboarding_claimed_at`
- `brand_prompts.status`
- `brand_prompts.is_active`

Recommended onboarding statuses:

```text
pending
claimed
completed
failed
```

Wave 1:

- status: `active`
- onboarding_status: `pending`

Wave 2 during onboarding:

- status: `inactive`
- is_active: `false`
- onboarding_status: `pending`

Wave 2 after full onboarding succeeds:

- status: `active`
- is_active: `true`

## Phase 1 Flow

1. Vercel completes onboarding setup.
2. Vercel creates or updates:
   - 50 prompts
   - wave 1: 5 prompts, active
   - wave 2: 45 prompts, inactive
   - one anchored `daily_reports` row
   - brand status `queued`
3. Onboarding dispatcher finds the queued brand.
4. Dispatcher creates one phase-1 `daily_schedules` row:
   - `batch_type = 'onboarding'`
   - `batch_size = 5`
   - real `prompt_ids`
   - real `chatgpt_account_id`
5. Executor runs the batch on one account.
6. Executor runs all providers for the 5 prompt IDs.
7. Executor updates prompt statuses and BME rows.
8. When all wave-1 ChatGPT prompts are completed or final-failed, phase-1 EOD runs.
9. Brand moves to `phase1_complete`.
10. User can see the partial dashboard.

Phase-1 EOD is required even though the report is not complete. It produces the first usable dashboard.

## Phase 2 Flow

1. Dispatcher sees brand in `phase1_complete`.
2. Dispatcher creates or assigns phase-2 onboarding rows for the remaining 45 prompts.
3. Batches are 5 prompts each by default.
4. Dispatcher searches up to 8 hours ahead for safe account slots.
5. Dispatcher assigns batches to available accounts while respecting:
   - daily priority
   - retry priority
   - 10-minute daily protection window
   - account lease availability
6. Executor runs each batch.
7. Executor runs all providers for each batch's prompt IDs.
8. Failed batches are retried.
9. Batches that cannot fit safely remain pending for the next dispatcher run.
10. When all 50 ChatGPT prompts are completed or final-failed, full EOD runs.
11. Wave 2 prompts are activated.
12. Brand moves to `succeeded`.
13. The brand is injected into daily reporting without duplicating prompt execution for the same report date.

Phase-2 EOD is a second EOD pass over the same anchored onboarding report. It upgrades the report from partial to full.

## EOD Rules

Daily report EOD and onboarding EOD are different.

### Daily Report EOD

Daily report EOD should run after the day's primary execution and retry windows are finished.

Rule:

```text
daily EOD runs at 23:59 UTC
```

Daily EOD should process as many successful prompt results as possible.

If some daily batches still failed after retry attempts, daily EOD should still run with the successful data. Failed prompt/batch data should remain visible in forensic and should not block the report forever.

Daily report timeline:

```text
00:00-20:00 UTC
  run primary daily batches

20:00-20:05 UTC
  identify failed batches and schedule retries

20:05-23:59 UTC
  run retries

23:59 UTC
  run daily EOD with all successful results available
```

Daily reports have one EOD pass per brand/report date.

### Onboarding EOD

Onboarding EOD is intentionally different because onboarding needs to populate the dashboard the same day.

Onboarding has two EOD passes:

```text
wave 1 complete
  -> EOD phase 1
  -> daily_reports.is_partial = true
  -> brand.first_report_status = phase1_complete

wave 2 complete
  -> EOD phase 2
  -> daily_reports.is_partial = false
  -> brand.first_report_status = succeeded
```

Phase 1 EOD should run after the first 5 wave-1 prompts complete. This gives the user a same-day dashboard populated with initial data.

Phase 2 EOD should run after the remaining 45 wave-2 prompts complete. This enriches the same dashboard/report with the full 50-prompt result set.

Unlike daily EOD, onboarding EOD should not wait until `23:59 UTC`. It is event-driven:

```text
wave 1 done -> run phase 1 EOD immediately
wave 2 done -> run phase 2 EOD immediately
```

The same onboarding report can therefore be processed more than once:

```text
same daily_report_id
  phase 1 EOD -> partial dashboard
  phase 2 EOD -> full dashboard
```

V3 should use idempotency locks so the same report/phase cannot run multiple EOD jobs at the same time.

Suggested lock key:

```text
daily_report_id + phase
```

This preserves the March 28 behavior where EOD was protected from duplicate triggering, while allowing onboarding to intentionally run EOD twice: once for phase 1 and once for phase 2.

### Final-Failed Meaning

For daily reports, "final-failed" means:

```text
the batch failed after all retry attempts available before 23:59 UTC
```

At `23:59 UTC`, daily EOD should run even if some batches are final-failed.

For onboarding, "final-failed" should be treated more carefully:

- phase 1 should not show the dashboard until the first 5 prompts produce enough usable data
- phase 2 should keep retrying background batches, but must not block the partial dashboard
- if phase 2 has persistent failures, the report can still show partial/full-enough data, but forensic must make the missing prompts obvious

## Same-Day Daily Injection After Onboarding

After onboarding succeeds, the brand must join daily reporting without duplicating prompt execution for the same report date.

The risk:

- onboarding already ran all 50 prompts for today's anchored onboarding report
- nightly daily schedule may already have run
- blindly injecting daily rows for the same date can run the same prompts twice for the same brand/date
- not injecting anything can create a one-day reporting gap

V3 should use this rule:

```text
For a brand/date, each prompt should have at most one successful ChatGPT execution.
```

Recommended injection design:

1. After phase-2 EOD succeeds, activate all prompts.
2. Check the brand's anchored onboarding `daily_reports.report_date`.
3. Check if all active prompts already have ChatGPT results for that brand/date.
4. If all prompts already ran for that date, do not create more daily ChatGPT batches for that same date.
5. Ensure the next eligible daily report date is scheduled.
6. If there are active prompts missing ChatGPT results for the current date, create daily rows only for the missing prompt IDs.

This means same-day injection is not simply "add all prompts." It is "add only missing prompt executions."

Suggested helper:

```text
worker-v3/lib/inject-brand-daily-schedule.js
```

Responsibilities:

- calculate target report date in UTC
- load active prompt IDs
- load existing prompt results for brand/date/provider
- determine missing prompt IDs
- create 5-prompt daily batches only for missing IDs
- create pending BME rows
- avoid duplicate rows for prompt IDs already scheduled in pending/running rows

For the first V3 implementation, safest behavior:

```text
after onboarding succeeds:
  schedule the brand for the next UTC day
  only backfill same-day if prompt results are missing
```

## Daily Batch Compatibility

Daily reports currently work through:

- `generate-nightly-schedule-BRAND-AWARE.js`
- `load-daily-schedule.js`
- `execute-batch.js`
- `end-of-day-processor.js`

V3 should avoid replacing this path in the first version.

Initial V3 should only add better onboarding and shared recovery rules.

Required daily-side fix:

- Daily scheduler must use 50 active prompts per brand, not 30.
- Daily scheduler should create fixed 5-prompt batches, not random 1-6 prompt batches.
- Daily scheduler should preserve brand interleaving and fair account distribution.

## Legacy Fallback Loader

Current production crontab has two daily-schedule-related jobs:

```text
23:30 UTC
  generate-nightly-schedule-BRAND-AWARE.js

15:00 UTC
  load-daily-schedule.js fallback
```

The fallback loader exists because the current system depends on dynamic crontab entries. If the nightly generator writes `daily_schedules` rows but fails to load those rows into crontab, the fallback gives the system another chance.

For V3, this fallback should be considered legacy.

V3 should not depend on a mid-day crontab reload to save missed scheduling. Instead, the preferred design is:

```text
daily_schedules = source of truth
dispatcher = checks what is due
batch executor = runs due work
```

This makes scheduling easier to reason about because there is one source of truth and one execution gate.

Do not remove the production fallback until V3 is proven. It may currently be covering real operational failures.

## 24/7 Reliability Model

The worker is the engine of the application. The hard part is not simply creating schedule rows; it is controlling browser-session ownership with precision.

V3 must be designed around these facts:

- ChatGPT automation is slow and stateful.
- Browserless sessions can remain connected after Node processes get stuck.
- One account/session can become harmful if another batch tries to use it while it is still busy.
- A failed batch should not poison the rest of the day.
- Recovery must happen at the right time, not too early and not too late.
- Forensic visibility is part of the product's operating system, not a nice-to-have.

The most important V3 reliability rule:

```text
No batch starts unless the selected ChatGPT account is provably available.
```

The second most important rule:

```text
If an account becomes harmful, isolate it, clean it, and only then return it to the pool.
```

## Account Ownership Precision

Current code infers account usage from several places:

- `daily_schedules.status`
- `daily_schedules.chatgpt_account_id`
- `brand_prompts.onboarding_claimed_account_id`
- process search/grep
- Browserless 429 errors
- forensic logs

This works sometimes, but it is fragile because no single thing is the explicit owner record.

V3 should add explicit account ownership.

Recommended approach:

```text
worker_account_leases
```

Each running browser job owns a lease:

```text
account_id
owner_type        daily | onboarding | retry | init
owner_id          schedule_id or operation id
pid
started_at
heartbeat_at
expires_at
expected_done_at
hard_timeout_at
```

Before any batch starts:

1. Check account state.
2. Check daily/retry/onboarding schedule conflicts.
3. Acquire lease atomically.
4. Start the process.
5. Write process metadata back to the lease.

After any batch exits:

1. Mark schedule completed or failed.
2. Mark BME completed or failed.
3. Release lease.
4. Notify dispatcher.

If the process dies without cleanup, the lease becomes stale and the watchdog owns recovery.

## Zombie Detection

A zombie is any browser/account owner that is no longer trustworthy.

Possible zombie signals:

- `daily_schedules.status = running` past hard timeout.
- `worker_account_leases.heartbeat_at` is stale.
- Browserless returns 429/session busy for an account that should be free.
- A local Node process still references an old schedule ID after timeout.
- Prompts remain `onboarding_status = claimed` past hard timeout.
- Account has an active Browserless session but no valid lease.

V3 should classify zombies into two levels:

```text
soft zombie
  suspicious, but not yet harmful

hard zombie
  actively blocking work or past hard timeout
```

Soft zombie action:

- do not assign more work to the account
- inspect process/session state
- wait for a short grace period

Hard zombie action:

- kill the local process if known
- call Browserless stop URL if available
- mark active batch failed
- release/expire lease
- mark claimed onboarding prompts failed
- run session reinitialization

## Session Reinitialization Policy

The existing good recovery pattern should be preserved:

```text
batch fails
  -> isolate account
  -> kill harmful session/process if needed
  -> run initialize-persistent-session-db-driven.js
  -> if reinit succeeds, return account to eligible pool
  -> if reinit fails, mark account ineligible and send Make webhook
```

Important rules:

- Do not send Make webhook on every batch failure.
- Send Make webhook only when automatic reinitialization fails or cookies/manual action are required.
- Do not keep scheduling work onto an account while reinitialization is running.
- Reinitialization itself should own an `init` lease so batches cannot use that account at the same time.

Recommended account states:

```text
eligible
busy_daily
busy_onboarding
busy_retry
initializing
cooldown
manual_attention
disabled
```

These states can be derived from leases and account fields, but the forensic page should display them clearly.

## Watchdog Timing

V3 should not wait for a user to notice stuck batches.

Suggested watchdog cadence:

```text
every 1 minute
```

For each active lease or running schedule:

```text
expected_done_at passed:
  show warning in forensic
  do not kill yet

hard_timeout_at passed:
  kill/recover
```

Suggested starting timing for 5-prompt ChatGPT batches:

```text
expected_done_at = started_at + 10 minutes
hard_timeout_at  = started_at + 10 minutes
```

For smaller batches, use the shared timing helper:

```text
hard_timeout = 2 min connection + prompt_count * 1.5 min + 5 min buffer
```

For V3 fixed 5-prompt batches, the working rule is simpler:

```text
hard_timeout = 10 minutes
```

For daily priority:

```text
if a daily batch needs an account within 10 minutes:
  do not start new onboarding work on that account
```

If onboarding is already running and will exceed the daily protection window, only kill it if it passes hard timeout or is confirmed harmful. Do not kill healthy onboarding just because a daily batch exists nearby unless it is blocking the daily batch.

## Dispatcher Safety Checks

Before starting any batch, the dispatcher should log and verify:

- account selected
- account current lease state
- account next daily batch time
- account next retry batch time
- protection window result
- expected runtime
- hard timeout
- schedule row ID
- prompt IDs
- batch type

If any check fails, the dispatcher should skip the account and continue searching.

The dispatcher should never silently fall back to "first eligible account" if the assigned account is unavailable. That caused uneven account usage and can create conflicts.

## Suggestions To Improve V3 Reliability

### 1. Make `daily_schedules` The Single Work Queue

Use `daily_schedules` for daily, onboarding, and retry work.

Required fields:

```text
batch_type = daily | onboarding | retry
source_batch_id = original failed schedule id, for retries
priority = daily > retry > onboarding_phase1 > onboarding_phase2
```

This gives forensic one unified view.

### 2. Use Account Leases Before Starting Processes

This is the highest-impact reliability improvement.

Without explicit leases, the system keeps guessing whether an account is free.

### 3. Pass Real `scheduleId` Everywhere

Onboarding execution must never use `scheduleId = null`.

The schedule ID should be passed into:

- ChatGPT executor
- forensic logs
- BME rows
- process command/env
- watchdog process matching

### 4. Add Heartbeats

Each batch process should update its lease heartbeat while running.

Simple option:

```text
setInterval(update heartbeat_at, 30 seconds)
```

If heartbeat stops, watchdog can distinguish a dead process from a slow but alive process.

### 5. Store Process Metadata

When spawning a process, store:

```text
pid
script_name
schedule_id
account_id
started_at
log_path
```

This avoids relying only on `ps | grep`.

### 6. Add Account Cooldown

After a hard failure or Browserless 429:

```text
account enters cooldown
no new work for 3-5 minutes
then reinit
then eligible if reinit succeeds
```

This prevents immediate repeated collisions.

### 7. Separate Failure Types

Do not treat all failures the same.

Examples:

```text
session_busy
not_logged_in
captcha
navigation_timeout
prompt_timeout
rate_limit
browser_crash
proxy_error
unknown
```

Each type should map to a recovery action.

### 8. Make Retry Scheduling Idempotent

Retries should reference the original failed schedule row.

Do not create another retry if one already exists for:

```text
source_batch_id
```

This prevents duplicate retry batches.

### 9. Keep Onboarding Phase 2 Just-In-Time

Do not create all phase-2 work with fixed times if account capacity is uncertain.

Safer approach:

- keep prompts pending
- create/assign the next batch only when a safe account slot exists
- use 8-hour lookahead to plan, but avoid overcommitting

### 10. Improve Forensic With "Why Not Running"

For each pending onboarding batch, forensic should show why it is waiting:

```text
waiting_for_account
daily_protection_window
retry_window_reserved
account_initializing
account_cooldown
previous_batch_running
manual_attention_required
```

This will make debugging much easier.

## March 28 Behaviors To Preserve

The March 28 worker had several behaviors that should not be lost:

- one brand onboarding at a time
- stale claimed prompt reset
- phase safety sweep for brands stuck at `phase1_complete`
- failed prompts are retriable
- account availability checks against running/reserved daily batches
- balanced account distribution
- EOD duplicate protection
- BME rows for provider status visibility
- post-onboarding daily schedule injection
- brand interleaving in daily scheduling
- account round-robin distribution by chronological batch order
- detailed logs per batch/chunk

V3 should preserve these behaviors while removing the fragile parts:

- no `scheduleId = null`
- no mixed 30/50 assumptions
- no duplicate onboarding batches
- no blind fallback to first eligible account
- no hidden ownership inference when a lease can be explicit

## Forensic Requirements

The forensic page must show both daily and onboarding batches.

Each onboarding batch should have:

- `daily_schedules` row
- `batch_type = 'onboarding'`
- `prompt_ids` filled when possible
- `batch_model_executions` rows
- account email
- execution time
- status
- error message
- per-model status
- linkable prompt results through the anchored daily report
- pending/running/completed/failed BME rows for ChatGPT, Google AI Overview, and Claude
- why-waiting reason when pending but not runnable

The executor must pass the real `scheduleId` to ChatGPT execution so `automation_forensics.batch_id` is meaningful.

## Recovery Rules

### Batch Failure

When an onboarding batch fails:

1. Mark `daily_schedules.status = 'failed'`.
2. Mark BME row failed.
3. Mark claimed prompts failed and release their claim fields.
4. Release the account lease.
5. Trigger session reinitialization.
6. If reinitialization succeeds, leave account eligible.
7. If reinitialization fails, mark account ineligible and send Make webhook.

Failed batches should be eligible for the `20:00 UTC` retry scheduler unless they are retried earlier by normal dispatcher logic.

### Zombie Batch

A batch is zombie-like if:

- it is still running past its hard timeout
- or its account lease is stale
- or Browserless reports the session is busy while no valid owner exists

Recovery should:

1. Kill local process if known.
2. Call Browserless stop URL if needed.
3. Mark batch failed.
4. Mark claimed prompts failed.
5. Release account lease.
6. Reinitialize session.

### Duplicate Batches

V3 must prevent duplicate onboarding batches with idempotency checks:

- only one phase-1 batch per brand
- only one phase-2 batch set per brand/wave unless old rows are final
- do not create a new pending batch for prompt IDs already in a pending/running batch
- do not create duplicate retry rows for the same failed source batch
- use DB constraints if possible

## Known V2 Problems To Avoid

- Duplicate onboarding batches.
- Only one ChatGPT account receiving work while others stay unused.
- A stuck batch blocking later batches.
- Zombie Browserless sessions not killed reliably.
- Onboarding batch failures not triggering the same reliable reinitialization path as daily batches.
- Missing or confusing forensic visibility.
- Mixed 30-prompt and 50-prompt assumptions.
- Passing `scheduleId = null` into ChatGPT execution.

## Open Design Questions

1. Should account leases be implemented as a new table or as columns on `chatgpt_accounts`?
2. Should phase-2 onboarding batches be created just-in-time, or created upfront as unassigned pending rows?
3. How many failed attempts should a prompt get before requiring manual intervention?
4. Should a failed phase-2 batch retry immediately when an account is free, or wait a minimum cooldown?
5. Should phase-1 failure block the user from reaching the dashboard, or show a waiting/retry screen?
6. Should daily batch execution also adopt account leases in V3 phase 1, or should leases start with onboarding only?
7. Should retry scheduling reserve the whole `20:05-23:59 UTC` window before phase-2 onboarding can use it, or should phase-2 fill gaps dynamically after retries are placed?
8. What should count as "final-failed" for EOD: after one failed attempt, after retry window, or after a maximum retry count?
