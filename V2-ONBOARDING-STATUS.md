# V2 Onboarding — Post-Competitors Flow Status

Last verified: 2026-04-23  
Verified against: actual code in complete-final, generate-v2, queue-organizer, status API, finishing-client, end-of-day-processor

---

## STEP 1 — User clicks Launch (complete-final runs)

**What should happen:**
- Capacity check: finds a free ChatGPT account
- Updates brand: `onboarding_completed=true`, `first_report_status='queued'`, assigns `chatgpt_account_id`
- Fetches all ~50 `brand_prompts` (currently `status='inactive'`)
- For V2: selects 1 prompt per category → 5 wave-1 IDs, ~45 wave-2 IDs
- Wave 1 (5 prompts) → `status='active'`, `onboarding_wave=1`, `onboarding_status='pending'`
- Wave 2 (~45 prompts) → stays `status='inactive'`, `onboarding_wave=2`, `onboarding_status='pending'`
- Creates `daily_reports` row: `status='running'`, `is_partial=true`, `total_prompts=~50`
- Anchors `brands.onboarding_daily_report_id` and sets `brands.onboarding_phase=1`
- Saves competitors to `brand_competitors`
- Fires webhook to trigger queue-organizer on Hetzner
- Returns `success: true` → frontend calls `onComplete()` → navigates to finishing page

**Code verification (app/api/onboarding/complete-final/route.ts):**

| Check | Status | Notes |
|---|---|---|
| Capacity check (free accounts) | ✅ Working | Lines 36–78 |
| Brand update: onboarding_completed, first_report_status, chatgpt_account_id | ✅ Working | Lines 147–165 |
| Fetches brand_prompts | ✅ Working | Line 176–182 |
| V2 wave detection (`onboardingVersion === 'v2'`) | ✅ Working | Line 186 |
| Wave-1: 1 prompt per category (5 total) | ✅ Working | Lines 191–202 |
| Wave-1 → status='active', onboarding_wave=1 | ✅ Working | Lines 208–211 |
| Wave-2 → status='inactive', onboarding_wave=2 | ✅ Working | Lines 213–216 |
| Creates daily_reports is_partial=true | ✅ Working | Lines 229–239 |
| Anchors onboarding_daily_report_id | ✅ Working | Lines 244–249 |
| Sets brands.onboarding_phase=1 | ✅ Working | Line 247 |
| Saves competitors to brand_competitors | ✅ Working | Lines 255–276 |
| Upserts user to users table | ✅ Working | Lines 279–295 |
| Fires webhook to queue-organizer | ✅ Working | Lines 332–348 |
| Returns success: true | ✅ Working | Lines 352–357 |

**Gaps in STEP 1:**
- ⚠️ Status filter on line 180: `.in('status', ['active', 'inactive', 'improved'])` — `'improved'` is not a valid status. Harmless since no prompt will ever have that status. Should be `['active', 'inactive']`.
- ⚠️ `total_prompts` fallback on line 221: `allPrompts ? allPrompts.length : 30` — fallback hardcoded to 30. For V2 this should be ~50. Only matters if the query fails entirely. Low risk.

**STEP 1 verdict: ✅ CORRECT for V2**

---

## STEP 2 — Finishing page polls /api/onboarding/status

**What should happen:**
- Shows wave-1 progress (X/5 complete)
- Waits for `first_report_status = 'phase1_complete'` or `'succeeded'`
- Redirects to `/reports/visibility?onboarding_completed=true`

**Code verification (app/api/onboarding/status/route.ts + app/finishing/finishing-client.tsx):**

| Check | Status | Notes |
|---|---|---|
| Finds brand (onboarding_completed=true) | ✅ Working | Lines 14–23 |
| wave1Total from DB count | ✅ Working | Lines 50–52, returns actual count not hardcoded |
| wave2Total from DB count | ✅ Working | Lines 54–56 |
| firstReportStatus returned | ✅ Working | Line 71 |
| isPartial returned | ✅ Working | Line 76 |
| Redirect on phase1_complete or succeeded | ✅ Working | finishing-client line 40 |
| Poll every 10 seconds | ✅ Working | finishing-client POLL_INTERVAL_MS=10,000 |
| 25-min timeout with retry UI | ✅ Working | finishing-client TIMEOUT_MS=25*60*1000 |

