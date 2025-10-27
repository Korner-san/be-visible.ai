# Content Classification Prompt - Complete Analysis

## ✅ Hover Text Fix Deployed

**Status:** Committed `7c8afd0` and pushed to production

**Change:** Removed the redundant line "This content type represents the classification of the domain's homepage." from individual domain row hover tooltips. It now only appears in the header tooltip.

---

## 📋 Classification System Overview

### **TWO Different Classifiers Found:**

Your codebase has **TWO separate content classification implementations**:

1. **`lib/classifiers/content-classifier.ts`** (Frontend/Next.js)
2. **`worker/src/lib/classifiers/content-classifier.ts`** (Worker - **THIS ONE IS ACTIVE**)

The **Worker version** is the one actually being used during daily report generation and URL processing.

---

## 🤖 Active Classification Prompt (Worker Version)

### **File Path:**
```
worker/src/lib/classifiers/content-classifier.ts
```

### **Model Used:**
- `gpt-4o-mini`
- Temperature: `0.2`
- Max Tokens: `500`

### **System Message:**
```
You are a content classification expert. Classify web content into predefined categories based on URL, title, and content snippet.
```

### **User Prompt (Generated per Batch):**

```
Classify the following web content into one of these categories: OFFICIAL_DOCUMENTATION, TUTORIAL, COMPARISON_REVIEW, BLOG_POST, NEWS_ARTICLE, FORUM_DISCUSSION, SOCIAL_MEDIA, VIDEO_CONTENT, ACADEMIC_RESEARCH, OTHER

For each URL, respond with just the category name on a single line.

URL 1:
URL: [url]
Title: [title]
Description: [description - first 200 chars]
Content Snippet: [contentSnippet - first 300 chars]

URL 2:
...

Respond with exactly [N] lines, one category per line:
```

### **Categories (10 Total):**
```typescript
const CONTENT_CATEGORIES = [
  'OFFICIAL_DOCUMENTATION',
  'TUTORIAL',
  'COMPARISON_REVIEW',
  'BLOG_POST',
  'NEWS_ARTICLE',
  'FORUM_DISCUSSION',
  'SOCIAL_MEDIA',
  'VIDEO_CONTENT',
  'ACADEMIC_RESEARCH',
  'OTHER'
]
```

### **Batch Processing:**
- **Batch Size:** 10 URLs per request
- **Sequential Processing:** Batches processed one at a time
- **Delay Between Batches:** 500ms
- **Delay Between Individual URLs:** None (within batch)

### **Response Parsing Logic:**

1. **Split response by newlines**
2. **For each line:**
   - Trim whitespace
   - Convert to uppercase
   - **Match against CONTENT_CATEGORIES** using `line.includes(cat)`
   - **Default fallback:** `OFFICIAL_DOCUMENTATION`
3. **Confidence:** Fixed at `0.8` for all classifications
4. **If batch fails entirely:** Return `OFFICIAL_DOCUMENTATION` with `0.5` confidence

### **Decision Logic:**
- **Simple string matching** - no scoring, no ranking
- **First match wins** (checks categories in order)
- **No few-shot examples**
- **No confidence scoring from GPT** (hardcoded values)

---

## 🆚 Comparison: Frontend Classifier vs Worker Classifier

| Feature | Frontend (`lib/`) | Worker (`worker/src/`) **ACTIVE** |
|---------|-------------------|-----------------------------------|
| **Categories** | 8 categories (New system) | 10 categories (Old system) |
| **System Prompt** | Detailed taxonomy with descriptions | Simple one-line instruction |
| **User Prompt** | XML-tagged format with full context | Plain text list format |
| **Content Limit** | 2000 chars | 300 chars |
| **Batch Size** | 1 URL per request | 10 URLs per request |
| **Response Format** | JSON object | Plain text lines |
| **Temperature** | 0.1 | 0.2 |
| **Fallback** | `DOCS_PAGE` | `OFFICIAL_DOCUMENTATION` |
| **Processing** | Sequential with 200ms delay | Batched with 500ms delay |

---

## 📊 Current Worker Categories vs Frontend Display

### **MISMATCH ISSUE:**

The **Worker** uses these 10 categories:
```
OFFICIAL_DOCUMENTATION
TUTORIAL
COMPARISON_REVIEW
BLOG_POST
NEWS_ARTICLE
FORUM_DISCUSSION
SOCIAL_MEDIA
VIDEO_CONTENT
ACADEMIC_RESEARCH
OTHER
```

