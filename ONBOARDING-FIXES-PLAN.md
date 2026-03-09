# Onboarding Bug Fixes — Implementation Plan

Discovered during bluecjamie1@gmail.com stress test (2026-03-07).
All items below are bugs that caused manual intervention to be required.

---

## ALREADY FIXED THIS SESSION

| # | Bug | Fix Applied |
|---|---|---|
| F1 | Phase 1 EOD skipped citations, SOV, competitor metrics → dashboard empty | `end-of-day-processor.js` — removed all `isPartialRun` gates from phases 2, 5, 6, 7 |
| F2 | Phase 1 EOD set `is_partial=true` but forgot `status='completed'` → frontend queries never found the report | Phase 8 finalization now sets `{status:'completed', is_partial:true}` |
| F3 | Dashboard showed Incredibuild mock data (45% SOV, Incredibuild competitor list) for new brands | CompetitorsPage, ShareOfVoice, CitationShareChart, CitationSourcesTable, AIPreferenceDistribution — mock only shown when `!brandId` (demo mode); real brands get "Computing…" state |
| F4 | Onboarding stepper used time-based heuristics (elapsedSeconds, eodElapsed) | Replaced with real DB signals: step 1=queued, step 2=sent<6, step 3=sent≥6+no visibility_score, step 4=visibility_score set |

---

## BUGS STILL TO FIX

### BUG 1 — Phase 2 EOD never auto-triggered (CRITICAL)
**Symptom:** All 30 prompts completed, all `onboarding_status='completed'`, but Phase 2 EOD never fired. Required manual `node end-of-day-processor.js <reportId>`.

**Root cause:** `queue-organizer.js` `finalizePhase()` is called by `/chunk-complete` after the last chunk of wave 2 completes. Either:
- (a) The last chunk's `/chunk-complete` POST failed/timed out
- (b) `finalizePhase()` ran but its condition to call EOD wasn't met
- (c) EOD was called but crashed silently (no logs — see Bug 3)

**Fix needed:** In `queue-organizer.js` `finalizePhase()`:
1. Add explicit logging: log the wave-2-complete detection and EOD trigger
2. Add a safety fallback: if `first_report_status='phase1_complete'` AND all wave-2 prompts are `completed` AND `daily_report.status='running'` → trigger Phase 2 EOD (run this check at the START of every queue-organizer dispatch cycle as a catch-all)

**File:** `worker/queue-organizer.js` — `finalizePhase()` function + start of dispatch loop

---

### BUG 2 — `first_report_status` not set to `succeeded` after EOD (CRITICAL)
**Symptom:** After Phase 2 EOD completes successfully, `first_report_status` remained `phase1_complete` instead of updating to `succeeded`. Required manual DB update.

**Root cause:** `first_report_status='succeeded'` is set by `queue-organizer.js` `finalizePhase()` AFTER calling EOD. Since EOD was triggered manually (bypassing queue-organizer), the status update never ran. But this is also a latent bug — if EOD completes but the `finalizePhase()` status update fails, user is stuck on partial banner forever.

**Fix needed:**
- Add `first_report_status='succeeded'` update INSIDE `end-of-day-processor.js` Phase 8 finalization (for phase=2 run), so it's self-contained and doesn't rely on queue-organizer to clean up after it
- File: `worker/end-of-day-processor.js` Phase 8 block (full run)

---

### BUG 3 — Chunk process logs completely lost (existing known bug)
**Symptom:** No way to diagnose why Phase 2 EOD didn't auto-trigger — all chunk/EOD output is swallowed.

**Root cause:** `webhook-server.js` spawns queue-organizer with `stdio:'ignore'` + `detached:true`. Chunk processes inherit no stdio.

**Fix needed:** Spawn with stdout/stderr piped to `/tmp/chunk-<brandId>-<timestamp>.log`. Rotate logs (keep last 20). Add log path to webhook response so it's visible.

**File:** `worker/webhook-server.js` — spawn call for queue-organizer

---

### BUG 4 — `markRemainingFailed()` silently fails (existing known bug)
**Symptom:** If a chunk process crashes mid-run, prompts stay stuck as `claimed` indefinitely.

**Root cause:** `markRemainingFailed()` in `run-onboarding-chunk.js` does `await supabase.update(...)` with no error check. If Supabase call fails, prompts stay claimed with no live process.

**Fix needed:** Add error check + retry in `markRemainingFailed()`. If update fails, log loudly. Also add a safety sweep in queue-organizer: at dispatch time, any prompt `claimed` for >15 minutes with no live process → reset to `pending`.

