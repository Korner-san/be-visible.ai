# 🎯 RENDER + HTTP API MIGRATION PLAN

## 📊 CURRENT STATE ANALYSIS (via Render MCP)

### ✅ WHAT'S WORKING ON RENDER

**Service Configuration:**
- **Name:** be-visible.ai
- **Type:** Web Service (srv-d44d10ili9vc73e921i0)
- **URL:** https://be-visible-ai.onrender.com
- **Status:** Live and Running ✅
- **Region:** Oregon
- **Root Directory:** `worker` ✅
- **Build Command:** `npm install; npm run build` ✅
- **Start Command:** `npm run start` ✅
- **Port:** 10000
- **Auto-deploy:** Enabled on `main` branch

**Infrastructure Working:**
- ✅ Service builds successfully
- ✅ Node.js 18.20.8 running
- ✅ Express server starts on port 10000
- ✅ Cron job executes daily at 01:00 UTC
- ✅ Database connections to Supabase work
- ✅ Report generation logic executes
- ✅ All environment variables configured

**Latest Cron Execution (Nov 4, 2025 01:01 UTC):**
```
✅ [WORKER] Cron job triggered
📊 Found 1 eligible users: korenk878@gmail.com
📊 Found 1 brands to process: Browserless
🚀 [CHATGPT] Starting ChatGPT pass via Browserless
```

### ❌ WHAT'S FAILING

**ChatGPT via WebSocket:**
- Status: **10 attempted, 0 ok, 10 errors**
- Error: `browserType.connect: Timeout 60000ms exceeded`
- Root Cause: Render blocks outbound WebSocket connections
- Impact: Reports marked as INCOMPLETE

**Current Results:**
```json
{
  "chatgpt": { "attempted": 10, "ok": 0, "noResult": 0, "errors": 10 },
  "perplexity": { "attempted": 0, "ok": 0, "noResult": 0, "errors": 0 },
  "googleAIOverview": { "attempted": 0, "ok": 0, "noResult": 0, "errors": 0 }
}
```

---

## 🔄 COMPLETE ORCHESTRATION FLOW

### **How the Entire System Works**

```
RENDER CRON (01:00 UTC)
    ↓
report-generator.ts
    ↓
    ├─→ processPromptsForBrand()
    │       ↓
    │   1. BROWSERLESS extracts citations ⚠️ FAILING (WebSocket blocked)
    │       ↓
    │   2. SAVE citations to database
    │
    ├─→ processUrlsForReport()
    │       ↓
    │   3. TAVILY scrapes citation content 🔍 (reads from database)
    │       ↓
    │   4. OPENAI categorizes content 🤖
    │       ↓
    │   5. SAVE categorization
    │
    └─→ updateCompletionStatus()
            ↓
        Mark report COMPLETE only if:
        ✅ chatgpt_status === 'complete'
        ✅ url_processing_status === 'complete'
```

**Critical Point:** Tavily (Step 3) reads citations FROM DATABASE. It doesn't directly interact with Browserless. So when we fix Browserless (HTTP), Tavily automatically works!

---

## 🔧 SOLUTION: CONVERT TO BROWSERLESS HTTP API

### Current Approach (WebSocket - Doesn't Work on Render)

```typescript
// worker/src/lib/providers/chatgpt-browserless.ts (LINE 132-134)
const wsEndpoint = `wss://production-sfo.browserless.io/chromium/stealth?token=${token}`;
const browser = await chromium.connect(wsEndpoint, {
  timeout: 60000
});
```

**Problem:** Render blocks outbound WebSocket (`wss://`) connections.

**Impact:**
- ❌ No citations extracted from ChatGPT
- ❌ No URLs saved to database
- ❌ Tavily has nothing to process
- ❌ Report marked as INCOMPLETE

---

### New Approach (HTTP API - Will Work on Render)

