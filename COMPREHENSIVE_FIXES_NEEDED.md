# Comprehensive Fix List for Oct 26 Issues

## ✅ COMPLETED FIXES

### 1. Fixed Stuck Reports (Oct 22-24)
**Status:** ✅ FIXED in Supabase
**Problem:** Reports from Oct 22-24 had `status='running'` even though they completed with URLs classified
**Solution:** Updated to `status='completed'` - these now appear in frontend queries
**Impact:** Content and citations pages now show data from Oct 22-24

---

## 🐛 ISSUES REQUIRING CODE FIXES

### 2. Date Inconsistency (7 days > 30 days)
**Status:** 🔴 CRITICAL BUG
**Problem:** Last 7 days shows 37 URLs, Last 30 days shows 31 URLs (impossible!)
**Root Cause:** URL deduplication is broken - URLs repeat across multiple days

**Example from data:**
- `https://www.webdevelopmentgroup.com/insights/best-tools-for-web-development/` appears on:
  - Oct 24 (6 times!)
  - Oct 23 (4 times)
  - Oct 22 (4 times)
  - Oct 21 (4 times)
  - Oct 20 (6 times!)

**The Fix Needed:**
```typescript
// In app/api/reports/content/categories/route.ts
// Current logic aggregates by citations, NOT unique URLs
// Must use DISTINCT ui.url or Set() for deduplication

// BAD (current):
categoryStats[category].count++ // Counts all citations
categoryStats[category].uniqueUrls.add(url) // But doesn't use this for percentage!

// GOOD (needed):
// Use uniqueUrls.size for the count, not raw citation count
```

**Verification Query:**
```sql
-- Should show cumulative growth, never decrease
SELECT 
  'Last 7 days' as range,
  COUNT(DISTINCT ui.url) as unique_urls
FROM url_content_facts ucf
JOIN url_inventory ui ON ucf.url_id = ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date >= '2025-10-20' 
  AND dr.report_date <= '2025-10-26'
  AND dr.status = 'completed'
  AND ucf.content_structure_category = 'LONG_FORM_ARTICLE'
UNION ALL
SELECT 
  'Last 30 days' as range,
  COUNT(DISTINCT ui.url) as unique_urls
FROM url_content_facts ucf
JOIN url_inventory ui ON ucf.url_id = ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date >= '2025-09-27' 
  AND dr.report_date <= '2025-10-26'
  AND dr.status = 'completed'
  AND ucf.content_structure_category = 'LONG_FORM_ARTICLE';
```

---

### 3. Citations Page Empty for Oct 26
**Status:** 🔴 NEEDS INVESTIGATION
**Problem:** Citations page shows "No citation data available"
**Possible Causes:**
1. Date format mismatch (frontend sends `2025-10-26`, API expects different format)
2. Model filter not including correct providers
3. Brand ID mismatch

**Verification Needed:**
- Check browser console for API request URL
- Check Vercel logs for what filters the API receives
- Verify the API response has data

**Database Proof (Oct 26 HAS data):**
```sql
-- This returns 30 prompt results, 149 citations
SELECT COUNT(*) FROM prompt_results pr
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26' AND dr.status = 'completed';
-- Result: 30 rows

SELECT COUNT(DISTINCT uc.url_id) FROM url_citations uc
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26' AND dr.status = 'completed';
-- Result: 149 URLs
```

---

### 4. Visibility Page Empty for Oct 26
**Status:** 🔴 NEEDS INVESTIGATION
**Problem:** All fields show 0 or N/A
**Possible Causes:**
1. Visibility API not querying correctly
2. Missing aggregation logic for `brand_mentioned`, `position`, `sentiment`
3. Same date/filter issues as Citations page

**Files to Check:**
- `app/api/reports/visibility/route.ts`
- Any other visibility-related API routes

---

### 5. Domain Content Type Not Showing in Citations Table
**Status:** 🟡 SCHEMA/LOGIC ISSUE
**Problem:** "Content Type" column is always empty in the main domain table
**Expected:** Should show the domain's homepage content category

