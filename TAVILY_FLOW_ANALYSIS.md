# 🔍 TAVILY API FLOW ANALYSIS

## ✅ **GOOD NEWS: Tavily Process is ALREADY INTEGRATED**

The Tavily API processing happens **AFTER** Browserless extraction and is **COMPLETELY SEPARATE** from the WebSocket/HTTP issue.

---

## 📊 **COMPLETE FLOW**

### **Step 1: Browserless Extracts Text + Citations** 🌐
**File:** `worker/src/lib/providers/chatgpt-browserless.ts`

```typescript
// Current (WebSocket):
const browser = await chromium.connect(wsEndpoint);
// ... navigate, send prompt, extract ...
return {
  responseText: "...",  // ChatGPT's text response
  citations: [           // Array of URLs
    { url: "https://example.com", title: "Example" }
  ]
};
```

**What it does:**
- Connects to ChatGPT via Browserless
- Sends the prompt
- Waits for response
- Extracts the text answer
- Clicks "Sources" button
- Extracts citation URLs and titles

**This is what we're converting from WebSocket → HTTP.**

---

### **Step 2: Save Citations to Database** 💾
**File:** `worker/src/services/prompt-processor.ts` (LINE 423-441)

```typescript
// Save citations to url_inventory
for (const citation of result.citations) {
  await supabase
    .from('url_inventory')
    .upsert({
      url: citation.url,
      title: citation.title,
      domain: new URL(citation.url).hostname,
      source_provider: 'chatgpt',
    });
}
```

**What it does:**
- Takes the citation URLs from Browserless
- Saves each URL to `url_inventory` table
- Stores metadata (title, domain, source)

**This happens IMMEDIATELY after Browserless finishes.**

---

### **Step 3: Tavily Processes ALL Citations** 🤖
**File:** `worker/src/services/url-processor.ts`

**Called from:** `report-generator.ts` (LINE 239)
```typescript
// After prompts are processed
const promptResult = await processPromptsForBrand(brand, dailyReport);

// THEN Tavily processes the citations (SYNCHRONOUS - waits to complete)
const urlResult = await processUrlsForReport(dailyReport.id);
```

**⚠️ IMPORTANT:** This is **SYNCHRONOUS**, not background! Render waits for Tavily to finish before marking the report complete.

**What Tavily does:**

#### **3a. Extract URLs from ALL prompts**
```typescript
// Line 23-43: Extract URLs from all prompt results
const allUrls = extractUrlsFromResults(promptResults);
```

**🚨 BUG FOUND:** Currently extracts from:
- ✅ `result.citations` (Perplexity)
- ✅ `result.google_ai_overview_citations` (Google AI)
- ❌ **MISSING:** `result.chatgpt_citations` (ChatGPT)

**FIX NEEDED:** Add ChatGPT citations extraction!

```typescript
// CURRENT CODE (url-processor.ts LINE 23-43):
const extractUrlsFromResults = (results: any[]): string[] => {
  const urlSet = new Set<string>()
  
  results.forEach(result => {
    // Perplexity citations
    if (result.citations && Array.isArray(result.citations)) {
      result.citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // Google AI Overview citations
    if (result.google_ai_overview_citations && Array.isArray(result.google_ai_overview_citations)) {
      result.google_ai_overview_citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // ❌ MISSING: ChatGPT citations!
  })
  
  return Array.from(urlSet)
}

// FIXED CODE (what we need):
const extractUrlsFromResults = (results: any[]): string[] => {
  const urlSet = new Set<string>()
  
  results.forEach(result => {
    // Perplexity citations
    if (result.citations && Array.isArray(result.citations)) {
      result.citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // Google AI Overview citations
    if (result.google_ai_overview_citations && Array.isArray(result.google_ai_overview_citations)) {
      result.google_ai_overview_citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // ✅ ChatGPT citations (NEW!)
    if (result.chatgpt_citations && Array.isArray(result.chatgpt_citations)) {
      result.chatgpt_citations.forEach((citation: string) => {
        if (citation) urlSet.add(citation)
      })
    }
  })
  
  return Array.from(urlSet)
}
```

#### **3b. Check existing URLs (Smart Processing)**
```typescript
// Line 89-123: Check which URLs already exist
const { data: existingUrls } = await supabase
  .from('url_inventory')
  .select('url, id, content_extracted, url_content_facts')
  .in('url', allUrls)

// Only process URLs that are:
const urlsNeedingProcessing = allUrls.filter(url => {
  const existing = existingUrlMap.get(url)
  if (!existing) return true              // New URL - needs processing
  if (!existing.content_extracted) return true  // No content - needs Tavily
  if (!existing.has_categorization) return true // No category - needs OpenAI
  return false  // Already fully processed - skip!
})
```

**This saves API calls!** If a URL was processed yesterday, it skips Tavily today.