**File:** `worker/run-onboarding-chunk.js` — `markRemainingFailed()` function

---

### BUG 5 — Chunk timeout too tight for small chunks (existing known bug)
**Symptom:** 1-2 prompt chunks timed out because `PROMPT_TIMEOUT_MS × N` doesn't account for connection overhead (~90s).

**Root cause:** Timeout formula = `N × 2.5min` but should be `90s (connect) + N × 2.5min`.

**Fix needed:**
```js
const chunkTimeoutMs = 90_000 + chunkPrompts.length * PROMPT_TIMEOUT_MS;
```
**File:** `worker/run-onboarding-chunk.js` — chunk timeout calculation (~line 66)

---

### BUG 6 — Forensic logging crashes for onboarding runs (minor)
**Symptom:** `invalid input syntax for type uuid: "onboarding-<brandId>"` — no forensic rows written for onboarding runs.

**Root cause:** `chatgpt-executor.js` uses `schedule_id = "onboarding-" + brandId` for onboarding, but `automation_forensics.schedule_id` is type `uuid`.

**Fix needed:** Either: (a) change `automation_forensics.schedule_id` to `text`, OR (b) pass `null` for `schedule_id` on onboarding runs.

**File:** `worker/executors/chatgpt-executor.js` — schedule_id assignment for onboarding mode. SQL if option (a): `ALTER TABLE automation_forensics ALTER COLUMN schedule_id TYPE text;`

---

### BUG 7 — `total_prompts` on daily_report gets overwritten by last chunk
**Symptom:** `daily_reports.total_prompts = 1` (or 2) instead of 30 — whichever chunk ran last sets it.

**Root cause:** Each chunk run updates `total_prompts` to its own chunk size.

**Fix needed:** Don't update `total_prompts` in individual chunk runs. Set it once in `complete-final/route.ts` to 30 (or let queue-organizer set it to 30 in `finalizePhase()`). EOD already works correctly (reads prompt_results directly), but this corrupts the display value.

**File:** `worker/executors/chatgpt-executor.js` — remove `total_prompts` from per-chunk update; `worker/queue-organizer.js` `finalizePhase()` — set `total_prompts: 30`

---

## IMPLEMENTATION ORDER

```
Priority 1 (CRITICAL — breaks auto-flow):
  BUG 1  — Phase 2 EOD never auto-triggers
  BUG 2  — first_report_status not set to succeeded after EOD

Priority 2 (RELIABILITY — causes stuck states):
  BUG 4  — markRemainingFailed() silent failure
  BUG 5  — Chunk timeout too tight

Priority 3 (QUALITY — data/visibility issues):
  BUG 3  — Chunk logs lost (diagnosability)
  BUG 6  — Forensic logging crashes
  BUG 7  — total_prompts overwritten
```

---

## WHAT A PERFECT ONBOARDING LOOKS LIKE (TARGET STATE)

```
1. User completes onboarding form → complete-final API called
   → brand_prompts created (6 wave-1, 24 wave-2)
   → daily_report pre-created (status=running, is_partial=true, total_prompts=30)
   → brands.first_report_status = 'queued'
   → /run-queue-organizer triggered

2. Queue-organizer dispatches wave-1 (6 prompts across 2 agents)
   → brands.first_report_status = 'running'
   → onboarding_prompts_sent increments 0→6
   [User sees: Step 1 Connecting → Step 2 Running]

3. All 6 wave-1 prompts complete → chunk-complete fires → finalizePhase(1)
   → Phase 1 EOD runs FULL pipeline (all 7 phases) on 6 prompt_results
   → daily_report: status=completed, is_partial=true, visibility_score=X, sov=populated
   → brands.first_report_status = 'phase1_complete'
   [User sees: Step 3 Analyzing → Step 4 Generating → Redirect to dashboard]

4. User lands on dashboard (partial banner shown)
   → All pages show REAL data from 6 prompts (visibility, SOV, citations, competitors)

5. Queue-organizer dispatches wave-2 (24 prompts) in background
   → onboarding_prompts_sent increments to 30

6. All 24 wave-2 prompts complete → chunk-complete fires → finalizePhase(2)
   → Phase 2 EOD runs FULL pipeline on all 30 prompt_results
   → daily_report: status=completed, is_partial=false — OVERWRITES Phase 1 data with 30-prompt data
   → brands.first_report_status = 'succeeded'
   [Partial banner disappears, dashboard refreshes with full 30-prompt data]
```