```typescript
// New function using Browserless HTTP API
const response = await fetch('https://production-sfo.browserless.io/function', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    code: `
      // Our existing Playwright code wrapped in a function
      async function main() {
        const { chromium } = require('playwright');
        const browser = await chromium.launch();
        const page = await browser.newPage();
        
        // Set cookies
        await page.context().addCookies([...cookies]);
        
        // Navigate to ChatGPT
        await page.goto('https://chatgpt.com');
        
        // Send prompt
        await page.fill('textarea', prompt);
        await page.press('textarea', 'Enter');
        
        // Wait for response
        await page.waitForSelector('[data-message-author-role="assistant"]');
        
        // Extract text
        const text = await page.textContent('...');
        
        // Extract citations
        await page.click('button:has-text("Sources")');
        const citations = await page.$$eval('...', els => ...);
        
        await browser.close();
        return { text, citations };
      }
      
      module.exports = main();
    `
  })
});

const result = await response.json();
```

**Benefits:**
- ✅ Uses HTTPS (not WebSocket) - Render allows this
- ✅ Same Playwright logic - just wrapped differently
- ✅ Same citation extraction - proven to work locally
- ✅ No platform restrictions

**Impact on Tavily:**
- ✅ Browserless HTTP saves citations to database
- ✅ Tavily reads from database (unchanged)
- ✅ OpenAI categorization works (unchanged)
- ✅ **Everything downstream just works!**

---

## 🔗 HOW TAVILY INTEGRATES (ALREADY WORKING)

### **Citation Flow After HTTP Fix**

```typescript
// 1. Browserless HTTP extracts citations
const result = await processChatGPTBatchHTTP(...);
// result.citations = [{ url, title }, ...]

// 2. prompt-processor.ts saves them (LINE 423-441)
for (const citation of result.citations) {
  await supabase.from('url_inventory').upsert({
    url: citation.url,
    title: citation.title,
    domain: new URL(citation.url).hostname,
    source_provider: 'chatgpt'
  });
}

// 3. report-generator.ts calls Tavily (LINE 239)
const urlResult = await processUrlsForReport(dailyReport.id);

// Inside url-processor.ts:
// 3a. Read citations from database
const { data: promptResults } = await supabase
  .from('prompt_results')
  .select('citations')
  .eq('daily_report_id', dailyReportId);

// 3b. Extract URLs
const allUrls = extractUrlsFromResults(promptResults);

// 3c. Call Tavily API
const extractedContent = await extractUrlContentBatch(allUrls);
// Returns: [{ url, title, content, raw_content }]

// 3d. Categorize with OpenAI
const classifications = await classifyUrlContentBatch(extractedContent);
// Returns: [{ content_structure_category: 'BLOG_POST' }]

// 3e. Save to url_content_facts
await supabase.from('url_content_facts').upsert({
  url_id: urlId,
  raw_content: extraction.raw_content,
  content_structure_category: classification.content_structure_category
});
```

**Key Point:** Tavily is ALREADY integrated and reads from Supabase. Once Browserless HTTP saves citations to the database, Tavily automatically processes them. **No changes needed to Tavily code!**

---

## 📋 FILES TO MODIFY

### 1. `worker/src/lib/providers/chatgpt-browserless.ts` (Browserless Fix)

**Changes Needed:**
- ✅ Keep existing WebSocket function as `processChatGPTBatchWebSocket()` (for future use)
- ✅ Create new `processChatGPTBatchHTTP()` function
- ✅ Add environment variable `BROWSERLESS_MODE=http` or `websocket`
- ✅ Main function switches between HTTP/WebSocket based on env var

**Line References:**
- Line 117-191: `connectToBrowserless()` - Keep for WebSocket
- Line 253-528: `processChatGPTBatch()` - Duplicate as HTTP version
- Line 193-251: `extractResponseAndCitations()` - Reuse in HTTP version

---

### 2. `worker/src/services/url-processor.ts` (Tavily Fix - BUG FOUND!)

**🚨 CRITICAL BUG:** Tavily doesn't extract ChatGPT citations!

**Current Code (LINE 23-43):**
```typescript
const extractUrlsFromResults = (results: any[]): string[] => {
  const urlSet = new Set<string>()
  
  results.forEach(result => {
    // Extract from Perplexity citations
    if (result.citations && Array.isArray(result.citations)) {
      result.citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // Extract from Google AI Overview citations
    if (result.google_ai_overview_citations && Array.isArray(result.google_ai_overview_citations)) {
      result.google_ai_overview_citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // ❌ MISSING: ChatGPT citations!
  })
  
  return Array.from(urlSet)
}
```

