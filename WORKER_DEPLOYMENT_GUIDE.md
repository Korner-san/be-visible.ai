# Worker Deployment Guide - BeVisible Daily Report Generator

## Overview

This guide walks you through migrating the daily report generation from Vercel functions to a dedicated Render Background Worker.

## Current vs. New Architecture

### Before (Vercel)
```
GitHub Actions (01:00 UTC)
    ↓
Vercel API: /api/cron/daily-reports
    ↓
Vercel API: /api/reports/generate-daily
    ↓
❌ FAILS at URL processing (timeout)
```

### After (Render)
```
Render Worker (01:00 UTC, built-in cron)
    ↓
Express Server: /trigger-daily-reports
    ↓
Report Generator Service
    ↓
✅ SUCCESS - No timeout constraints
```

## Step-by-Step Deployment

### Step 1: Prepare Environment Variables

Gather these values from your current Vercel deployment:

1. **Supabase** (from Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **API Keys**:
   - `PERPLEXITY_API_KEY`
   - `GOOGLE_API_KEY`
   - `GOOGLE_CSE_ID`
   - `OPENAI_API_KEY`
   - `TAVILY_API_KEY`

### Step 2: Create Render Account & Service

1. Go to https://dashboard.render.com/
2. Sign up or log in
3. Click "New +" → "Background Worker"

### Step 3: Configure the Worker

**Basic Settings:**
- **Name**: `be-visible-worker`
- **Region**: Choose closest to your users (e.g., Oregon for US West)
- **Branch**: `main`
- **Root Directory**: `worker`

**Build & Start:**
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Plan:**
- Select "Starter" ($7/month) or higher

**Health Check:**
- **Health Check Path**: `/health`

### Step 4: Add Environment Variables

In Render Dashboard → Environment tab, add all variables:

```bash
NODE_ENV=production
PORT=3001
CRON_SCHEDULE=0 1 * * *

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# APIs
PERPLEXITY_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
GOOGLE_CSE_ID=your_cse_id_here
OPENAI_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
```

### Step 5: Deploy

1. Click "Create Background Worker"
2. Render will:
   - Clone your repository
   - Build the worker
   - Deploy and start it
3. Monitor deployment in the "Logs" tab

### Step 6: Verify Deployment

Once deployed, get your worker URL from Render Dashboard, then test:

```bash
# Health check
curl https://be-visible-worker.onrender.com/health

# Expected response:
# {"status":"healthy","timestamp":"...","environment":"production"}

# Status check
curl https://be-visible-worker.onrender.com/status

# Manual trigger (test run)
curl -X POST https://be-visible-worker.onrender.com/trigger-daily-reports

# Expected response:
# {"success":true,"message":"Daily report generation started","timestamp":"..."}
```

### Step 7: Monitor First Run

1. Go to Render Dashboard → Your worker → Logs
2. Wait for the automatic daily run at 01:00 UTC (or trigger manually)
3. Watch for key log messages:

```
🚀 [REPORT GENERATOR] Starting daily report generation
📊 [REPORT GENERATOR] Found X brands to process
🔄 [REPORT GENERATOR] Processing brand: ...
✅ [PERPLEXITY] Pass completed
✅ [GOOGLE AI OVERVIEW] Pass completed
🔍 [URL PROCESSOR] Starting URL processing
✅ [URL PROCESSOR] URL processing complete
🎉 [REPORT GENERATOR] Daily reports generation completed
```

### Step 8: Verify in Supabase

Check that reports are being generated:

```sql
-- Check latest reports
SELECT 
  id,
  brand_id,
  report_date,
  generated,
  perplexity_status,
  google_ai_overview_status,
  url_processing_status,
  urls_total,
  urls_classified,
  completed_at
FROM daily_reports
ORDER BY created_at DESC
LIMIT 5;

-- Should see:
-- - generated = true
-- - perplexity_status = 'complete'
-- - google_ai_overview_status = 'complete' (for today's date)
-- - url_processing_status = 'complete'
```

### Step 9: Disable Old System

Once you've verified the worker is generating reports successfully:

#### Option A: Disable GitHub Actions

```bash
# Rename the workflow file to disable it
git mv .github/workflows/daily-reports.yml .github/workflows/daily-reports.yml.disabled

# Commit and push
git add .
git commit -m "Disable GitHub Actions cron - migrated to Render worker"
git push
```

#### Option B: Comment Out GitHub Actions

Edit `.github/workflows/daily-reports.yml`:

```yaml
name: Cron Diagnostic Test (DISABLED - Using Render Worker)

# on:
#   schedule:
#     - cron: '0 1 * * *'
#   workflow_dispatch:

# ... rest of file ...
```

### Step 10: Update Vercel Cron (Optional)

If you were using Vercel cron jobs, disable them in `vercel.json`:

```json
{
  "buildCommand": "npm run build"
  // Remove or comment out:
  // "crons": [
  //   {
  //     "path": "/api/cron/daily-reports",
  //     "schedule": "0 1 * * *"
  //   }
  // ]
}
```

## Monitoring & Maintenance

### Daily Monitoring

Set up external monitoring for the worker:

1. **UptimeRobot** (free):
   - Monitor: `https://be-visible-worker.onrender.com/health`
   - Interval: Every 5 minutes
   - Alert: Email/SMS if down

2. **Cronitor** (for cron monitoring):
   - Monitor the daily report generation job
   - Alert if job doesn't run or fails

### Weekly Checks

Every week, verify:

```bash
# Check logs for errors
curl https://be-visible-worker.onrender.com/status

# Check Supabase for report completeness
SELECT 
  report_date,
  COUNT(*) as reports_generated,
  SUM(CASE WHEN generated THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN url_processing_status = 'complete' THEN 1 ELSE 0 END) as url_processed
FROM daily_reports
WHERE report_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY report_date
ORDER BY report_date DESC;
```

### Cost Monitoring

Monitor API usage monthly:
- **Perplexity**: https://www.perplexity.ai/settings/api
- **Google**: https://console.cloud.google.com/billing
- **OpenAI**: https://platform.openai.com/usage
- **Tavily**: https://tavily.com/dashboard
- **Render**: https://dashboard.render.com/billing

Expected costs:
- Render: $7/month (Starter plan)
- APIs: ~$15/month per brand (daily reports)

## Troubleshooting

### Problem: Worker Shows "Unhealthy"

**Solution:**
1. Check logs in Render Dashboard
2. Verify all environment variables are set
3. Restart the worker: Dashboard → Manual Deploy → Clear build cache & deploy

### Problem: Reports Not Generated

**Solution:**
1. Check worker logs for errors
2. Verify Supabase connection:
   ```bash
   # In worker logs, look for:
   ✅ [REPORT GENERATOR] Found test user: <user-id>
   ```
3. Check if test user exists in Supabase
4. Verify API keys are valid

### Problem: URL Processing Still Failing

**Solution:**
1. Check Tavily API key and quota
2. Verify OpenAI API key and quota
3. Check logs for specific URL errors:
   ```
   ❌ [URL PROCESSOR] Error during batch extraction
   ```
4. Individual URL failures won't fail the entire report (by design)

### Problem: High API Costs

**Solution:**
1. Review batch sizes in code:
   - `worker/src/services/url-processor.ts` → `batchSize`
   - `worker/src/lib/providers/tavily.ts` → `batchSize`
2. Add delays between API calls
3. Reduce number of active prompts per brand
4. Filter out duplicate URLs more aggressively

## Rollback Plan

If you need to rollback to the old system:

1. Re-enable GitHub Actions workflow
2. Pause the Render worker:
   - Dashboard → Your worker → Settings → Pause service
3. Verify old system is working
4. Debug the worker issue
5. Resume worker when fixed

## Success Criteria

✅ Worker is deployed and running on Render  
✅ Health check endpoint returns 200 OK  
✅ First manual trigger generates a complete report  
✅ Automatic daily run at 01:00 UTC works  
✅ Reports have `generated = true` and `url_processing_status = 'complete'`  
✅ GitHub Actions workflow is disabled  
✅ Monitoring is set up  

## Next Steps

After successful deployment:

1. **Monitor for 1 week** to ensure stability
2. **Add more brands** (currently limited to test user)
3. **Optimize performance** (parallel processing, batch sizes)
4. **Set up alerts** (email/Slack notifications for failures)
5. **Document any issues** and solutions for the team

## Support

For issues or questions:
- Check worker logs in Render Dashboard
- Review Supabase data for report status
- Contact the development team

---

**Deployment Date**: _[Fill in after deployment]_  
**Deployed By**: _[Your name]_  
**Render Service URL**: _[Your worker URL]_