**Gaps in STEP 2:**
- ⚠️ finishing-client line 49: `setStatus((w1 ?? 0) >= 6 ? 'almost' : 'working')` — threshold hardcoded to `>= 6`. V2 wave-1 has only 5 prompts, so the "Almost there" animation state never triggers. User stays on "We're working on your report" the entire time. Not a blocker — redirect still works. Fix: change `>= 6` to `>= wave1Total` (from the status response) or simply `>= 5`.

**STEP 2 verdict: ✅ FUNCTIONALLY CORRECT — minor UX gap with "almost" state**

---

## STEP 3 — Hetzner queue-organizer picks up wave-1

**What should happen:**
- Finds 5 `status='active'`, `onboarding_wave=1` prompts for this brand
- Sets `first_report_status='running'`
- Runs each prompt through ChatGPT (browserless), saves to `prompt_results`
- After all 5 complete → calls `finalizePhase(1)`

**Code verification (Hetzner: /root/be-visible.ai/worker/queue-organizer.js):**

| Check | Status | Notes |
|---|---|---|
| Finds brands with first_report_status in ['queued','running','phase1_complete'] | ✅ Working | Line ~124 |
| Dispatches only status='active' prompts for current wave | ✅ Working | claimPrompts() only touches status='active' |
| Sets first_report_status='running' on first dispatch | ✅ Working | Line ~280 (idempotent: only if still 'queued') |
| Wave detection: onboarding_phase drives wave number | ✅ Working | `currentWave = brand.onboarding_phase || 1` |
| Stale claim reset (prompts stuck >15 min) | ✅ Working | Lines ~55–65 |
| Failed prompt retry | ✅ Working | `in('onboarding_status', ['pending', 'failed'])` |
| Auto-reinit session on previous failures | ✅ Working | accountHasFailedPrompts() + reinitializeSession() |
| Detects wave complete (0 pending + 0 claimed) → finalizePhase | ✅ Working | Lines ~155–165 |
| Max 3 accounts per brand | ✅ Working | MAX_ACCOUNTS_PER_BRAND=3 |
| SESSION_MAX_PROMPTS=5 per account | ✅ Working | Hard cap per Browserless 15-min session |
| Safety sweep (phase1_complete + all wave-2 done + EOD not run) | ✅ Working | Lines ~77–116 |

**STEP 3 verdict: ✅ CORRECT**

---

## STEP 4 — finalizePhase(1)

**What should happen:**
- Flips wave-2 prompts from `status='inactive'` → `status='active'`
- Runs partial end-of-day (processes wave-1 results for dashboard)
- Sets `first_report_status='phase1_complete'`
- Sets `brands.onboarding_phase=2`
- Spawns fresh queue-organizer for immediate wave-2 dispatch

**Code verification (finalizePhase function in queue-organizer.js):**

| Check | Status | Notes |
|---|---|---|
| Idempotency guard (already phase1_complete → skip) | ✅ Working | Lines ~396–400 |
| Flips wave-2 inactive → active | ✅ Working | Lines ~403–409 |
| Runs EOD phase 1 | ✅ Working | Calls processEndOfDay(dailyReportId, { phase: 1 }) |
| EOD phase 1 runs FULL pipeline | ✅ Working | Phase 1 and Phase 2 run identical pipeline. Only difference: phase 1 keeps is_partial=true, phase 2 sets is_partial=false |
| EOD phase 1 sets daily_reports.status='completed', is_partial=true | ✅ Working | end-of-day-processor line ~190 |
| Sets first_report_status='phase1_complete' | ✅ Working | Line ~440 |
| Sets onboarding_phase=2 | ✅ Working | Line ~441 |
| Spawns fresh organizer (detached) | ✅ Working | Lines ~457–462 |

**Important clarification on EOD Phase 1:**
The end-of-day-processor runs the FULL pipeline on wave-1 results including Tavily citation enrichment, SOV calculation, and citation share stats. After phase 1 EOD, the dashboard will show real visibility data for those 5 prompts (1 per topic).