**Fixed Code (ADD THIS):**
```typescript
// ✅ Add ChatGPT citations extraction (after line 39)
if (result.chatgpt_citations && Array.isArray(result.chatgpt_citations)) {
  result.chatgpt_citations.forEach((citation: string) => {
    if (citation) urlSet.add(citation)
  })
}
```

**Why:** `chatgpt_citations` is stored as an array of strings (URLs), not objects like Perplexity/Google AI.

---

### 3. `worker/src/services/prompt-processor.ts`

**Changes Needed:**
- ✅ No changes needed! Already calls `processChatGPTBatch()`
- ✅ HTTP/WebSocket switch handled internally in provider

**Current Code (LINE 313):**
```typescript
const results = await processChatGPTBatch(
  dailyReport.id,
  dailyReport.brand_id,
  prompts,
  competitors,
  account
);
```

This stays the same - the provider handles HTTP vs WebSocket internally.

---

### 4. Add Environment Variable on Render

**Via Render Dashboard (Already Added ✅):**
```
BROWSERLESS_MODE=http
```

Or keep both modes available:
- `http` - Use HTTP API (for Render/Railway)
- `websocket` - Use WebSocket (for Fly.io/local dev)

---

## 🎯 IMPLEMENTATION PLAN

### Phase 1: Fix Tavily ChatGPT Extraction (2 min) - CRITICAL!

**File:** `worker/src/services/url-processor.ts` (LINE 39)

```typescript
// Add after line 39 (after Google AI citations):
// ✅ ChatGPT citations (NEW!)
if (result.chatgpt_citations && Array.isArray(result.chatgpt_citations)) {
  result.chatgpt_citations.forEach((citation: string) => {
    if (citation) urlSet.add(citation)
  })
}
```

**Why First:** Even if Browserless works, Tavily won't process the citations without this fix!

---

### Phase 2: Create HTTP API Function (20 min)

1. Read existing `processChatGPTBatch()` function
2. Extract the Playwright logic
3. Wrap it in Browserless `/function` HTTP call
4. Handle response parsing
5. Keep same return structure

---

### Phase 3: Add Mode Switching (5 min)

```typescript
export async function processChatGPTBatch(...) {
  const mode = process.env.BROWSERLESS_MODE || 'http';
  
  if (mode === 'websocket') {
    return processChatGPTBatchWebSocket(...);
  } else {
    return processChatGPTBatchHTTP(...);
  }
}
```

---

### Phase 4: Test Locally (10 min)

```bash
cd worker
BROWSERLESS_MODE=http npm run dev
```

---

### Phase 5: Deploy to Render (5 min)

1. `BROWSERLESS_MODE=http` already set on Render ✅
2. Push to GitHub
3. Auto-deploy triggers
4. Check logs via Render MCP

---

### Phase 6: Verify Complete Flow (10 min)

Watch next cron execution (01:00 UTC) or manually trigger:
```bash
curl -X POST https://be-visible-ai.onrender.com/trigger-daily-reports
```

**Expected logs:**
```
✅ [CHATGPT] Batch complete: 10 ok, 0 errors, 30 citations
✅ [TAVILY] Processing 30 URLs in 2 batches
✅ [TAVILY] Batch 1/2 complete - 20 successful
✅ [TAVILY] Batch 2/2 complete - 10 successful
✅ [OPENAI] Classified 30 URLs
✅ Report Status: COMPLETE
```

---

## ✅ SUCCESS CRITERIA

After HTTP API implementation, we should see:

```
🚀 [CHATGPT] Starting ChatGPT pass via Browserless (HTTP mode)
ℹ️ 📊 Loading ChatGPT account...
✅ ✅ Loaded: Koren Klein (ChatGPT Plus)
🌐 [HTTP] Sending function to Browserless...
✅ [HTTP] Function executed successfully
📊 [CHATGPT] Prompt 1/10 processed: 250 characters, 3 citations
📊 [CHATGPT] Prompt 2/10 processed: 180 characters, 2 citations
...
✅ [CHATGPT] Batch complete: 10 ok, 0 errors
```

