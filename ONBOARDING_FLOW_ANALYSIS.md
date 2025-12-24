# Onboarding Flow Analysis

**Purpose**: Document how onboarding works and which database changes affect it

---

## Onboarding Flow (Current State)

### Step-by-Step Process

1. **User signs up** → Redirected to `/setup/onboarding`

2. **OnboardingClient Component** collects 10 questions:
   - Brand Name
   - Website URL
   - Industry
   - Product Category
   - Problem Solved
   - Tasks Helped (5 items)
   - Goal Facilitated
   - Key Features (4 items)
   - Use Cases (4 items)
   - **Competitors (up to 4 items)** ← IMPORTANT for DB changes
   - Unique Selling Props (4 items)

3. **Form Validation** (line 36 in onboarding-client.tsx):
   ```typescript
   competitors: z.array(z.string()).min(1, 'Please list at least one competitor')
   ```
   - Requires at least 1 competitor
   - UI shows 4 input fields
   - Example: `["Jenkins", "CircleCI", "Travis CI", "GitLab CI"]`

4. **Save Answers** → POST `/api/onboarding/save`
   - Finds user's pending brand
   - Calls `updateOnboardingAnswers(brandId, answers)`
   - **Saves to**: `brands.onboarding_answers` (JSONB column)
   - Structure: `{brandName: "...", competitors: ["...", "..."], ...}`

5. **Complete Onboarding** → POST `/api/onboarding/complete-final`
   - Reads from `brands.onboarding_answers`
   - Sets `onboarding_completed = true`
   - Sets `first_report_status = 'queued'`

6. **View Competitors** → Navigate to `/setup/competitors`
   - Reads from `brands.onboarding_answers->>'competitors'`
   - Displays in table format
   - Currently READ-ONLY (no add/delete functionality)

---

## Key Files Involved

### Frontend (Onboarding UI)
- `app/setup/onboarding/page.tsx` - Server component, guards access
- `app/setup/onboarding/onboarding-client.tsx` - Form component (lines 120-176 define competitors)
- `app/setup/competitors/page.tsx` - Server component for competitors page
- `app/setup/competitors/competitors-client.tsx` - Displays competitors (lines 33-54 read from onboarding_answers)

### API Routes
- `app/api/onboarding/save/route.ts` - Saves answers to onboarding_answers JSONB
- `app/api/onboarding/complete-final/route.ts` - Marks onboarding complete
- `app/api/onboarding/init/route.ts` - Creates pending brand

### Libraries
- `lib/supabase/user-state.ts` - Contains `updateOnboardingAnswers()` function (line 348)
  - Line 357: `onboarding_answers: answers` - saves entire answers object

---

## Database Schema (Current)

### brands table
```sql
CREATE TABLE brands (
  id UUID PRIMARY KEY,
  name TEXT,
  domain TEXT,
  owner_user_id UUID,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_answers JSONB DEFAULT '{}',  -- ← Competitors stored here
  first_report_status TEXT,
  ...
);
```

### onboarding_answers structure
```json
{
  "brandName": "Incredibuild",
  "website": "https://incredibuild.com",
  "industry": "DevTools",
  "competitors": ["Jenkins", "CircleCI", "Travis CI", "GitLab CI"],  // ← Array of strings
  "keyFeatures": ["...", "...", "...", "..."],
  ...
}
```

---

## Which Database Changes Affect Onboarding?

### ✅ SAFE Changes (Don't affect onboarding)

1. **Rename `competitor_mentions` column** in `prompt_results` table
   - This column is only used by worker and visibility reports
   - Onboarding doesn't touch `prompt_results` table
   - **Impact**: None on onboarding
   - **Action needed**: Update visibility APIs only

2. **Create `competitor_results` table**
   - New table for per-competitor tracking
   - Only used by worker and reports
   - **Impact**: None on onboarding
   - **Action needed**: Update worker processor

### ⚠️ AFFECTS Onboarding (Need careful migration)

3. **Create `brand_competitors` table**
   - Normalizes competitors from JSONB array to proper table
   - Current: `brands.onboarding_answers->>'competitors'`
   - Future: `brand_competitors` table with FK to brands
   - **Impact**: HIGH - both onboarding save AND competitors page read this data
   - **Action needed**:
     1. Create table (non-breaking)
     2. Migrate existing data
     3. Update `/setup/competitors` to read from new table (with fallback)
     4. Update `/api/onboarding/save` to write to both places
     5. Eventually deprecate JSONB storage

---

## Safe Implementation Strategy

### Phase 1: Rename competitor_mentions (NO onboarding impact)

**Steps**:
1. Rename column in database
2. Update TypeScript types
3. Update visibility API endpoints
4. Update worker if needed
5. Test visibility reports

