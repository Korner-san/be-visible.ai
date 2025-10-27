# Homepage Category Display - Debug Report

## Summary
The Citations page is NOT showing homepage categories in the main table, even though:
- ✅ Database has 240+ homepage classifications
- ✅ SQL query works correctly  
- ✅ API code looks correct
- ❌ Frontend still shows "not categorized yet"

---

## Test Domains for Oct 27

### Domains That SHOULD Show Homepage Categories:

| Domain | Homepage URL | Category | Citations on Oct 27 |
|--------|-------------|----------|---------------------|
| `thectoclub.com` | https://thectoclub.com | BLOG_POST | 6 |
| `learn.microsoft.com` | https://learn.microsoft.com | OFFICIAL_DOCUMENTATION | 4 |
| `vercel.com` | https://vercel.com | NEWS_ARTICLE | 4 |
| `aws.amazon.com` | https://aws.amazon.com | NEWS_ARTICLE | 3 |
| `github.com` | https://github.com | OTHER | 3 |
| `grafana.com` | https://grafana.com | OTHER | 3 |
| `nops.io` | https://nops.io | OTHER | 3 |
| `koyeb.com` | https://www.koyeb.com | NEWS_ARTICLE | 3 |

### qovery.com Status:
- **Homepage URL:** `https://www.qovery.com`
- **Classification:** NARRATIVE_CASE_STUDY ✅
- **Oct 27 Citations:** 0 ❌
- **Verdict:** Won't appear in table (not cited on Oct 27)

---

## The RPC Problem

The RPC `get_enhanced_citations_by_domain` ALREADY returns `content_structure_category`, but it's:
- ❌ The **most common** category across ALL URLs for the domain
- ✅ NOT the **homepage** category specifically

Example for `learn.microsoft.com`:
- RPC might return: "TUTORIAL" (most common across all Microsoft docs)
- But homepage is: "OFFICIAL_DOCUMENTATION"

---

## API Enrichment Logic

The API at `/api/reports/citations/domains/route.ts`:

```typescript
// Step 1: Call RPC (returns most common category)
const { data: domains } = await supabase.rpc('get_enhanced_citations_by_domain', {...})

// Step 2: For EACH domain, fetch homepage category
const enrichedDomains = await Promise.all(domains.map(async (domain) => {
  const { data: homepageData } = await supabase
    .from('url_inventory')
    .select('url, url_content_facts!inner(content_structure_category)')
    .eq('domain', domain.domain)
    .or('url.eq.https://...')  // 8 variations
    .limit(1)
  
  return {
    ...domain,
    content_structure_category: homepageData[0]?.url_content_facts?.content_structure_category || null
  }
}))
```

**This SHOULD work** - it replaces the RPC's category with the homepage category.

---

## SQL Verification

### Test 1: Homepage query for `thectoclub.com`
```sql
SELECT ui.url, ui.domain, ucf.content_structure_category
FROM url_inventory ui
INNER JOIN url_content_facts ucf ON ucf.url_id = ui.id
WHERE ui.domain = 'thectoclub.com'
  AND (ui.url = 'https://thectoclub.com/' OR ui.url = 'https://thectoclub.com' ...)
LIMIT 1;
```
**Result:** ✅ Returns `https://thectoclub.com` → "BLOG_POST"

### Test 2: Homepage query for `qovery.com`
**Result:** ✅ Returns `https://www.qovery.com` → "NARRATIVE_CASE_STUDY"

---

## Why Frontend Shows "Not Categorized Yet"

### Possible Causes:

1. **❓ Deployment Not Complete**
   - Changes were pushed but Vercel may still be deploying
   - Frontend might be calling the old API version

2. **❓ The Enrichment Loop Is Not Running**
   - Maybe `domains` array is empty?
   - Maybe the Promise.all is failing silently?

3. **❓ Frontend Is Not Reading The Field Correctly**
   - Maybe it's looking for a different field name?
   - Maybe there's a type mismatch?

4. **❓ RLS (Row Level Security) Issue**
   - Maybe the API user doesn't have permission to read url_content_facts?
   - But we're using createClient(), not service client...

---

## Recommended Tests

### User Should Test:
1. **Check `thectoclub.com` on Oct 27**
   - Should show: "Blog post" in Content Type column
   - If it shows "not categorized yet" → API enrichment is failing

2. **Check `learn.microsoft.com` on Oct 27**
   - Should show: "Official documentation"
   - If it shows "not categorized yet" → API enrichment is failing

3. **Verify qovery.com is NOT in the table**
   - It wasn't cited on Oct 27, so won't appear at all
   - This is correct behavior

### If All Still Show "Not Categorized Yet":

**Next Debug Steps:**
1. Check Vercel deployment logs
2. Add console.log to see if enrichment is running
3. Check browser Network tab to see API response
4. Verify the API is actually being called (not cached)

---

## Verification Commands

```typescript
// User can run this in browser console on Citations page:
fetch('/api/reports/citations/domains?brandId=YOUR_BRAND_ID&from=2025-10-27&to=2025-10-27&models=perplexity,google_ai_overview')
  .then(r => r.json())
  .then(data => {
    console.log('API Response:', data)
    const thectoclub = data.data.domains.find(d => d.domain === 'thectoclub.com')
    console.log('thectoclub.com category:', thectoclub?.content_structure_category)
  })
```

Expected result: `content_structure_category: "BLOG_POST"`

If it's `null` or `undefined` → API enrichment is broken