**Gaps in STEP 4:**
- ⚠️ `onboarding_prompts_sent: wave1Completed || 6` — fallback hardcoded to 6. For V2 wave-1 = 5. The `wave1Completed` query returns the actual count so the fallback is only used if the query fails. Low risk.

**STEP 4 verdict: ✅ CORRECT**

---

## STEP 5 — Finishing page detects phase1_complete → redirects to dashboard

**What should happen:**
- Finishing page poll detects `first_report_status='phase1_complete'`
- Redirects to `/reports/visibility?onboarding_completed=true`
- Dashboard shows `is_partial=true` PartialReportBanner
- 5 prompt results visible (1 per topic, wave-1 results with visibility data)

**Code verification:**

| Check | Status | Notes |
|---|---|---|
| Redirect on phase1_complete | ✅ Working | finishing-client line 40 |
| PartialReportBanner shows on report tab pages | ✅ Working | PartialReportBanner.tsx: shows when firstReportStatus='phase1_complete' AND isPartial=true |
| PartialReportBanner auto-hides on succeeded | ✅ Working | PartialReportBanner polls every 5 min, hides when firstReportStatus≠'phase1_complete' OR isPartial=false |
| PartialReportBanner on all report tabs | ✅ Working | REPORT_TAB_PATHS covers visibility, citations, competitors, improve, prompts |

**STEP 5 verdict: ✅ CORRECT**

---

## STEP 6 — Wave-2 runs (~45 prompts)

**What should happen:**
- Queue-organizer picks up wave-2 (now status='active', onboarding_wave=2)
- Runs prompts in batches via ChatGPT (5 per account per chunk)
- User's requirement: spread over 3–4 hours (5 prompts at a time with spacing)
- After all complete → finalizePhase(2)

**Code verification:**

| Check | Status | Notes |
|---|---|---|
| Fresh organizer spawned after phase1_complete | ✅ Working | finalizePhase(1) spawns detached organizer immediately |
| Organizer finds wave-2 active prompts | ✅ Working | currentWave = onboarding_phase = 2, dispatches status='active' wave-2 prompts |
| Dispatches 5 prompts per account per chunk | ✅ Working | SESSION_MAX_PROMPTS=5 |
| Webhook notifies organizer on chunk complete | ✅ Working | run-onboarding-chunk.js notifyChunkComplete() → POST /chunk-complete |
| Detects wave-2 complete → finalizePhase(2) | ✅ Working | Same wave-complete detection as wave-1 |

**CRITICAL GAP in STEP 6:**
- ❌ **Wave-2 does NOT spread over 3–4 hours.** After finalizePhase(1), the fresh organizer immediately dispatches wave-2 chunks as fast as possible: 5 prompts per available account, completing each batch in ~5 min, picking up the next immediately on webhook trigger. With 45 prompts and 1 account: ~45 min total. With 2 accounts: ~22 min. The user's requirement of 3–4 hour spreading is NOT implemented. Wave-2 runs at full speed, same as wave-1.
- If the user wants 3–4 hour spacing between wave-2 batches, this requires adding scheduling logic to finalizePhase(1): instead of spawning an immediate organizer, insert wave-2 batches into `daily_schedules` spread over the next 4 hours (e.g. 5 prompts every 30 min).

**STEP 6 verdict: ⚠️ FUNCTIONALLY WORKS (wave-2 runs and completes) but does NOT match the 3–4 hour spread requirement**

---

## STEP 7 — finalizePhase(2)

**What should happen:**
- Runs full end-of-day pipeline (Tavily, SOV, citation share)
- Sets `daily_reports.is_partial=false`, `status='completed'`
- Sets `first_report_status='succeeded'`
- PartialReportBanner disappears
- Injects brand into tomorrow's daily schedule

**Code verification:**

| Check | Status | Notes |
|---|---|---|
| Runs full EOD pipeline | ✅ Working | processEndOfDay(dailyReportId, { phase: 2 }) |
| EOD sets daily_reports.status='completed', is_partial=false | ✅ Working | end-of-day-processor line ~168 |
| Queue-organizer sets first_report_status='succeeded' | ✅ Working | Line ~499 |
| Queue-organizer clears chatgpt_account_id | ✅ Working | Sets chatgpt_account_id=null |
| Injects brand into tomorrow's daily_schedules | ✅ Working | injectBrandIntoTomorrowSchedule() |
| Tomorrow's schedules include 3 model BME rows per batch | ✅ Working | Creates batch_model_executions rows for chatgpt, claude, google_ai_overview |
| PartialReportBanner disappears | ✅ Working | Polls and auto-hides when isPartial=false |

