# 🚀 ChatGPT + Browserless Migration - DEPLOYMENT GUIDE

**Date:** November 1, 2025  
**Migration:** Multi-model (Perplexity + Google AO) → ChatGPT-only Basic Plan  
**Status:** ✅ Code Complete - Ready for Deployment

---

## 📋 WHAT WAS CHANGED

### ✅ Backend (Worker on Render)

1. **New Browserless Integration** (`worker/src/lib/providers/chatgpt-browserless.ts`)
   - Connects to Browserless cloud service via WebSocket
   - Processes 10 prompts in ONE browser session (saves ~40-60s per batch)
   - Uses authenticated ChatGPT Plus account (from `chatgpt_accounts` table)
   - Extracts response text + citations
   - Uses `Ctrl+Shift+O` to start new conversations between prompts

2. **Updated Prompt Processor** (`worker/src/services/prompt-processor.ts`)
   - Now calls `processChatGPTBatch()` instead of individual API calls
   - Processes all 10 prompts in one batch
   - Saves results to `prompt_results` table (same schema as Perplexity/Google AO)
   - Saves citations to `url_inventory` table

3. **Updated Report Generator** (`worker/src/services/report-generator.ts`)
   - Queries users by `subscription_plan` and `reports_enabled`
   - Excludes `free_trial` users from daily reports
   - Only processes users where `reports_enabled = true`

4. **Dependencies**
   - Playwright already in `package.json` ✅

### ✅ Frontend (Vercel)

1. **Provider Types** (`types/domain/provider.ts`)
   - `ACTIVE_PROVIDERS = ['chatgpt']` (Basic plan)
   - `LOCKED_PROVIDERS = ['perplexity', 'google_ai_overview']` (Advanced plan)

2. **Global Model Filter** (`components/GlobalModelFilter.tsx`)
   - ChatGPT active and selected by default
   - Perplexity & Google AO visible but locked with 🔒 icon
   - Shows "Advanced Plan Required" label

3. **Onboarding** (Prompt Limit: 15 → 10)
   - `app/onboarding/add-prompts/combined-prompts-client.tsx`
   - `app/onboarding/review-prompts/review-prompts-client.tsx`
   - Updated all references from 15 to 10 prompts

### ✅ Database (Supabase)

1. **New Migration** (`supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql`)
   - Added `users.subscription_plan` column: 'free_trial' | 'basic' | 'advanced' | 'business' | 'corporate'
   - Added `users.reports_enabled` boolean (default: true)
   - Added `users.plan_start_date` and `users.plan_end_date`
   - Created `enforce_prompt_limit()` trigger function:
     - free_trial: 5 prompts max
     - basic: 10 prompts max
     - advanced: 15 prompts max
   - Set `kk1995current@gmail.com` → free_trial, reports_enabled=false, all prompts deactivated
   - Set `korenk878@gmail.com` → basic, reports_enabled=true
   - Created `active_reportable_users` view

2. **ChatGPT Accounts** (Already exists from earlier work)
   - Table: `chatgpt_accounts`
   - Has cookies for `kk1995current@gmail.com` ChatGPT Plus account

### ✅ Cleanup