**Files to update**:
- `app/api/reports/visibility/route.ts` (if we fix the old one)
- `app/api/reports/visibility2/route.ts` (already doesn't use it)
- Worker processor (if it reads this column)

**Onboarding affected?** ❌ NO

---

### Phase 2: Create brand_competitors table (AFFECTS onboarding)

**Steps**:

#### 2a. Create table (non-breaking)
```sql
CREATE TABLE brand_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  competitor_domain TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, competitor_name)
);
```

#### 2b. Migrate existing data
```sql
INSERT INTO brand_competitors (brand_id, competitor_name, display_order)
SELECT
  b.id,
  competitor_name,
  row_number() OVER (PARTITION BY b.id) as display_order
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(b.onboarding_answers->'competitors') AS competitor_name
WHERE b.onboarding_answers ? 'competitors';
```

#### 2c. Update /setup/competitors page

**Before** (competitors-client.tsx line 43):
```typescript
if (!activeBrand?.onboarding_answers?.competitors) {
  return []
}
return activeBrand.onboarding_answers.competitors.map(...)
```

**After** (with fallback):
```typescript
// First try to fetch from brand_competitors table
const { data: competitorsFromTable } = await supabase
  .from('brand_competitors')
  .select('*')
  .eq('brand_id', activeBrandId)
  .eq('is_active', true)
  .order('display_order')

if (competitorsFromTable && competitorsFromTable.length > 0) {
  return competitorsFromTable // Use new table
}

// Fallback to onboarding_answers (for backwards compatibility)
if (!activeBrand?.onboarding_answers?.competitors) {
  return []
}
return activeBrand.onboarding_answers.competitors.map(...) // Old way
```

#### 2d. Update onboarding save (dual-write)

**Update**: `lib/supabase/user-state.ts` → `updateOnboardingAnswers()`

```typescript
export async function updateOnboardingAnswers(
  brandId: string,
  answers: Record<string, any>
): Promise<boolean> {
  const supabase = await createClient()

  try {
    // Update JSONB (keep for backwards compatibility)
    const updateData: any = {
      onboarding_answers: answers
    }

    await supabase
      .from('brands')
      .update(updateData)
      .eq('id', brandId)

    // NEW: Also write competitors to brand_competitors table
    if (answers.competitors && Array.isArray(answers.competitors)) {
      // Remove empty strings
      const validCompetitors = answers.competitors.filter(c => c && c.trim())

      if (validCompetitors.length > 0) {
        // Delete existing competitors for this brand
        await supabase
          .from('brand_competitors')
          .delete()
          .eq('brand_id', brandId)

        // Insert new competitors
        const competitorRecords = validCompetitors.map((name, index) => ({
          brand_id: brandId,
          competitor_name: name.trim(),
          display_order: index + 1,
          is_active: true
        }))

        await supabase
          .from('brand_competitors')
          .insert(competitorRecords)
      }
    }

    return true
  } catch (error) {
    console.error('Error updating onboarding answers:', error)
    return false
  }
}
```

**Onboarding affected?** ✅ YES - but handled gracefully with dual-write and fallback

---

### Phase 3: Create competitor_results table (NO onboarding impact)

**Steps**:
1. Create `competitor_results` table
2. Update worker brand-analyzer to populate it
3. Update visibility APIs to read from it
4. Keep old JSONB data for backwards compatibility

**Onboarding affected?** ❌ NO

---

## Testing Checklist

### After Phase 1 (Rename column)
- [ ] Visibility 2 page still shows brand mentions
- [ ] No errors in browser console
- [ ] Worker still runs without errors

### After Phase 2a (Create table + migrate)
- [ ] `brand_competitors` table created
- [ ] Existing brands have competitors populated
- [ ] Incredibuild has 4 competitors in new table

### After Phase 2b (Update competitors page)
- [ ] `/setup/competitors` shows competitors for existing brands
- [ ] Fallback works if table is empty
- [ ] No UI errors

### After Phase 2c (Update onboarding save)
- [ ] New onboarding creates entries in both places
- [ ] Competitors appear in `/setup/competitors` after onboarding
- [ ] No save errors

### Full Flow Test
- [ ] Create new brand through onboarding
- [ ] Add 3 competitors
- [ ] Complete onboarding
- [ ] Check `/setup/competitors` shows 3 competitors
- [ ] Check database: both `onboarding_answers` and `brand_competitors` populated
- [ ] Check visibility reports still work

---

## Rollback Plan

If something breaks:

1. **Phase 1**: Just rename column back - no data loss
2. **Phase 2**: Keep JSONB fallback active - apps will still work
3. **Phase 3**: Worker can be reverted independently

**Key safety**: Dual-write and fallback strategy means onboarding never breaks!

---

## Summary

**Current onboarding**: Works perfectly ✅

**Database changes needed**:
1. ✅ Rename column (safe)
2. ⚠️ Create brand_competitors (needs migration + dual-write)
3. ✅ Create competitor_results (safe)

**Strategy**: Gradual migration with fallbacks, no breaking changes

**Next step**: Start with Phase 1 (rename column) since it's completely safe.