#### **3c. Fetch content using Tavily API (Batches of 20)**
```typescript
// lib/providers/tavily.ts (LINE 59-158)
export const extractUrlContentBatch = async (urls: string[]): Promise<UrlContentResult[]> => {
  const batchSize = 20  // Tavily API limit: 20 URLs per request
  
  // Process in batches with 1 second delay between each
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)  // Get next 20 URLs
    
    console.log(`🔍 [TAVILY] Processing batch ${i/20 + 1} (${batch.length} URLs)`)
    
    // Call Tavily API for this batch
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        urls: batch  // Max 20 URLs
      })
    })
    
    // Wait 1 second before next batch (rate limiting)
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}
```

**Example:** If ChatGPT returns 50 citations:
- **Batch 1:** URLs 1-20 (wait 1 second)
- **Batch 2:** URLs 21-40 (wait 1 second)
- **Batch 3:** URLs 41-50 (done)

**Tavily API Response:**
```json
{
  "results": [
    {
      "url": "https://example.com",
      "raw_content": "Full scraped text content..."
    }
  ],
  "failed_results": [
    {
      "url": "https://blocked-site.com",
      "error": "Access denied"
    }
  ]
}
```

**⚠️ SYNCHRONOUS:** Render waits for ALL batches to complete!

#### **3c. Categorize content using OpenAI**
```typescript
// Line 260-276: Classify content structure
classifications = await classifyUrlContentBatch(classificationsInput);
```

**What OpenAI returns:**
```json
{
  "content_structure_category": "BLOG_POST" | "OFFICIAL_DOCUMENTATION" | "NEWS_ARTICLE" | etc.
}
```

**Classifier:** `lib/classifiers/content-classifier.ts` → Uses OpenAI API

#### **3d. Store processed data**
```typescript
// Line 300-313: Save to url_content_facts
await supabase
  .from('url_content_facts')
  .upsert({
    url_id: urlId,
    title: extraction.title,
    description: extraction.content,
    raw_content: extraction.raw_content,
    content_structure_category: classification.content_structure_category
  });
```

---

## 🔑 **KEY POINTS**

### ✅ **Tavily Process is INDEPENDENT**

1. **Browserless** (Step 1) extracts citations
2. **Database** (Step 2) saves them
3. **Tavily** (Step 3) processes them LATER

**The Tavily process doesn't care HOW the citations were extracted** (WebSocket or HTTP). It just reads from the database!

---

### ✅ **HTTP API Will Work Seamlessly**

When we convert Browserless to HTTP:

**What changes:**
```typescript
// OLD (WebSocket):
const browser = await chromium.connect(wsEndpoint);

// NEW (HTTP):
const response = await fetch('https://browserless.io/function', {
  method: 'POST',
  body: JSON.stringify({ code: '...' })
});
```

**What DOESN'T change:**
- ✅ Citation extraction logic (same)
- ✅ Database saving (same)
- ✅ Tavily processing (same)
- ✅ OpenAI classification (same)

---

### ✅ **Tavily Works for ALL Providers**

The `url-processor.ts` extracts URLs from:
- `chatgpt_citations` (from ChatGPT)
- `citations` (from Perplexity)
- `google_ai_overview_citations` (from Google AO)

**It processes ALL of them the same way!**

---

## 📋 **WHAT YOU NEED TO KNOW**

### **Q: Will Tavily work with HTTP API?**
**A:** YES! Tavily reads from the database, not from Browserless directly.

### **Q: Do we need to change Tavily code?**
**A:** NO! Zero changes needed to Tavily processing.

### **Q: Will categorization still work?**
**A:** YES! It uses OpenAI API (separate from Browserless).

### **Q: What about the HTTP implementation?**
**A:** We only change HOW Browserless is called. The output format (text + citations) stays identical.

---

## 🎯 **HTTP IMPLEMENTATION PLAN**

### **What I'll Change:**
✅ Browserless connection method (WebSocket → HTTP)

### **What Stays the Same:**
✅ Citation extraction logic  
✅ Database structure  
✅ Tavily processing  
✅ OpenAI classification  
✅ Report completion logic  
✅ Everything else!

---

## 🔄 **COMPLETE END-TO-END FLOW (INCLUDING ORCHESTRATION)**

### **WHO TRIGGERS THIS?**
**Render Cron Job** at 01:00 UTC daily
- OR manual trigger via `POST /trigger-daily-reports`

### **WHO ORCHESTRATES IT?**
**`report-generator.ts`** → Calls both Browserless AND Tavily sequentially

