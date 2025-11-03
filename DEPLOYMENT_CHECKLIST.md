# ⚡ QUICK DEPLOYMENT CHECKLIST

## Before You Leave (Do Now - 5 min)

- [ ] Read `FINAL_SUMMARY_FOR_USER.md` (2 min)
- [ ] Review `CHATGPT_BROWSERLESS_MIGRATION_COMPLETE.md` (3 min)

## When You Return (Do in Order - 30 min)

### ☐ STEP 1: Database (2 min)
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy contents of `supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql`
- [ ] Run it
- [ ] Verify: `SELECT subscription_plan, reports_enabled FROM users WHERE email IN ('kk1995current@gmail.com', 'korenk878@gmail.com');`
  - Expected: kk1995current = free_trial, false | korenk878 = basic, true

### ☐ STEP 2: Git Deploy (10 min)
```bash
git status
git add .
git commit -m "feat: ChatGPT-only Basic plan with Browserless automation"
git push origin main
```
- [ ] Wait for Vercel deploy (~2-3 min)
- [ ] Wait for Render deploy (~5-7 min)

### ☐ STEP 3: Verify (5 min)
- [ ] Check Render logs: "Worker started on port 8080" ✅
- [ ] Check Vercel: App loads, no console errors ✅
- [ ] Check UI: Model filter shows ChatGPT active, others locked 🔒

### ☐ STEP 4: Test Report (10 min)
**Option A:** Trigger manually
```bash
curl -X POST https://your-worker.onrender.com/api/trigger-report
```

**Option B:** Wait for cron at 1 AM

- [ ] Check Render logs for "CHATGPT BATCH PROCESSING" ✅
- [ ] Wait ~7 minutes for completion

### ☐ STEP 5: Verify Results (5 min)
```sql
-- In Supabase SQL Editor:
SELECT 
  dr.report_date,
  dr.chatgpt_attempted,
  dr.chatgpt_ok,
  u.email
FROM daily_reports dr
JOIN brands b ON dr.brand_id = b.id
JOIN users u ON b.owner_user_id = u.id
WHERE u.email = 'korenk878@gmail.com'
ORDER BY dr.report_date DESC
LIMIT 1;
```

Expected:
- `chatgpt_attempted = 10`
- `chatgpt_ok = 9 or 10`

- [ ] Login as korenk878@gmail.com → Check dashboard has data ✅

---

## ✅ SUCCESS = ALL CHECKED

## ❌ IF FAILED

```bash
git revert HEAD
git push origin main
```

Then contact me with error logs.

---

## 📁 Files You Created

**Keep for reference:**
- `FINAL_SUMMARY_FOR_USER.md` - What was done
- `CHATGPT_BROWSERLESS_MIGRATION_COMPLETE.md` - Full deployment guide
- `DEPLOYMENT_CHECKLIST.md` - This file
- `supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql` - Migration to run

**Implementation Files (Already Changed):**
- `worker/src/lib/providers/chatgpt-browserless.ts`
- `worker/src/services/prompt-processor.ts`
- `worker/src/services/report-generator.ts`
- `app/onboarding/add-prompts/combined-prompts-client.tsx`
- `app/onboarding/review-prompts/review-prompts-client.tsx`

**Test Files (Working):**
- `tests/browserless-batch.js` - Working 10-prompt batch processor
- `tests/batch-results.json` - Successful test results (155 citations!)

---

**Good luck! 🚀**