**Final Report Status:**
```json
{
  "chatgpt": { "attempted": 10, "ok": 10, "noResult": 0, "errors": 0 },
  "status": "complete"
}
```

---

## 🔑 KEY DECISIONS MADE

1. **Keep both modes** (WebSocket + HTTP) for flexibility
2. **Use Render Web Service** (already configured and working)
3. **HTTP as default** (set via `BROWSERLESS_MODE=http`)
4. **Reuse existing logic** (same Playwright code, different transport)
5. **No database changes** (schema already supports ChatGPT data)

---

## 📦 WHAT'S READY TO USE

- ✅ Render service fully configured
- ✅ Supabase database migrated
- ✅ Cron job scheduling working
- ✅ Environment variables set
- ✅ User accounts configured (korenk878@gmail.com)
- ✅ 10 active prompts ready
- ✅ ChatGPT account credentials stored

**Only Missing:** HTTP API implementation in `chatgpt-browserless.ts`

---

## ⏱️ ESTIMATED TIME

- **Implementation:** 30 minutes
- **Testing:** 15 minutes
- **Deployment:** 5 minutes
- **Verification:** 10 minutes

**Total:** ~1 hour to working system

---

## 🚀 SUMMARY: WHAT WE'RE DOING TOGETHER

### **Your Question Was Right! ✅**

You asked: *"Something needs to activate the API calls flow, something like render am I right?"*

**Answer:** YES! Here's what activates Tavily:

1. **Render Cron** (01:00 UTC) triggers `generateDailyReports()`
2. **report-generator.ts** orchestrates the process:
   - Calls `processPromptsForBrand()` → Browserless extracts citations
   - Calls `processUrlsForReport()` → **This activates Tavily!**
3. **Tavily reads citations** from the database (saved by Browserless)
4. **OpenAI categorizes** the content Tavily scraped
5. **Report marked complete** when both Browserless AND Tavily succeed

### **Current Problem**

```
Browserless (WebSocket) → ❌ FAILS → No citations → Tavily finds 0 URLs
```

### **After HTTP Migration**

```
Browserless (HTTP) → ✅ SUCCESS → Citations saved → Tavily processes them → Report complete
```

### **What Changes?**

**2 files need changes:**
1. `worker/src/lib/providers/chatgpt-browserless.ts` - Add HTTP mode
2. `worker/src/services/url-processor.ts` - Fix Tavily to extract ChatGPT citations

**Nothing else changes:**
- ✅ Render orchestration (stays the same)
- ✅ Database saving (stays the same)
- ✅ Tavily batch processing (stays the same)
- ✅ OpenAI categorization (stays the same)

**🚨 CRITICAL BUG FOUND:**  
Tavily's `extractUrlsFromResults()` doesn't extract `chatgpt_citations`! Without this fix, even if Browserless works, Tavily won't process the citations.

### **Mode Switching**

```typescript
// Environment variable on Render
BROWSERLESS_MODE=http

// In chatgpt-browserless.ts
export async function processChatGPTBatch(...) {
  const mode = process.env.BROWSERLESS_MODE || 'http';
  
  if (mode === 'websocket') {
    // Use WebSocket (for Fly.io / local dev)
    return processChatGPTBatchWebSocket(...);
  } else {
    // Use HTTP API (for Render)
    return processChatGPTBatchHTTP(...);
  }
}
```

You've already added `BROWSERLESS_MODE=http` to Render environment variables ✅

---

## 🎯 READY TO START IMPLEMENTATION?

**When you say "go", I will:**

1. ✅ **FIX TAVILY BUG FIRST** - Add `chatgpt_citations` extraction to `url-processor.ts`
2. ✅ Read existing `chatgpt-browserless.ts` code
3. ✅ Create `processChatGPTBatchHTTP()` function (wraps Playwright in HTTP request)
4. ✅ Keep existing WebSocket code (rename to `processChatGPTBatchWebSocket()`)
5. ✅ Add mode switching logic
6. ✅ Push to GitHub → Render auto-deploys
7. ✅ Monitor logs to verify complete flow (Browserless → Tavily → OpenAI → Complete)

**Critical:** Both fixes are required for reports to work!

---

## 📝 YOUR NOTES / QUESTIONS

Add any concerns or questions here before we start...

