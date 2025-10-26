# BeVisible Worker - Daily Report Generator

This is a standalone background worker for generating daily reports. It runs independently from the Vercel Next.js application and is designed to handle long-running, resource-intensive tasks that Vercel functions cannot reliably process.

## Why This Exists

The daily report generation process involves:
1. Sending prompts to Perplexity API
2. Sending prompts to Google AI Overview API  
3. Extracting URLs from responses
4. Fetching full page content for each URL (using Tavily)
5. Classifying content using ChatGPT
6. Storing all results in Supabase

Steps 4-5 (URL processing) are too heavy for Vercel's serverless functions, causing timeouts and failures. This worker moves the entire process to a dedicated Render Background Worker with no timeout constraints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BeVisible Worker (Render)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐                                            │
│  │  Express Server │  Port 3001                                 │
│  │  - /health      │  Health check endpoint                     │
│  │  - /status      │  Status endpoint                           │
│  │  - /trigger-... │  Manual trigger endpoint                   │
│  └────────┬────────┘                                            │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐                                            │
│  │   Cron Scheduler │  Runs at 01:00 UTC daily                 │
│  └────────┬────────┘                                            │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────┐                        │
│  │     Report Generator Service         │                        │
│  │  - Fetches brands with active prompts│                        │
│  │  - Processes each brand sequentially │                        │
│  └──────────────┬──────────────────────┘                        │
│                 │                                                 │
│                 ├──► Prompt Processor (Phase 1 & 2)             │
│                 │    - Perplexity API calls                      │
│                 │    - Google AI Overview API calls             │
│                 │    - Brand mention analysis                    │
│                 │                                                 │
│                 └──► URL Processor (Phase 3)                     │
│                      - Extract URLs from citations              │
│                      - Tavily content extraction                │
│                      - ChatGPT classification                   │
│                      - Store in Supabase                        │
│                                                                   │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Supabase Database   │
                    │  - daily_reports      │
                    │  - prompt_results     │
                    │  - url_inventory      │
                    │  - url_content_facts  │
                    └───────────────────────┘
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed locally
- A Render account
- Access to the Supabase database
- API keys for:
  - Perplexity
  - Google Custom Search
  - OpenAI
  - Tavily

### 2. Local Development

```bash
# Navigate to worker directory
cd worker

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env and fill in all required values
nano .env

# Build TypeScript
npm run build

# Start the worker
npm start

# For development with auto-reload
npm run dev
```

### 3. Testing Locally

```bash
# Check health
curl http://localhost:3001/health

# Check status
curl http://localhost:3001/status

# Manually trigger report generation
curl -X POST http://localhost:3001/trigger-daily-reports
```

### 4. Deploy to Render

#### Option A: Using Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Background Worker"
3. Connect your GitHub repository
4. Set the following:
   - **Name**: `be-visible-worker`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: `worker`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month) or higher
   
5. Add all environment variables from `.env.example`:
   - `NODE_ENV=production`
   - `PORT=3001`
   - `CRON_SCHEDULE=0 1 * * *`
   - `NEXT_PUBLIC_SUPABASE_URL=your_value`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=your_value`
   - `SUPABASE_SERVICE_ROLE_KEY=your_value`
   - `PERPLEXITY_API_KEY=your_value`
   - `GOOGLE_API_KEY=your_value`
   - `GOOGLE_CSE_ID=your_value`
   - `OPENAI_API_KEY=your_value`
   - `TAVILY_API_KEY=your_value`

6. Click "Create Background Worker"

#### Option B: Using render.yaml (Infrastructure as Code)

1. The `render.yaml` file is already configured
2. Push your code to GitHub
3. In Render Dashboard, click "New +" → "Blueprint"
4. Connect your repository and select `worker/render.yaml`
5. Add environment variables as prompted

### 5. Configure Automatic Cron Trigger

The worker has built-in cron scheduling using `node-cron`. It will automatically run daily at 01:00 UTC based on the `CRON_SCHEDULE` environment variable.

**Optional**: You can also set up Render Cron Jobs:
1. Go to your worker service in Render Dashboard
2. Click "Cron Jobs" tab
3. Add a cron job:
   - **Command**: `curl -X POST http://localhost:3001/trigger-daily-reports`
   - **Schedule**: `0 1 * * *` (01:00 UTC daily)

### 6. Disable Old GitHub Actions Workflow

To prevent duplicate runs, disable the old GitHub Actions workflow:

```bash
# Rename or delete the workflow file
mv .github/workflows/daily-reports.yml .github/workflows/daily-reports.yml.disabled

# Or comment out the schedule in the workflow file
```

### 7. Verify Deployment

