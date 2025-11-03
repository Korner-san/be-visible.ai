# ChatGPT Migration - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Run Database Migration
```bash
# Option A: Using Supabase CLI (recommended)
supabase db push

# Option B: Manual SQL execution
# Copy and paste contents of: supabase/migrations/20250130000001_add_chatgpt_support_and_10_prompt_limit.sql
# into Supabase SQL Editor and run
```

**What this does:**
- ✅ Adds ChatGPT columns to tables
- ✅ Limits prompts to 10 per brand
- ✅ Deactivates prompts for kk1995current@gmail.com

---

### Step 2: Install Worker Dependencies
```bash
cd worker
npm install
```

This installs:
- `playwright` - Browserless automation
- `uuid` - ID generation

---

### Step 3: Deploy to Render
```bash
git add .
git commit -m "feat: Add ChatGPT integration via Browserless"
git push origin main
```

Render will automatically:
1. Pull latest code
2. Install dependencies
3. Build TypeScript
4. Restart worker

---

### Step 4: Verify Environment Variables

#### On Render (Worker)
Check these exist:
- `BROWSERLESS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

#### On Vercel (Frontend)
Check these exist:
- `BROWSERLESS_API_KEY`
- `RENDER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### Step 5: Test Manual Trigger
```bash
# Trigger a report generation manually
curl -X POST https://your-worker.onrender.com/trigger-daily-reports

# Check Render logs
# Look for:
# 🚀 [CHATGPT] Starting ChatGPT automation
# ✅ [CHATGPT] Automation completed successfully
```

---

## 🧪 Quick Verification Tests

### Test 1: UI Check (2 minutes)
1. Open https://your-app.vercel.app/reports/overview
2. Click model filter dropdown
3. ✅ Verify: ChatGPT is selected
4. ✅ Verify: Perplexity shows lock icon
5. ✅ Verify: Google AI Overview shows lock icon

### Test 2: Database Check (1 minute)
```sql
-- Check ChatGPT columns exist
SELECT chatgpt_status FROM daily_reports LIMIT 1;

-- Check prompt limit (should be max 10 per brand)
SELECT brand_id, COUNT(*) FROM brand_prompts 
WHERE status = 'active' 
GROUP BY brand_id;
```

### Test 3: Onboarding Check (3 minutes)
1. Start new brand onboarding
2. Go to prompt selection
3. ✅ Verify: Shows "10 prompts maximum"
4. ✅ Verify: Badge shows `X / 10`

---

## 📊 What Changed

| Component | Before | After |
|-----------|--------|-------|
| **Active Providers** | Perplexity + Google AO | ChatGPT only |
| **Max Prompts** | 15 | 10 |
| **Report Generation** | API calls | Browserless automation |
| **UI Model Filter** | 2 active providers | 1 active, 2 locked |

---

## 🎯 Success Indicators

You'll know it's working when:

✅ **UI Shows:**
- ChatGPT selected in model filter
- Perplexity & Google AO locked
- Onboarding allows max 10 prompts

✅ **Database Contains:**
- `chatgpt_status` column in `daily_reports`
- `chatgpt_response` column in `prompt_results`
- Max 10 active prompts per brand

✅ **Worker Logs Show:**
```
🚀 [CHATGPT] Starting ChatGPT automation
🌐 [CHATGPT] Connecting to Browserless...
✅ [CHATGPT] Connected successfully
📝 [CHATGPT] Sending prompt
✅ [CHATGPT] Automation completed successfully
```

---

## ⚠️ Common Issues & Solutions

### Issue: "BROWSERLESS_API_KEY not configured"
**Solution:** Add environment variable to Render worker

### Issue: "No active prompts found"
**Solution:** Run migration to ensure prompts weren't all deactivated

### Issue: Model filter shows all providers as locked
**Solution:** Clear browser localStorage and refresh

### Issue: Onboarding still shows 15 prompts
**Solution:** Clear browser cache and hard refresh (Ctrl+Shift+R)

---

## 📈 Monitoring

### Check Browserless Usage
1. Go to https://browserless.io/dashboard
2. Check quota usage
3. Monitor session counts

### Check Render Logs
1. Go to Render dashboard
2. Click your worker service
3. View "Logs" tab
4. Filter for "CHATGPT"

### Check Database Stats
```sql
-- ChatGPT success rate
SELECT 
  chatgpt_status,
  COUNT(*) as count
FROM daily_reports
WHERE chatgpt_status != 'not_started'
GROUP BY chatgpt_status;

-- Average response time
SELECT 
  AVG(chatgpt_response_time_ms) as avg_time_ms
FROM prompt_results
WHERE provider = 'chatgpt';
```

---

## 🎉 Next Steps

After successful deployment:

1. **Monitor first cron run** (01:00 UTC tomorrow)
2. **Create new user** korenk878@gmail.com
3. **Verify reports generate** correctly
4. **Check performance metrics** in logs
5. **Gather user feedback** on ChatGPT quality

---

## 📞 Need More Info?

- **Detailed guide:** See `CHATGPT_MIGRATION_COMPLETE.md`
- **Implementation details:** See `IMPLEMENTATION_SUMMARY.md`
- **Old Browserless POC:** Reference in `old browserless file/` directory

---

## ✨ That's It!

Your ChatGPT integration is ready to go. The entire migration takes **~5 minutes** to deploy.

**Questions?** Review the comprehensive documentation in `CHATGPT_MIGRATION_COMPLETE.md`

---

**Last Updated:** January 30, 2025  
**Status:** ✅ Ready for Production



