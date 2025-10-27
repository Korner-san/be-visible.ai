# Diagnostic Chart Implementation Summary

**Date:** October 27, 2025
**Status:** ✅ Complete

## Problem Identified

The user reported a critical data inconsistency in the Content Structure Analysis:

- **Last 7 Days:** 291 total URLs, 76 unique URLs
- **Last 30 Days:** 455 total URLs, 69 unique URLs

**Issue:** The unique URL count is LOWER (69) for a LARGER date range (Last 30 Days), which should be impossible if aggregation is correct since Last 30 Days should include all URLs from Last 7 Days plus more.

This confirms that URLs are being excluded or skipped when the date range expands, likely due to:
1. URLs being filtered out when `url_content_facts` is missing
2. Grouping/aggregation logic affected by classification availability
3. Inconsistent JOIN or WHERE clause behavior

## Solution: Diagnostic Visibility (No Logic Changes Yet)

Instead of immediately fixing the aggregation logic, we added **diagnostic visibility** to understand exactly where URLs are being excluded in the data pipeline.

## Changes Made

### 1. API Route Enhancement (`app/api/reports/content/categories/route.ts`)

**Added:** Diagnostic metrics collection and response

```typescript
// Collect diagnostic metrics
const diagnostics = {
  totalCitationsRetrieved: citations.length,
  distinctUrlsCited: urlIds.length,
  urlsWithClassification: urlDataMap.size,
  urlsWithoutClassification: urlIds.length - urlDataMap.size,
  skippedCitations: 0, // Will be calculated based on UNCLASSIFIED handling
  includedCitations: citations.length // All citations are included now (even UNCLASSIFIED)
}

// Count citations that were assigned UNCLASSIFIED (these are the ones without classification)
const unclassifiedStats = categoryStats['UNCLASSIFIED']
if (unclassifiedStats) {
  diagnostics.skippedCitations = unclassifiedStats.count
}

console.log(`🔍 [DIAGNOSTICS]`, diagnostics)

// ... (rest of the code)

return NextResponse.json({ categories, diagnostics })
```

**What This Does:**
- Calculates 6 key metrics for every API call
- Returns diagnostics alongside categories in the response
- Logs diagnostics to console for backend debugging

### 2. New Diagnostic Component (`components/ContentDiagnostics.tsx`)

**Created:** A new React component to visualize diagnostic metrics

**Features:**
- Displays a table with 6 diagnostic metrics
- Color-coded rows (green = good, red = issues, amber = warnings)
- Tooltips for complex metrics
- Alert banner when anomalies are detected
- "Next Steps" guidance panel when issues are found

**Diagnostic Metrics Displayed:**

| Metric | Meaning |
|--------|---------|
| **Total Citations Retrieved** | Number of citation rows inside the date range |
| **Distinct URLs Cited** | COUNT(DISTINCT url) from citation rows only |
| **URLs With Classification** | How many of those URLs exist in url_content_facts |
| **URLs Without Classification** | Distinct URLs that were cited but have no classification yet |
| **Skipped Citations** | Number of citation rows assigned to UNCLASSIFIED |
| **Included Citations** | Citation rows that remained after filtering |

**Visual Indicators:**
- Red background + badge for "URLs Without Classification" if > 0
- Amber background for "Skipped Citations" if > 0
- Green background for "URLs With Classification"
- Alert banner when `urlsWithoutClassification > 0`

### 3. Content Page Update (`app/reports/content/page.tsx`)

**Added:**
- Import for `ContentDiagnostics` component
- State variable for `diagnosticsData`
- Extraction of diagnostics from API response
- Rendering of diagnostic component below Content Structure table

```tsx
// State
const [diagnosticsData, setDiagnosticsData] = useState<any>(null)

// API call
const data = await response.json()
setContentCategoriesData(data.categories || [])
setDiagnosticsData(data.diagnostics || null)

// Rendering
<ContentDiagnostics 
  diagnostics={diagnosticsData} 
  isLoading={isCategoriesLoading} 
/>
```

## Expected Behavior

### For Last 7 Days
If there are 76 unique URLs cited, the diagnostic chart should show:
- **Distinct URLs Cited:** 76
- **URLs With Classification:** ~76 (or less if some are unclassified)
- **URLs Without Classification:** 0 (or a small number)

### For Last 30 Days
If there are only 69 unique URLs (LOWER than Last 7 Days), the diagnostic chart should reveal:
- **Distinct URLs Cited:** Should be >= 76 (because it includes Last 7 Days)
- **URLs Without Classification:** Likely HIGH, indicating many URLs cited in earlier days have no classification
- **Skipped Citations:** High number showing citations without classification

This will **prove** that the aggregation issue is caused by missing classifications, not by the date range logic itself.

## How to Use the Diagnostic Chart

1. **Navigate to:** `/reports/content`
2. **Select:** "Last 7 Days" from the date picker
3. **Observe:** The diagnostic metrics below the Content Structure table
4. **Note:** The values for "Distinct URLs Cited" and "URLs Without Classification"
5. **Change to:** "Last 30 Days"
6. **Compare:** How the metrics change (especially "Distinct URLs Cited" and "URLs Without Classification")
7. **Identify:** If "URLs Without Classification" increases significantly, this confirms the root cause

## Next Steps (Not Implemented Yet)

Based on the diagnostic results, the final fix will involve:

1. **Modify aggregation logic** to include ALL cited URLs regardless of classification status
2. **Ensure** urls without classification appear as "Unclassified" in the table (already partially implemented)
3. **Verify** that expanding the date range ALWAYS increases or maintains the unique URL count (never decreases)
4. **Add** a fallback mechanism to fetch URL strings even when `url_content_facts` is missing

## Files Changed

1. `app/api/reports/content/categories/route.ts` - Added diagnostics collection and response
2. `components/ContentDiagnostics.tsx` - New diagnostic component
3. `app/reports/content/page.tsx` - Integrated diagnostic component

## Testing Checklist

- [ ] Diagnostic chart appears below Content Structure table
- [ ] All 6 metrics display correctly
- [ ] Color coding works (red for issues, green for good, amber for warnings)
- [ ] Alert banner appears when `urlsWithoutClassification > 0`
- [ ] Tooltips provide helpful explanations
- [ ] Changing date range updates diagnostic metrics in real-time
- [ ] "Last 7 Days" vs "Last 30 Days" comparison reveals the inconsistency
- [ ] Console logs show diagnostic data in backend

## Expected Outcome

After viewing the diagnostic chart, the user will have **clear visibility** into:
- How many URLs are cited but not classified
- Where citations are being excluded
- Why unique URL counts appear inconsistent across date ranges

This diagnostic data will **confirm the hypothesis** that URLs without classification are being excluded, and provide the foundation for implementing the correct fix.

