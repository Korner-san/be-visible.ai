# Render Worker Quick Start Guide

## Current Situation

✅ **Your Render worker is already deployed and running!**

According to your logs:
- Service deployed successfully at 2025-10-26T11:38:35
- Next.js app running on port 3000 (internal)
- Service is live at: https://v0-be-visible-ai.vercel.app/ (or your Render URL)

## What Was Done

The migration is **code-complete**. The worker application has been created with:

### ✅ Completed
1. Worker application structure (`/worker` directory)
2. Express server with health endpoints
3. Report generation service with error resilience
4. Prompt processing (Perplexity + Google AI Overview)
5. URL processing (Tavily + ChatGPT classification)
6. Supabase integration
7. Built-in cron scheduler
8. Deployment files (Dockerfile, render.yaml)
9. Comprehensive documentation
10. GitHub Actions workflow disabled

## What Needs to Be Done

### Step 1: Configure the Render Worker (YOU ARE HERE)

Your current Render deployment is running the **Next.js app**, not the worker. You need to deploy the worker separately.

**Option A: Create a New Render Service (Recommended)**

1. Go to https://dashboard.render.com/
2. Click "New +" → "Background Worker"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `be-visible-worker`
   - **Region**: Oregon (or closest to you)
   - **Root Directory**: `worker`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month)

5. Add environment variables (copy from your Vercel deployment):

```bash
NODE_ENV=production
PORT=3001
CRON_SCHEDULE=0 1 * * *

# From Vercel → Settings → Environment Variables:
NEXT_PUBLIC_SUPABASE_URL=<your_value>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_value>
SUPABASE_SERVICE_ROLE_KEY=<your_value>
PERPLEXITY_API_KEY=<your_value>
GOOGLE_API_KEY=<your_value>
GOOGLE_CSE_ID=<your_value>
OPENAI_API_KEY=<your_value>
TAVILY_API_KEY=<your_value>
```

6. Click "Create Background Worker"

**Option B: Use Render Blueprint (Faster)**

1. In Render Dashboard, click "New +" → "Blueprint"
2. Connect your repository
3. Select `worker/render.yaml`
4. Add environment variables when prompted
5. Deploy

### Step 2: Verify Worker Deployment

Once deployed, test the worker:

```bash
# Replace with your actual Render worker URL
WORKER_URL="https://be-visible-worker.onrender.com"

# Health check
curl $WORKER_URL/health

# Should return:
# {"status":"healthy","timestamp":"...","environment":"production"}

# Status check
curl $WORKER_URL/status

# Manual trigger (test run)
curl -X POST $WORKER_URL/trigger-daily-reports

# Should return:
# {"success":true,"message":"Daily report generation started","timestamp":"..."}
```

### Step 3: Monitor First Run

1. Go to Render Dashboard → Your worker → Logs
2. Watch for these log messages:

```
✅ [WORKER] Server started on port 3001
⏰ [WORKER] Setting up cron job with schedule: 0 1 * * *
🚀 [REPORT GENERATOR] Starting daily report generation
📊 [REPORT GENERATOR] Found X brands to process
🔄 [REPORT GENERATOR] Processing brand: ...
✅ [PERPLEXITY] Pass completed
✅ [GOOGLE AI OVERVIEW] Pass completed
🔍 [URL PROCESSOR] Starting URL processing
✅ [URL PROCESSOR] URL processing complete
🎉 [REPORT GENERATOR] Daily reports generation completed
```

### Step 4: Verify in Supabase

Check that reports are being generated:

```sql
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
```

Expected results:
- `generated = true`
- `perplexity_status = 'complete'`
- `google_ai_overview_status = 'complete'` (for today's reports)
- `url_processing_status = 'complete'` ← **This is the key success indicator**
- `urls_total > 0`
- `urls_classified > 0`

### Step 5: Enable Automatic Daily Runs

The worker has a built-in cron scheduler that runs at 01:00 UTC daily. No additional configuration needed!

To verify:
1. Wait for 01:00 UTC (or trigger manually)
2. Check Render logs for automatic execution
3. Verify new report appears in Supabase

## Connecting Worker to Vercel URL

**Important**: The Render worker and Vercel Next.js app are **separate services** that both connect to the same Supabase database.

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  Vercel Next.js App                  Render Worker           │
│  (v0-be-visible-ai.vercel.app)      (be-visible-worker)      │
│                                                               │
│  ┌─────────────────┐                ┌─────────────────┐     │
│  │   Frontend UI   │                │  Cron Job       │     │
│  │   - /reports    │                │  (01:00 UTC)    │     │
│  │   - /dashboard  │                │                 │     │
│  │   - /onboarding │                │  Report Gen     │     │
│  └────────┬────────┘                │  Service        │     │
│           │                          └────────┬────────┘     │
│           │                                   │              │
│           └───────────────┬───────────────────┘              │
│                           │                                  │
│                           ▼                                  │
│                  ┌─────────────────┐                         │
│                  │    Supabase     │                         │
│                  │    Database     │                         │
│                  │  - daily_reports│                         │
│                  │  - brands       │                         │
│                  │  - prompts      │                         │
│                  └─────────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. **Render Worker** generates reports and writes to Supabase
2. **Vercel App** reads reports from Supabase and displays them to users
3. Both services use the same Supabase database
4. No direct communication between Render and Vercel needed

## Environment Variables Checklist

Make sure these are set in your Render worker:

- [ ] `NODE_ENV=production`
- [ ] `PORT=3001`
- [ ] `CRON_SCHEDULE=0 1 * * *`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (from Vercel)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Vercel)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (from Vercel)
- [ ] `PERPLEXITY_API_KEY` (from Vercel)
- [ ] `GOOGLE_API_KEY` (from Vercel)
- [ ] `GOOGLE_CSE_ID` (from Vercel)
- [ ] `OPENAI_API_KEY` (from Vercel)
- [ ] `TAVILY_API_KEY` (from Vercel)

## Current Status

✅ Code complete and ready to deploy  
✅ Documentation complete  
✅ GitHub Actions disabled  
⏳ Waiting for Render worker deployment  
⏳ Waiting for first successful run  
⏳ Waiting for Supabase verification  

## Quick Links

- **Worker Code**: `worker/` directory
- **Full Deployment Guide**: `WORKER_DEPLOYMENT_GUIDE.md`
- **Migration Summary**: `MIGRATION_SUMMARY.md`
- **Worker README**: `worker/README.md`

## Need Help?

Common issues and solutions:

### "Worker not starting"
→ Check environment variables are all set correctly

### "Cannot connect to Supabase"
→ Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### "API errors"
→ Check API keys are valid and have sufficient quota

### "Reports not generating"
→ Check worker logs for specific errors

## Success Criteria

Your migration is complete when:

1. ✅ Render worker is deployed and healthy
2. ✅ Manual trigger generates a complete report
3. ✅ Report has `url_processing_status = 'complete'` in Supabase
4. ✅ URLs have content in `url_content_facts` table
5. ✅ Automatic daily run works at 01:00 UTC
6. ✅ Vercel app displays the reports correctly

## Next Steps

1. **Deploy worker** using Option A or B above
2. **Verify deployment** with curl commands
3. **Monitor first run** in Render logs
4. **Check Supabase** for completed reports
5. **Celebrate** 🎉 - URL processing is now working!

---

**Status**: Ready to deploy  
**Estimated Time**: 15-20 minutes  
**Cost**: $7/month (Render Starter plan)


