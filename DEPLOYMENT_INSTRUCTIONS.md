# 🚀 ChatGPT Migration - Deployment Instructions
**Date:** November 2, 2025  
**Status:** ✅ 100% COMPLETE - READY TO DEPLOY

---

## ✅ WHAT'S BEEN COMPLETED

### 1. Database ✅
- ✅ Migration applied via Supabase MCP
- ✅ Users configured:
  - `kk1995current@gmail.com` → Free Trial (no reports)
  - `korenk878@gmail.com` → Basic plan (ChatGPT reports enabled)
- ✅ Prompt limits enforced (5/10/15 by plan)
- ✅ All prompts for kk1995current deactivated
- ✅ 10 active prompts for korenk878

### 2. Backend Worker ✅
- ✅ Browserless integration (`worker/src/lib/providers/chatgpt-browserless.ts`)
- ✅ ChatGPT batch processing
- ✅ Citation extraction
- ✅ Saves to Supabase (identical schema to Perplexity/Google AO)
- ✅ Report generator filters by `reports_enabled` + plan
- ✅ Skips Perplexity/Google AO for Basic plan

### 3. Frontend ✅
- ✅ Onboarding limits to 10 prompts
- ✅ Model filter shows ChatGPT active, others locked
- ✅ "Advanced Plan Required" for locked models
- ✅ **Manage Prompts page shows 10/10 limit** (just fixed!)
- ✅ Dashboard pages work with ChatGPT data

### 4. Local Testing ✅
- ✅ Test script works (`tests/browserless-batch.js`)
- ✅ Successfully processes 10 prompts
- ✅ Extracts citations
- ✅ Uses `Ctrl+Shift+O` for new conversations

---

## 🎯 NEXT STEPS - YOUR ACTIONS

### Step 1: Push to Git 🔧

```bash
# Add all changes
git add .

# Commit with descriptive message
git commit -m "feat: ChatGPT-only Basic plan with Browserless automation

- Add subscription plans (free_trial=5, basic=10, advanced=15)
- Integrate Browserless for ChatGPT batch processing
- Lock Perplexity/Google AO in UI (Advanced plan required)
- Set korenk878@gmail.com as basic user with ChatGPT reports
- Set kk1995current@gmail.com as free_trial (no reports)
- Fix: Update Manage Prompts page to show 10-prompt limit"

# Push to GitHub
git push origin main
```

**Auto-Deployment Timeline:**
- ⏱️ Vercel (Frontend): ~2-3 minutes
- ⏱️ Render (Worker): ~5-7 minutes
- ⏱️ **Total:** ~10 minutes

---

### Step 2: Verify Frontend Deployment (Vercel) 🌐

Once Vercel deployment completes, test the UI:

#### Test 1: Model Filter
1. Navigate to your app dashboard
2. Look at the top navigation bar
3. ✅ **Verify:** Model dropdown shows "ChatGPT" active
4. ✅ **Verify:** Clicking dropdown shows:
   - ✅ ChatGPT (active, selectable)
   - 🔒 Perplexity (locked, grayed out)
   - 🔒 Google AI Overview (locked, grayed out)
   - 📝 Label: "Advanced Plan Required"

#### Test 2: Manage Prompts Page
1. Sign in as `korenk878@gmail.com`
2. Navigate to "Setup & Management" → "Manage Prompts"
3. ✅ **Verify:** Badge shows **"10/10"** (not 15/15)
4. ✅ **Verify:** Browserless brand has 10 active prompts

#### Test 3: Free Trial User
1. Sign in as `kk1995current@gmail.com`
2. ✅ **Verify:** No active prompts
3. ✅ **Verify:** Reports page shows no data (no reports generated)

---

### Step 3: Verify Backend Deployment (Render) 🔧

Check Render dashboard:

1. Go to https://dashboard.render.com
2. Find your worker service
3. ✅ **Verify:** Latest deployment is live
4. ✅ **Verify:** Logs show no errors
5. ✅ **Verify:** Cron job scheduled for **01:00 UTC**
6. ✅ **Verify:** Environment variables present:
   - `BROWSERLESS_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

---

### Step 4: Test Report Generation 📊

You have 2 options:

#### Option A: Manual Trigger (If endpoint exists)
```bash
curl -X POST https://your-worker.onrender.com/api/trigger-report
```

#### Option B: Wait for Daily Cron (01:00 UTC)
- Cron runs at 1 AM automatically
- Check logs next morning

---

### Step 5: Verify Results in Supabase 🗄️

After report generation (manual or cron), check the database:

#### Query 1: Daily Report Created
```sql
SELECT 
  dr.id,
  dr.report_date,
  dr.chatgpt_status,
  dr.chatgpt_attempted,
  dr.chatgpt_ok,
  dr.chatgpt_no_result,
  dr.generated