But the **Frontend** expects these 8 categories (New System):
```
QA_BLOCK
DATA_DRIVEN_REPORT
COMPARISON_TABLE
CASE_STUDY
DOCS_PAGE
FORUM_THREAD
TUTORIAL_STEP_BY_STEP
LONG_FORM_ARTICLE
```

**This is why you see categories like:**
- `BLOG_POST` → Displays as "Blog post" (fallback formatting)
- `NEWS_ARTICLE` → Displays as "News article" (fallback formatting)
- `OFFICIAL_DOCUMENTATION` → Displays as "Official documentation" (fallback formatting)

These are **NOT part of the new 8-category system**, but the frontend handles them gracefully with the fallback `formatCategoryLabel()` function.

---

## 🔍 Current Prompt Quality Assessment

### **Strengths:**
✅ Simple and fast (batch processing)
✅ Low token usage (300 char snippets)
✅ Reliable fallback mechanism

### **Weaknesses:**
❌ **Very short content snippets** (300 chars) - may miss important context
❌ **No structured taxonomy** - GPT doesn't understand the purpose of each category
❌ **No few-shot examples** - GPT has to guess what each category means
❌ **Simple string matching** - could miss variations in GPT's response
❌ **Fixed confidence scores** - not based on actual classification certainty
❌ **Category mismatch** - Uses old 10-category system instead of new 8-category system

### **Example Current Prompt:**
```
Classify the following web content into one of these categories: OFFICIAL_DOCUMENTATION, TUTORIAL, COMPARISON_REVIEW, BLOG_POST, NEWS_ARTICLE, FORUM_DISCUSSION, SOCIAL_MEDIA, VIDEO_CONTENT, ACADEMIC_RESEARCH, OTHER

For each URL, respond with just the category name on a single line.

URL 1:
URL: https://thectoclub.com/tools/best-deployment-software
Title: Best Deployment Software
Description: Discover the top deployment software solutions for 2024. Compare features, pricing, and use cases to find the best tool for your team.
Content Snippet: Best Deployment Software for 2024\n\nFinding the right deployment tool is critical for modern DevOps teams. Here are our top picks:\n\n1. Qovery - Cloud deployment platform\n2. Vercel - For frontend applications\n3. Heroku - PaaS solution...

Respond with exactly 1 lines, one category per line:
```

**GPT's response might be:**
```
COMPARISON_REVIEW
```

---

## 🎯 Recommendations for Improvement

### **Option 1: Align Worker with Frontend (Recommended)**
Update `worker/src/lib/classifiers/content-classifier.ts` to:
1. Use the **new 8-category system** (QA_BLOCK, DATA_DRIVEN_REPORT, etc.)
2. Include **detailed category descriptions** in the system prompt
3. Add **few-shot examples** for each category
4. Increase **content snippet to 1000-1500 chars**
5. Use **JSON response format** for structured output

### **Option 2: Keep Batch Processing, Improve Prompt**
1. Add category definitions to the prompt
2. Request confidence scores from GPT
3. Include 2-3 few-shot examples
4. Use structured JSON output

### **Option 3: Hybrid Approach**
1. Keep current 10 categories but add clear definitions
2. Map old categories to new categories in frontend
3. Improve prompt with examples and longer snippets

---

## 📝 Files to Modify

If you want to improve the classification:

1. **`worker/src/lib/classifiers/content-classifier.ts`**
   - Lines 20-31: Category definitions
   - Lines 61-73: System and user messages
   - Lines 106-123: Prompt building logic

2. **Optional: Create category mapping**
   - Map old 10 categories → new 8 categories
   - Ensure consistent display across app

---

## ✅ Summary

- **Active Classifier:** `worker/src/lib/classifiers/content-classifier.ts`
- **Prompt Type:** Simple batch classification with minimal context
- **Categories:** 10 old-system categories (not the new 8)
- **Model:** `gpt-4o-mini` at temperature 0.2
- **Content Limit:** 300 characters (very short!)
- **No Few-Shot Examples:** GPT has to infer category meanings
- **Decision Logic:** Simple string matching, first match wins

**Next Steps:** Let me know if you want me to:
1. Upgrade to the new 8-category system
2. Improve the current prompt with better descriptions
3. Add few-shot examples
4. Increase content snippet length
5. All of the above