After deployment:

```bash
# Check health (replace with your Render URL)
curl https://be-visible-worker.onrender.com/health

# Check status
curl https://be-visible-worker.onrender.com/status

# Manually trigger a test run
curl -X POST https://be-visible-worker.onrender.com/trigger-daily-reports
```

Check your Supabase `daily_reports` table to verify reports are being generated.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` in Render |
| `PORT` | Yes | Port for Express server (default: 3001) |
| `CRON_SCHEDULE` | Yes | Cron expression for daily run (default: `0 1 * * *`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key |
| `GOOGLE_API_KEY` | Yes | Google Cloud API key |
| `GOOGLE_CSE_ID` | Yes | Google Custom Search Engine ID |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TAVILY_API_KEY` | Yes | Tavily API key |

## Monitoring

### Logs

View logs in Render Dashboard:
1. Go to your worker service
2. Click "Logs" tab
3. Monitor real-time output

Look for:
- `🚀 [REPORT GENERATOR] Starting daily report generation` - Job started
- `✅ [REPORT GENERATOR] Daily reports generation completed` - Job completed
- `❌` - Any errors during processing

### Health Checks

Render automatically monitors the `/health` endpoint. If it fails 3 times in a row, Render will restart the worker.

### Manual Monitoring

Set up external monitoring (e.g., UptimeRobot, Cronitor) to ping:
- Health: `https://be-visible-worker.onrender.com/health`
- Status: `https://be-visible-worker.onrender.com/status`

## Troubleshooting

### Worker Not Running

1. Check Render Dashboard → Logs for errors
2. Verify all environment variables are set correctly
3. Check Render service status page

### Reports Not Generating

1. Check logs for errors:
   - Supabase connection issues
   - API key problems
   - Rate limiting errors

2. Verify in Supabase:
   ```sql
   SELECT * FROM daily_reports 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. Check if test user exists:
   ```sql
   SELECT * FROM users 
   WHERE email = 'kk1995current@gmail.com';
   ```

### URL Processing Failures

URL processing is now resilient - individual URL failures won't fail the entire report. Check logs for:
- `❌ [URL PROCESSOR]` - URL processing errors
- `⚠️` - Warnings about failed URLs

The report will still be marked as complete even if some URLs fail.

### High API Costs

Monitor API usage:
- Perplexity: Check dashboard at perplexity.ai
- Google: Check Google Cloud Console
- OpenAI: Check usage at platform.openai.com
- Tavily: Check dashboard at tavily.com

Adjust batch sizes or add delays between API calls if needed.

## Architecture Decisions

### Why Render Instead of Vercel?

- Vercel functions have a 60-second timeout (hobby) or 5-minute timeout (pro)
- URL processing can take 10+ minutes for multiple brands
- Render Background Workers have no timeout constraints
- Better for long-running, resource-intensive tasks

### Why One Unified Worker?

- Simpler deployment and monitoring
- Easier error handling and recovery
- Maintains transaction-like behavior for report generation
- Avoids complex state management across multiple services

### Error Resilience Strategy

- Individual URL failures don't fail the entire report
- Each phase (Perplexity, Google, URL processing) tracks success/failure independently
- Reports can be marked as complete even with partial failures
- Failed operations are logged but don't block progress
- Idempotent operations allow safe retries

## Performance

Expected processing times (per brand):
- Perplexity phase: ~2-3 minutes (15 prompts)
- Google AI Overview phase: ~2-3 minutes (15 prompts)  
- URL processing: ~5-15 minutes (depends on URL count)
- **Total**: ~10-20 minutes per brand

For multiple brands, add 5-second delay between each brand to avoid overwhelming APIs.

## Scaling

Current setup is designed for 1-10 brands. For more:

1. **Parallel Processing**: Modify `generateDailyReports` to process brands in parallel
2. **Multiple Workers**: Deploy multiple workers with load balancing
3. **Queue System**: Use Redis/BullMQ for job queuing
4. **Batch Optimization**: Increase batch sizes for API calls

## Cost Estimates

Render costs:
- Starter plan: $7/month (512MB RAM, 0.5 CPU)
- Standard plan: $25/month (2GB RAM, 1 CPU)

API costs (per report, 15 prompts):
- Perplexity: ~$0.15
- Google Custom Search: ~$0.05
- OpenAI (GPT-4o-mini): ~$0.10
- Tavily: ~$0.20
- **Total per report**: ~$0.50

For daily reports: ~$15/month per brand

## Support

For issues:
1. Check this README first
2. Review Render logs
3. Check Supabase data
4. Contact the development team

## License

Proprietary - BeVisible.ai