- Removed old test files (tests/*.png screenshots)
- Removed old backup scripts (test-browserless-*.js)
- Removed temporary MD summaries
- Kept essential files:
  - `tests/browserless-batch.js` (working batch processor)
  - `tests/batch-results.json` (successful run results)
  - `tests/used-prompts.json` (tracks which prompts were used)

---

## 🚨 MANUAL STEPS REQUIRED

### 1️⃣ **Apply Database Migration**

You need to manually run the migration in Supabase Dashboard since MCP access is restricted.

**Go to:** Supabase Dashboard → SQL Editor → New Query

**Run this:**

```sql
-- Copy the entire contents of:
-- supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql

-- Or run these key commands:

-- Add columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS plan_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS plan_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reports_enabled BOOLEAN DEFAULT true;

-- Set up users
UPDATE users SET subscription_plan = 'free_trial', reports_enabled = false 
WHERE email = 'kk1995current@gmail.com';

UPDATE users SET subscription_plan = 'basic', reports_enabled = true 
WHERE email = 'korenk878@gmail.com';

-- Deactivate all prompts for kk1995current@gmail.com
UPDATE brand_prompts bp
SET is_active = false
FROM brands b
WHERE bp.brand_id = b.id
  AND b.owner_user_id IN (SELECT id FROM users WHERE email = 'kk1995current@gmail.com');

-- Add prompt limit enforcement trigger
-- (See full migration file for complete trigger code)
```

### 2️⃣ **Verify Environment Variables on Render**

Go to Render Dashboard → Worker Service → Environment

**Required Variables:**
- `BROWSERLESS_TOKEN` or `BROWSERLESS_API_KEY` ✅ (should already exist)
- `SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅
- `NODE_ENV=production`

### 3️⃣ **Deploy to Git**

```bash
# Add all changes
git add .

# Commit
git commit -m "feat: migrate to ChatGPT-only Basic plan with Browserless automation

- Add subscription plans (free_trial, basic, advanced)
- Integrate Browserless for ChatGPT batch processing (10 prompts/session)
- Update UI to show ChatGPT-only with locked Perplexity/Google AO
- Limit prompts: free_trial=5, basic=10, advanced=15
- Set kk1995current@gmail.com as free_trial (no reports)
- Set korenk878@gmail.com as basic (ChatGPT reports enabled)
"

# Push
git push origin main
```

**What happens automatically:**
- ✅ Vercel auto-deploys frontend (Next.js)
- ✅ Render auto-deploys worker (Node.js)

---

## 🧪 TESTING & VERIFICATION

### Test 1: Verify Worker Builds

After Render deploys, check:
1. Render Dashboard → Worker → Logs
2. Should see: "Worker started on port 8080"
3. No TypeScript errors
4. Playwright installed successfully

### Test 2: Trigger Manual Report Generation

**Option A:** Wait for cron (1 AM daily)

**Option B:** Trigger manually via API

```bash
# Trigger report generation
curl -X POST https://your-worker.onrender.com/api/trigger-report

# Check logs in Render Dashboard
```

### Test 3: Verify Results in Supabase

Check these tables:
1. `daily_reports` - Should have new report for `korenk878@gmail.com` brand
2. `prompt_results` - Should have 10 rows with `provider = 'chatgpt'`
3. `url_inventory` - Should have new citations with `source_provider = 'chatgpt'`

**SQL to verify:**

```sql
-- Check latest report
SELECT * FROM daily_reports 
WHERE brand_id IN (
  SELECT id FROM brands 
  WHERE owner_user_id IN (
    SELECT id FROM users WHERE email = 'korenk878@gmail.com'
  )
)
ORDER BY report_date DESC
LIMIT 1;

-- Check ChatGPT results
SELECT 
  brand_prompt_id,
  LENGTH(chatgpt_response) as response_length,
  ARRAY_LENGTH(chatgpt_citations, 1) as citation_count,
  chatgpt_response_time_ms
FROM prompt_results
WHERE daily_report_id = '<report_id_from_above>'
  AND provider = 'chatgpt';

-- Expected: 10 rows with citations
```

### Test 4: Verify UI

1. Login as `korenk878@gmail.com`
2. Go to Reports → Visibility
3. Model filter should show:
   - ✅ ChatGPT (active, checkmark)
   - 🔒 Perplexity (locked, "Advanced Plan Required")
   - 🔒 Google AI Overview (locked, "Advanced Plan Required")
4. Check that data shows up (after first report runs)

### Test 5: Verify Prompt Limits

1. Try to activate more than 10 prompts for `korenk878@gmail.com`
2. Should see error: "Maximum active prompts for basic plan is 10"

---

## 📊 EXPECTED PERFORMANCE

**Per 10-Prompt Batch:**
- **Total Time:** ~420 seconds (7 minutes)
- **Average per Prompt:** ~42 seconds
- **Citations:** 90-100% success rate (9-10 prompts with citations)
- **Browserless Units:** ~420 units per run
- **Cost:** ~$0.84 per batch at $0.002/unit

**Daily for One User:**
- 1 brand with 10 prompts = 1 batch = 7 minutes
- Total monthly units: 420 units/day × 30 days = 12,600 units
- Monthly cost: ~$25.20 on Browserless "Prototyping" plan (20k units/$40)

---

## 🐛 TROUBLESHOOTING

### Issue: Worker fails to start

**Check:**
1. Render logs for errors
2. Ensure Playwright installed: `npm install playwright`
3. Check environment variables

### Issue: No citations extracted

**Check:**
1. ChatGPT account status in `chatgpt_accounts` table (should be 'active')
2. Session cookies might be expired - update them
3. Check Browserless logs: `https://cloud.browserless.io/logs`

### Issue: "No active ChatGPT account found"

**Fix:**
```sql
UPDATE chatgpt_accounts 
SET status = 'active' 
WHERE email = 'kk1995current@gmail.com';
```

### Issue: Prompts not being processed

**Check:**
1. User has `reports_enabled = true`
2. User has `subscription_plan != 'free_trial'`
3. Brand has active prompts (`is_active = true`)

---

## 🎯 SUCCESS CRITERIA

✅ **Migration is successful when:**

1. ✅ `korenk878@gmail.com` receives daily report with 10 ChatGPT responses
2. ✅ All 10 prompts have response text
3. ✅ 9-10 prompts have citations
4. ✅ Citations appear in dashboard (Citations page, Content page)
5. ✅ UI shows ChatGPT-only with locked Perplexity/Google AO
6. ✅ `kk1995current@gmail.com` does NOT receive reports (free_trial)
7. ✅ Onboarding limits to 10 prompts for new users

---

## 📞 NEXT STEPS FOR YOU

1. ✅ **Apply migration** in Supabase Dashboard (copy from migration file)
2. ✅ **Verify ENV vars** on Render
3. ✅ **Push to Git** (Vercel + Render auto-deploy)
4. ⏳ **Wait for deployment** (~5-10 minutes)
5. 🧪 **Test manually** (trigger report via API or wait for cron)
6. ✅ **Verify results** in Supabase + Dashboard
7. 🎉 **Migration complete!**

---

## 🔄 ROLLBACK PLAN (If Needed)

If something goes wrong:

1. **Revert Git:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Restore User Settings:**
   ```sql
   UPDATE users SET subscription_plan = 'basic', reports_enabled = true 
   WHERE email = 'kk1995current@gmail.com';
   ```

3. **Render will auto-deploy previous version**

---

## 📝 FILES CHANGED

**Backend:**
- `worker/src/lib/providers/chatgpt-browserless.ts` (NEW)
- `worker/src/services/prompt-processor.ts` (MODIFIED)
- `worker/src/services/report-generator.ts` (MODIFIED)

**Frontend:**
- `types/domain/provider.ts` (MODIFIED)
- `components/GlobalModelFilter.tsx` (ALREADY UPDATED)
- `app/onboarding/add-prompts/combined-prompts-client.tsx` (MODIFIED)
- `app/onboarding/review-prompts/review-prompts-client.tsx` (MODIFIED)

**Database:**
- `supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql` (NEW)

**Tests:**
- `tests/browserless-batch.js` (WORKING VERSION - KEEP THIS)
- `tests/batch-results.json` (SUCCESSFUL RUN DATA)
- `tests/used-prompts.json` (TRACKS USED PROMPTS)

---

**🎉 Ready to deploy! Good luck with the migration! 🚀**