**Database Investigation:**
```sql
-- Check if domain category is stored
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'url_content_facts'
  AND column_name LIKE '%domain%';

-- Expected columns:
-- - domain_category (for homepage classification)

-- If domain_category exists, we need to join it:
SELECT 
  ui.domain,
  homepage_ucf.content_structure_category as domain_content_type,
  COUNT(DISTINCT ui.url) as url_count
FROM url_inventory ui
LEFT JOIN url_inventory homepage_ui ON homepage_ui.domain = ui.domain AND homepage_ui.url LIKE '%://' || ui.domain || '/%' AND homepage_ui.url NOT LIKE '%://' || ui.domain || '/%/%'
LEFT JOIN url_content_facts homepage_ucf ON homepage_ucf.url_id = homepage_ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26'
GROUP BY ui.domain, homepage_ucf.content_structure_category
LIMIT 5;
```

**The Fix:**
- `app/api/reports/citations/domains/route.ts` - Add domain homepage category to query
- `components/CitationsDomainsTable.tsx` - Display the domain category in the Content Type column

---

### 6. Remove Domain Homepage from URL Toggle
**Status:** 🟡 UX IMPROVEMENT
**Problem:** When clicking a domain to see its URLs, the homepage is included in the list
**Expected:** Homepage should NOT appear in the URL list (it's already represented by the domain row)

**The Fix:**
- `app/api/reports/citations/urls/route.ts` - Add filter: `WHERE ui.url NOT LIKE 'https://' || domain || '/' AND ui.url NOT LIKE 'http://' || domain || '/'`
- Or use a column like `is_homepage` if it exists

---

## 📊 DATA VERIFICATION QUERIES

### Check Domain Categories
```sql
-- See if domain categories are stored
SELECT 
  ui.domain,
  ui.url,
  ucf.content_structure_category,
  LENGTH(ui.url) - LENGTH(REPLACE(ui.url, '/', '')) as slash_count
FROM url_inventory ui
JOIN url_content_facts ucf ON ucf.url_id = ui.id
WHERE ui.domain = 'qovery.com'
ORDER BY slash_count ASC
LIMIT 5;

-- If slash_count = 3, it's likely a homepage (https://domain.com/)
```

### Editorial URLs - Last 7 vs 30 Days
```sql
-- UNIQUE URLs in last 7 days
SELECT COUNT(DISTINCT ui.url)
FROM url_content_facts ucf
JOIN url_inventory ui ON ucf.url_id = ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date >= CURRENT_DATE - INTERVAL '7 days'
  AND dr.status = 'completed'
  AND ucf.content_structure_category = 'LONG_FORM_ARTICLE';
-- Expected: ~55 (sum of unique URLs, deduplicated)

-- UNIQUE URLs in last 30 days
SELECT COUNT(DISTINCT ui.url)
FROM url_content_facts ucf
JOIN url_inventory ui ON ucf.url_id = ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date >= CURRENT_DATE - INTERVAL '30 days'
  AND dr.status = 'completed'
  AND ucf.content_structure_category = 'LONG_FORM_ARTICLE';
-- Expected: ~100+ (more than 7 days, always!)
```

---

## 🎯 PRIORITY ORDER

### Immediate (Deploy Today):
1. ✅ Fix stuck reports (DONE)
2. 🔴 Fix date inconsistency (URL deduplication)
3. 🔴 Fix Citations page empty
4. 🔴 Fix Visibility page empty

### High Priority (Next):
5. 🟡 Add domain content type to table
6. 🟡 Remove homepage from URL toggle

---

## 📝 NEXT STEPS

1. **Verify Oct 26 now shows** after fixing Oct 22-24 status
2. **Fix deduplication logic** in content API
3. **Debug Citations & Visibility APIs** with browser console + Vercel logs
4. **Add domain homepage category** to citations table
5. **Filter out homepages** from URL toggle list

---

## 🧪 TESTING CHECKLIST

After each fix, verify:
- [ ] Oct 26 data appears when selecting that date
- [ ] Last 7 days shows ≤ Last 30 days (cumulative)
- [ ] Citations page shows 149 URLs for Oct 26
- [ ] Visibility page shows metrics (not all zeros)
- [ ] Domain table shows content types
- [ ] URL toggle excludes homepages