FROM daily_reports dr
JOIN brands b ON dr.brand_id = b.id
JOIN users u ON b.owner_user_id = u.id
WHERE u.email = 'korenk878@gmail.com'
ORDER BY dr.report_date DESC
LIMIT 1;
```

**Expected Result:**
- ✅ `chatgpt_status` = `'complete'`
- ✅ `chatgpt_attempted` = `10`
- ✅ `chatgpt_ok` = `9-10` (most successful)
- ✅ `chatgpt_no_result` = `0-1` (few without citations)
- ✅ `generated` = `true`

#### Query 2: Prompt Results Saved
```sql
SELECT 
  pr.provider,
  pr.provider_status,
  pr.brand_mentioned,
  LENGTH(pr.chatgpt_response) as response_length,
  ARRAY_LENGTH(pr.chatgpt_citations, 1) as citation_count
FROM prompt_results pr
JOIN daily_reports dr ON pr.daily_report_id = dr.id
JOIN brands b ON dr.brand_id = b.id
JOIN users u ON b.owner_user_id = u.id
WHERE u.email = 'korenk878@gmail.com'
  AND dr.report_date = CURRENT_DATE
ORDER BY pr.created_at DESC;
```

**Expected Result:**
- ✅ 10 rows (one per prompt)
- ✅ `provider` = `'chatgpt'`
- ✅ `provider_status` = `'ok'`
- ✅ `response_length` > 100 (has content)
- ✅ `citation_count` = 3-9 (has citations)

#### Query 3: Citations in URL Inventory
```sql
SELECT 
  url,
  domain,
  source_provider,
  first_seen_date
FROM url_inventory
WHERE source_provider = 'chatgpt'
  AND first_seen_date = CURRENT_DATE
ORDER BY first_seen_date DESC
LIMIT 20;
```

**Expected Result:**
- ✅ 45-90 URLs (5-9 per prompt)
- ✅ `source_provider` = `'chatgpt'`
- ✅ Full URLs (not just domains)

---

### Step 6: Verify Dashboard (Frontend) 📈

Sign in as `korenk878@gmail.com` and check each page:

#### Visibility Page
- ✅ Chart shows data
- ✅ "Share of Voice" metric displays
- ✅ Filter by ChatGPT shows data

#### Citations Page
- ✅ Table shows URLs
- ✅ Domain column populated
- ✅ Can filter/sort

#### Content Page
- ✅ Metrics display
- ✅ Content structure shows data
- ✅ No errors

#### Prompts Page
- ✅ Shows 10 prompts
- ✅ Can toggle active/inactive
- ✅ Badge shows "10/10"

---

## 🎉 SUCCESS CRITERIA

Your migration is successful when:

- ✅ **Frontend:** Model filter shows ChatGPT only (Perplexity/Google AO locked)
- ✅ **Frontend:** Manage Prompts shows "10/10" limit
- ✅ **Backend:** Daily report generates at 1 AM
- ✅ **Database:** 10 ChatGPT responses saved per day
- ✅ **Database:** 45-90 citations in `url_inventory`
- ✅ **Dashboard:** All pages show data for korenk878@gmail.com
- ✅ **Free Trial:** kk1995current@gmail.com has no reports

---

## 🆘 TROUBLESHOOTING

### Issue: No reports generated
**Check:**
1. Render cron job is running (check logs)
2. `korenk878@gmail.com` has `reports_enabled=true` (check Supabase)
3. Browserless API key is valid (check Render env vars)
4. Worker logs show no errors

### Issue: Dashboard shows no data
**Check:**
1. Database has records in `daily_reports` table
2. `prompt_results` has 10 rows for today
3. Frontend is reading from correct date range
4. Model filter includes ChatGPT

### Issue: Citations not appearing
**Check:**
1. Browserless automation successfully extracting URLs
2. `url_inventory` table has records
3. `chatgpt_citations` column in `prompt_results` is not empty
4. Worker logs show citation extraction success

---

## 📞 SUPPORT

If you encounter any issues:

1. **Check Logs:**
   - Render worker logs
   - Vercel deployment logs
   - Browser console (F12)

2. **Check Database:**
   - Run verification queries above
   - Check `daily_reports.chatgpt_status`
   - Verify `reports_enabled` for users

3. **Review Migration:**
   - Confirm migration applied successfully
   - Check trigger `enforce_prompt_limit()` exists
   - Verify view `active_reportable_users` exists

---

## 🎯 QUICK CHECKLIST

Before declaring "DONE":

- [ ] Git push completed
- [ ] Vercel deployment successful
- [ ] Render deployment successful
- [ ] Frontend model filter shows ChatGPT only
- [ ] Manage Prompts shows "10/10"
- [ ] Report generated (manual or cron)
- [ ] Database has 10 ChatGPT responses
- [ ] Dashboard shows data
- [ ] Free trial user (kk1995current) has no reports

---

**Ready to deploy!** 🚀

Run `git add . && git commit -m "..." && git push origin main` and watch the magic happen! ✨