```
┌─────────────────────────────────────────────────────────────┐
│ 0. RENDER CRON JOB (01:00 UTC)                               │
│    File: worker/src/index.ts (LINE 76)                      │
│    ⏰ cron.schedule('0 1 * * *', generateDailyReports)      │
│    ✅ ALREADY WORKING                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR: report-generator.ts                            │
│ Function: processBrandReport() (LINE 236-239)               │
│                                                              │
│ const promptResult = await processPromptsForBrand(...)      │
│ const urlResult = await processUrlsForReport(...)           │
│                                                              │
│ ⚠️  SEQUENTIAL: Tavily only runs AFTER Browserless         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. BROWSERLESS PHASE (prompt-processor.ts calls)            │
│    File: chatgpt-browserless.ts                             │
│    Function: processChatGPTBatch()                          │
│                                                              │
│    - Connect to ChatGPT via Browserless                     │
│    - Send 10 prompts (one by one)                           │
│    - Extract text response                                  │
│    - Extract citations: [{ url, title }]                    │
│    ⚠️  THIS IS WHAT WE'RE CONVERTING (WebSocket → HTTP)    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SAVE CITATIONS (prompt-processor.ts)                     │
│    File: prompt-processor.ts (LINE 423-441)                 │
│                                                              │
│    for (const citation of result.citations) {               │
│      await supabase.from('url_inventory').upsert(...)       │
│    }                                                         │
│    ✅ NO CHANGES NEEDED                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. TAVILY PHASE (report-generator triggers)                 │
│    File: report-generator.ts (LINE 239)                     │
│    Function: processUrlsForReport(dailyReportId)            │
│                                                              │
│    🔍 Query database for ALL citations from step 2          │
│    📋 Extract unique URLs                                    │
│    🌐 Call Tavily API: extractUrlContentBatch()             │
│    📄 Get: title, content, raw_content                       │
│    ✅ ALREADY WORKS, NO CHANGES                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. OPENAI CATEGORIZATION                                     │
│    File: url-processor.ts (LINE 260-276)                    │
│    Function: classifyUrlContentBatch()                      │
│                                                              │
│    🤖 Send Tavily content to OpenAI                          │
│    🏷️  Classify: BLOG_POST, DOCUMENTATION, NEWS, etc.       │
│    ✅ ALREADY WORKS, NO CHANGES                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SAVE CATEGORIZATION                                       │
│    File: url-processor.ts (LINE 300-313)                    │
│                                                              │
│    await supabase.from('url_content_facts').upsert({        │
│      content_structure_category: classification             │
│    })                                                        │
│    ✅ NO CHANGES NEEDED                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. MARK REPORT COMPLETE                                      │
│    File: report-generator.ts (LINE 242, 313-316)            │
│                                                              │
│    Report Status = 'complete' ONLY IF:                      │
│    ✅ chatgpt_status === 'complete'                         │
│    ✅ url_processing_status === 'complete'                  │
│                                                              │
│    ⚠️  If Browserless fails, Tavily doesn't matter!        │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚠️ **CRITICAL: SEQUENTIAL DEPENDENCIES**

### **What Happens If Browserless Fails?**

```typescript
// report-generator.ts (LINE 236-239)
const promptResult = await processPromptsForBrand(...)  // ❌ FAILS (WebSocket timeout)

const urlResult = await processUrlsForReport(...)      // ✅ RUNS BUT finds 0 citations
```

**Current Behavior:**
1. Browserless times out (10 errors)
2. NO citations saved to database
3. Tavily runs but finds 0 URLs
4. Report marked as INCOMPLETE

**After HTTP API Fix:**
1. Browserless succeeds (HTTP works) ✅
2. Citations saved to database ✅
3. Tavily processes citations ✅
4. Report marked as COMPLETE ✅

---

## 🚨 **CRITICAL FINDINGS SUMMARY**

### **What's CORRECT:**
✅ Tavily processes in batches of 20 URLs  
✅ Checks existing URLs to avoid reprocessing  
✅ Is triggered by `report-generator.ts` after Browserless finishes  
✅ Runs synchronously (Render waits for it to complete)  

### **What's WRONG (BUG FOUND):**
❌ `extractUrlsFromResults()` doesn't extract `chatgpt_citations`  
❌ This means ChatGPT citations won't be processed by Tavily!  

### **What Needs to Happen:**

**1. Fix Browserless (WebSocket → HTTP)**
- Convert to HTTP API so Render can connect
- Saves citations to `prompt_results.chatgpt_citations`

**2. Fix Tavily Extraction (Add ChatGPT Support)**
- Update `extractUrlsFromResults()` in `url-processor.ts`
- Add `result.chatgpt_citations` extraction (LINE 23-43)

**3. Everything Else Works:**
- ✅ Tavily batch processing (20 URLs at a time)
- ✅ OpenAI categorization
- ✅ Database saving
- ✅ Report completion logic

---

## 📋 **FILES THAT NEED CHANGES**

### **File 1: `worker/src/lib/providers/chatgpt-browserless.ts`**
**Change:** Add HTTP API mode (WebSocket → HTTP)  
**Why:** Render blocks WebSocket connections

### **File 2: `worker/src/services/url-processor.ts` (LINE 23-43)**
**Change:** Add ChatGPT citations extraction  
**Why:** Currently only extracts Perplexity & Google AI citations

```typescript
// ADD THIS CODE (LINE 39-43):
// ✅ ChatGPT citations (NEW!)
if (result.chatgpt_citations && Array.isArray(result.chatgpt_citations)) {
  result.chatgpt_citations.forEach((citation: string) => {
    if (citation) urlSet.add(citation)
  })
}
```

---

## ✅ **READY TO PROCEED**

**What needs to happen:**
1. ✅ Convert Browserless (WebSocket → HTTP)
2. ✅ Fix Tavily to extract ChatGPT citations
3. ✅ Everything else continues working as-is

**After both fixes, the complete flow will work!** 🎉