**Gaps in STEP 7:**
- ❌ **queue-organizer line ~499: `total_prompts: 30` hardcoded.** When finalizePhase(2) updates daily_reports, it sets `total_prompts: 30`. For V2 brands with ~50 prompts this is wrong. Fix: query the actual count of brand_prompts for this brand and use that value.

**STEP 7 verdict: ✅ MOSTLY CORRECT — one hardcoded V1 value in daily_reports.total_prompts**

---

## ROOT CAUSE FIX — NOT YET DEPLOYED

**generate-v2/route.ts: sequential upsert fix (applied to file, NOT committed)**

This is the fix that prevents the empty dashboard. Without it:
- Parallel DB inserts hit the UNIQUE(brand_id, raw_prompt) constraint → silent failures → 0 prompts saved
- complete-final finds 0 prompts → assigns 0 to wave-1, 0 to wave-2
- Queue-organizer sees 0/0 wave-1 prompts → immediately calls finalizePhase(1) → empty dashboard

The fix is already written in the file. It just needs to be committed and pushed.

---

## COMPLETE LIST OF FIXES NEEDED

| # | File | Issue | Severity | Fix |
|---|---|---|---|---|
| 1 | generate-v2/route.ts | Fix applied but NOT committed/pushed | 🔴 CRITICAL | `git commit && git push` |
| 2 | queue-organizer.js (Hetzner) | `total_prompts: 30` hardcoded in finalizePhase(2) | 🟠 IMPORTANT | Query actual brand_prompts count, use that value |
| 3 | queue-organizer.js (Hetzner) | Wave-2 runs immediately at full speed, NOT spread over 3–4 hours | 🟠 IMPORTANT | Requires design decision: add scheduling logic to spread batches, or accept fast execution |
| 4 | finishing-client.tsx | "Almost there" threshold `>= 6` — never triggers for V2 (wave-1 = 5) | 🟡 UX | Change to `>= data.wave1Total` or `>= 5` |
| 5 | complete-final/route.ts | Status filter includes `'improved'` (invalid status) | 🟢 COSMETIC | Change to `['active', 'inactive']` |
| 6 | complete-final/route.ts | `total_prompts` fallback hardcoded to 30 | 🟢 LOW RISK | Change fallback to 50 for V2 |
| 7 | queue-organizer.js (Hetzner) | `onboarding_prompts_sent` fallback is 6, should be 5 for V2 | 🟢 LOW RISK | Change fallback to 5 |

---

## V1 vs V2 FEATURE PARITY CHECK

| Feature | V1 | V2 | Status |
|---|---|---|---|
| Total prompts | 30 | ~50 (5 topics × 10 prompts) | ✅ V2 correctly generates more |
| Wave-1 prompt count | 6 (first 6 sequential) | 5 (1 per category) | ✅ V2 correctly picks 1 per topic |
| Wave-2 prompt count | 24 | ~45 | ✅ Correctly assigned |
| improved_prompt field | Set by improve-prompts API | Set to raw_prompt value (shortcut) | ✅ Dashboard reads correctly |
| ChatGPT account assignment | complete-final assigns account | ✅ Same | ✅ |
| daily_reports row pre-created | ✅ | ✅ | ✅ |
| Wave assignments in DB | ✅ | ✅ | ✅ |
| Competitors saved | ✅ | ✅ | ✅ |
| User row upserted | ✅ | ✅ | ✅ |
| Webhook fires queue-organizer | ✅ | ✅ | ✅ |
| Finishing page polls status | ✅ | ✅ | ✅ |
| Partial dashboard after wave-1 | ✅ | ✅ | ✅ |
| PartialReportBanner during wave-2 | ✅ | ✅ | ✅ |
| Inject into tomorrow's daily schedule after wave-2 | ✅ | ✅ (but uses total_prompts: 30) | ⚠️ fix #2 |
| 3-model BME rows created | ✅ | ✅ | ✅ |
