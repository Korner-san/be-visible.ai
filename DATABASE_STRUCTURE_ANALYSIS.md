# BeVisible.ai Database Structure Analysis

**Version**: 2.0 (Improved)
**Date**: 2025-12-16
**Purpose**: Comprehensive analysis of database structure, identifying improvements needed for subscription plans, competitor tracking, and data consistency.

---

## Executive Summary

This document provides a complete analysis of BeVisible.ai's database structure, identifying key improvements needed for:
- ✅ FREE subscription plan (all users start free, no reports generated)
- ✅ Active/inactive prompt management (max 10 active per brand on basic plan)
- ❌ **CRITICAL**: Column naming inconsistency (`competitor_mentions` should be `competitor_mention_counts`)
- ❌ **MISSING**: Per-competitor mention counts (currently only stores array, not aggregated totals)
- ❌ **UNCLEAR**: Position definition (should mean ranking 1st/2nd/3rd among entities, not character position)
- ✅ Up to 5 competitors per brand (currently stored in JSONB, works but could be normalized)

---

## 1. Subscription Plans System

### Current State ✅

The system has 5 subscription tiers defined in the database:

| Plan | Active Prompts | Models | Daily Reports | Notes |
|------|---------------|---------|---------------|-------|
| **free_trial** | 5 | ChatGPT | ❌ NO REPORTS | Default for new users |
| **basic** | 10 | ChatGPT only | ✅ Yes | Entry paid tier |
| **advanced** | 15 | All models | ✅ Yes | Multi-model access |
| **business** | 20 | All models | ✅ Yes | Team features |
| **corporate** | 30 | All models | ✅ Yes | Enterprise |

### Implementation Details

**Database Column**: `users.subscription_plan` (text, default: 'free_trial')

**Query to verify**:
```sql
SELECT email, subscription_plan, reports_enabled
FROM users
WHERE subscription_plan = 'free_trial';
```

**Current User Distribution**:
- shirklain22@gmail.com: `basic` plan (10 prompts, reports enabled)
- korenk878@gmail.com: `basic` plan (10 prompts, reports enabled)
- Most other users: `free_trial` (5 prompts, NO reports)

### How It Works

1. **New user signs up** → Automatically assigned `subscription_plan = 'free_trial'`
2. **Free trial users**:
   - Can add up to 5 prompts
   - Prompts are stored in `brand_prompts`
   - Worker skips free_trial users (checks `subscription_plan != 'free_trial'` in queries)
   - NO `daily_reports` created
   - NO `prompt_results` generated
3. **Upgrade to basic/advanced/business/corporate**:
   - Can activate more prompts (10/15/20/30)
   - Worker processes their brand daily
   - Creates `daily_reports` with status tracking
   - Generates `prompt_results` for each active prompt

### Migration Reference

From `/root/be-visible.ai/supabase/migrations/20251101000000_add_user_plans_and_chatgpt_pipeline.sql`:

```sql
-- Add subscription_plan column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free_trial';

-- Prompt limits by plan
CASE
  WHEN 'free_trial' THEN 5
  WHEN 'basic' THEN 10
  WHEN 'advanced' THEN 15
  WHEN 'business' THEN 20
  WHEN 'corporate' THEN 30
END

-- View excludes free_trial from reports
CREATE VIEW active_reportable_users AS
SELECT * FROM users
WHERE subscription_plan != 'free_trial'
AND reports_enabled = true;
```

---

## 2. Brand Prompts Management

### Current State ✅ (Mostly Working)

Each brand has a collection of prompts stored in `brand_prompts` table.

**Table Structure**:
```sql
CREATE TABLE brand_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) NOT NULL,
  raw_prompt TEXT NOT NULL,                    -- The actual prompt text
  improved_prompt TEXT,                        -- AI-enhanced version
  source_template_code TEXT,                   -- Where it came from
  status TEXT DEFAULT 'draft',                 -- 'draft', 'active', 'inactive'
  is_active BOOLEAN DEFAULT true,              -- Controls processing
  category TEXT,                               -- Prompt category
  notes TEXT,
  generation_metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Active vs Inactive Prompts

**Two fields control prompt processing**:
1. `is_active` (boolean) - Master switch (true = can be processed)
2. `status` (text) - Lifecycle stage ('draft', 'active', 'inactive')

**Worker Logic** (should be):
```sql
-- Worker selects only active prompts for processing
SELECT * FROM brand_prompts
WHERE brand_id = $1
AND is_active = true
AND status = 'active'
LIMIT $prompt_limit; -- Based on subscription_plan
```

### Current Active Prompts by Brand

| Brand | Active Prompts | Inactive Prompts | Total | Subscription |
|-------|----------------|------------------|-------|--------------|
| Incredibuild | 10 | 50 | 60 | basic |
| Kypso | 10 | 80 | 90 | basic |
| Naughty Dog | 10 | 55 | 65 | basic |
| Otterly.AI | 10 | 6 | 16 | basic |
| Browserless | 10 | 5 | 15 | basic |
| React Bits | 15 | 1 | 16 | advanced |
| Zeron | 10 | 5 | 15 | basic |

**Pattern**: Basic users have exactly 10 active prompts, advanced users can have 15.

### UI Management

Users can manage active/inactive prompts via:
- `/setup/prompts` - View and toggle prompts
- Prompts exceeding subscription limit are automatically deactivated
- UI enforces: "You can have up to {limit} active prompts on your {plan} plan"

---

## 3. Competitor Tracking System

### Current State ⚠️ (Needs Improvement)

Competitors are stored in **two places**:

1. **During Onboarding**: `brands.onboarding_answers->>'competitors'` (JSONB array)
2. **In Results**: `prompt_results.competitor_mentions` (JSONB array of objects)

### Storage Location 1: brands.onboarding_answers

**Structure**:
```json
{
  "competitors": ["Jenkins", "CircleCI", "Travis CI", "GitLab CI"]
}
```

**Example for Incredibuild**:
```sql
SELECT onboarding_answers->>'competitors' as competitors
FROM brands
WHERE id = 'b1a37d48-375f-477a-b838-38486e5e1c2d';

-- Result: ["Jenkins", "CircleCI", "Travis CI", "GitLab CI"]
```

**Max Competitors**: Up to 5 per brand (enforced in UI during onboarding)

**UI Display**: `/setup/competitors` reads from `onboarding_answers` and displays in table format.

### Storage Location 2: prompt_results.competitor_mentions

**Current Structure** (from worker processor):
```json
{
  "competitor_mentions": [
    {
      "name": "Jenkins",
      "count": 3,
      "positions": [2, 4, 5]
    },
    {
      "name": "CircleCI",
      "count": 1,
      "positions": [3]
    }
  ]
}
```

**Problem**: Currently returning `[]` empty arrays - analyzer not working correctly!

### Issues Identified

#### Issue 1: Column Naming Inconsistency ❌ CRITICAL

**Problem**:
- Brand uses: `brand_mention_count` (with "count")
- Competitors use: `competitor_mentions` (without "count")

**Impact**: Confusing for developers, inconsistent API responses

**Solution**: Rename column
```sql
ALTER TABLE prompt_results
RENAME COLUMN competitor_mentions TO competitor_mention_counts;
```

Or if keeping array structure:
```sql
ALTER TABLE prompt_results
RENAME COLUMN competitor_mentions TO competitor_mention_details;
```

#### Issue 2: Missing Per-Competitor Totals ❌

**Problem**: No easy way to get "How many times was Jenkins mentioned across all prompts?"

**Current**: Must parse JSONB array and sum counts in JavaScript
**Needed**: Direct aggregation like `brand_mention_count`

**Proposed Solution**: Add separate columns (see Design Improvements section)

#### Issue 3: Position Definition Unclear ❌

**Problem**: What does `"positions": [2, 4, 5]` mean?

**Two interpretations**:
1. ❌ Character position in response text (not useful)
2. ✅ **Ranking among entities** (1st mentioned, 2nd mentioned, 3rd mentioned)

**Correct Definition** (per user feedback):
> "The position is if the brand was mentioned above or below the other brands, not how many characters. The app should understand how many entities were mentioned for each response and position the brand between 1-X."

**Example**:
- Response mentions: "Jenkins, Incredibuild, CircleCI"
- Jenkins position: 1 (first)
- Incredibuild position: 2 (second)
- CircleCI position: 3 (third)

---

## 4. Daily Reports and Prompt Results Flow

### Table: daily_reports

**Purpose**: Track daily report generation for each brand

**Key Columns**:
```sql
CREATE TABLE daily_reports (
  id UUID PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  report_date DATE NOT NULL,
  status TEXT DEFAULT 'running',           -- 'running', 'completed', 'failed'

  -- Tracking columns
  total_prompts INTEGER DEFAULT 0,         -- How many prompts should run
  completed_prompts INTEGER DEFAULT 0,     -- How many finished processing

  -- Provider-specific tracking
  chatgpt_status TEXT DEFAULT 'not_started',
  chatgpt_attempted INTEGER DEFAULT 0,
  chatgpt_ok INTEGER DEFAULT 0,
  chatgpt_no_result INTEGER DEFAULT 0,

  perplexity_status TEXT DEFAULT 'not_started',
  perplexity_attempted INTEGER DEFAULT 0,
  perplexity_ok INTEGER DEFAULT 0,
  perplexity_no_result INTEGER DEFAULT 0,

  google_ai_overview_status TEXT DEFAULT 'not_started',
  google_ai_overview_attempted INTEGER DEFAULT 0,
  google_ai_overview_ok INTEGER DEFAULT 0,
  google_ai_overview_no_result INTEGER DEFAULT 0,

  -- Aggregated results
  total_mentions INTEGER DEFAULT 0,        -- Total brand mentions across all results
  average_position NUMERIC,                -- Average position when mentioned
  sentiment_scores JSONB DEFAULT '{}',

  -- Metadata
  processing_stage TEXT DEFAULT 'initialized',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### Table: prompt_results

**Purpose**: Store individual prompt execution results

**Key Columns**:
```sql
CREATE TABLE prompt_results (
  id UUID PRIMARY KEY,
  daily_report_id UUID REFERENCES daily_reports(id),
  brand_prompt_id UUID REFERENCES brand_prompts(id),

  -- Provider info
  provider TEXT NOT NULL,                  -- 'chatgpt', 'perplexity', 'google_ai_overview', 'claude'
  provider_status TEXT DEFAULT 'pending',  -- 'ok', 'no_result', 'error'

  -- Raw data
  prompt_text TEXT NOT NULL,
  response_text TEXT,                      -- Full response from provider

  -- Brand analysis (auto-populated by trigger)
  brand_mentioned BOOLEAN,                 -- Quick boolean check
  brand_mention_count INTEGER,             -- # of times brand mentioned
  brand_position INTEGER,                  -- Position when mentioned (1st, 2nd, 3rd...)

  -- Competitor analysis (populated by processor)
  competitor_mentions JSONB DEFAULT '[]',  -- Array of {name, count, positions}

  -- Citations (for ChatGPT, Perplexity)
  citations JSONB DEFAULT '[]',

  -- Metadata
  response_time INTEGER,                   -- Response time in ms
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Database Trigger: Auto-count brand mentions

**Purpose**: Automatically populate `brand_mention_count` when `response_text` is inserted/updated

**Implementation**:
```sql
CREATE OR REPLACE FUNCTION count_brand_mentions()
RETURNS TRIGGER AS $$
DECLARE
  brand_name TEXT;
  mention_count INTEGER;
BEGIN
  -- Get brand name from brand_prompts -> brands
  SELECT b.name INTO brand_name
  FROM brands b
  JOIN brand_prompts bp ON b.id = bp.brand_id
  WHERE bp.id = NEW.brand_prompt_id;

  -- Count case-insensitive occurrences
  IF NEW.response_text IS NOT NULL AND brand_name IS NOT NULL THEN
    mention_count := array_length(
      regexp_matches(NEW.response_text, brand_name, 'gi')
    );

    NEW.brand_mention_count := COALESCE(mention_count, 0);
    NEW.brand_mentioned := (mention_count > 0);
  ELSE
    NEW.brand_mention_count := 0;
    NEW.brand_mentioned := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_count_brand_mentions
BEFORE INSERT OR UPDATE ON prompt_results
FOR EACH ROW
EXECUTE FUNCTION count_brand_mentions();
```

### Worker Processing Flow

1. **Orchestrator** creates daily_report:
   ```sql
   INSERT INTO daily_reports (brand_id, report_date, status, total_prompts)
   VALUES ($brand_id, CURRENT_DATE, 'running', 10);
   ```

2. **Executor** runs each active prompt:
   ```javascript
   // ChatGPT executor runs prompt via Playwright
   const responseText = await executeChatGPTPrompt(prompt);

   // Save to database
   await supabase.from('prompt_results').insert({
     daily_report_id,
     brand_prompt_id,
     provider: 'chatgpt',
     provider_status: 'ok',
     prompt_text,
     response_text: responseText,
     citations: extractedCitations
   });
   // Trigger automatically sets brand_mention_count!
   ```

3. **Processor** analyzes competitors:
   ```javascript
   // Brand analyzer reads results
   const results = await supabase
     .from('prompt_results')
     .select('*')
     .eq('daily_report_id', dailyReportId);

   // Analyze each result for competitors
   for (const result of results) {
     const competitorMentions = analyzeCompetitors(
       result.response_text,
       brandCompetitors
     );

     // Update with competitor data
     await supabase
       .from('prompt_results')
       .update({
         competitor_mentions: competitorMentions,
         // Example: [{"name": "Jenkins", "count": 3, "positions": [1,3,5]}]
       })
       .eq('id', result.id);
   }
   ```

4. **Aggregator** finalizes daily_report:
   ```sql
   -- Update daily report with totals
   UPDATE daily_reports
   SET
     completed_prompts = 10,
     total_mentions = (SELECT SUM(brand_mention_count) FROM prompt_results WHERE daily_report_id = $1),
     status = 'completed',
     completed_at = NOW()
   WHERE id = $1;
   ```

---

## 5. Why Both brand_mentioned (boolean) AND brand_mention_count (integer)?

### Different Use Cases

These columns serve **different query patterns**:

#### Use Case 1: Percentage mentioned (boolean)

**Question**: "What percentage of prompts mentioned our brand?"

**Query**:
```sql
SELECT
  COUNT(CASE WHEN brand_mentioned = true THEN 1 END) * 100.0 / COUNT(*) as mention_percentage
FROM prompt_results
WHERE daily_report_id = $1;

-- Result: 70% (7 out of 10 prompts mentioned the brand)
```

**Why useful**: Shows brand **presence/awareness** across prompts

#### Use Case 2: Total mentions (integer)

**Question**: "How many times was our brand mentioned total?"

**Query**:
```sql
SELECT SUM(brand_mention_count) as total_mentions
FROM prompt_results
WHERE daily_report_id = $1;

-- Result: 23 (brand mentioned 23 times across all responses)
```

**Why useful**: Shows brand **emphasis/prominence** in responses

#### Use Case 3: Average mentions per response

**Question**: "When mentioned, how many times on average?"

**Query**:
```sql
SELECT AVG(brand_mention_count) as avg_mentions_per_response
FROM prompt_results
WHERE daily_report_id = $1
AND brand_mentioned = true;  -- Only count responses that mentioned brand

-- Result: 3.3 (average of 3.3 mentions per response that included brand)
```

### Example Scenario

| Prompt | Response Mentions Brand | Count |
|--------|------------------------|-------|
| 1 | ✅ Yes | 5 |
| 2 | ✅ Yes | 2 |
| 3 | ❌ No | 0 |
| 4 | ✅ Yes | 8 |
| 5 | ❌ No | 0 |
| 6 | ✅ Yes | 1 |

**Results**:
- `brand_mentioned`: 4 true, 2 false → **67% presence**
- `brand_mention_count`: 5+2+0+8+0+1 = 16 → **16 total mentions**
- Average when mentioned: 16/4 = **4 mentions per positive response**

**Conclusion**: Both columns are necessary for comprehensive analytics.

---

## 6. Identified Problems and Proposed Solutions

### Problem 1: Column Naming Inconsistency

**Current**:
- ✅ `brand_mention_count` (good, descriptive)
- ❌ `competitor_mentions` (inconsistent, no "count" suffix)

**Proposed Fix**:
```sql
ALTER TABLE prompt_results
RENAME COLUMN competitor_mentions TO competitor_mention_details;

-- Better name because it's a JSONB array with detailed info, not just a count
```

**Alternative** (if adding aggregate columns):
```sql
-- Keep competitor_mentions for JSONB array
-- Add new columns for aggregates
ALTER TABLE prompt_results
ADD COLUMN competitor_1_name TEXT,
ADD COLUMN competitor_1_mention_count INTEGER DEFAULT 0,
ADD COLUMN competitor_2_name TEXT,
ADD COLUMN competitor_2_mention_count INTEGER DEFAULT 0,
ADD COLUMN competitor_3_name TEXT,
ADD COLUMN competitor_3_mention_count INTEGER DEFAULT 0,
ADD COLUMN competitor_4_name TEXT,
ADD COLUMN competitor_4_mention_count INTEGER DEFAULT 0,
ADD COLUMN competitor_5_name TEXT,
ADD COLUMN competitor_5_mention_count INTEGER DEFAULT 0;
```

### Problem 2: No Per-Competitor Totals

**Current**: Must parse JSONB to get competitor totals
**Impact**: Slow queries, complex JavaScript aggregation

**Proposed Solution 1**: Normalize competitors table

```sql
CREATE TABLE brand_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) NOT NULL,
  competitor_name TEXT NOT NULL,
  competitor_domain TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(brand_id, competitor_name)
);

-- Migrate from onboarding_answers
INSERT INTO brand_competitors (brand_id, competitor_name, display_order)
SELECT
  b.id,
  jsonb_array_elements_text(b.onboarding_answers->'competitors'),
  row_number() OVER (PARTITION BY b.id)
FROM brands b
WHERE b.onboarding_answers->'competitors' IS NOT NULL;
```

**Proposed Solution 2**: Add competitor mention columns to prompt_results

```sql
-- Store mentions per competitor directly
ALTER TABLE prompt_results
ADD COLUMN competitors_data JSONB DEFAULT '{}';

-- Structure: {"Jenkins": {"count": 3, "positions": [1,3,5]}, "CircleCI": {"count": 1, "positions": [2]}}
```

**Proposed Solution 3**: Create competitor_results table (RECOMMENDED)

```sql
CREATE TABLE competitor_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_result_id UUID REFERENCES prompt_results(id) NOT NULL,
  competitor_name TEXT NOT NULL,
  mention_count INTEGER DEFAULT 0,
  mentioned_positions INTEGER[] DEFAULT ARRAY[]::INTEGER[],  -- Array of positions
  first_position INTEGER,  -- Position of first mention (for ranking)
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(prompt_result_id, competitor_name)
);

-- Easy aggregation queries
SELECT competitor_name, SUM(mention_count) as total_mentions
FROM competitor_results cr
JOIN prompt_results pr ON cr.prompt_result_id = pr.id
WHERE pr.daily_report_id = $1
GROUP BY competitor_name;
```

### Problem 3: Position Definition Ambiguity

**Issue**: "Position" could mean:
1. Character index in text (not useful)
2. Ranking among mentioned entities (useful!)

**Clarification Needed**: Update all documentation and code comments

**Recommended Naming**:
```sql
-- Instead of ambiguous "position"
brand_ranking INTEGER  -- 1 = mentioned first, 2 = second, etc.
competitor_rankings INTEGER[]  -- [1,3,5] = 1st, 3rd, 5th in different mentions

-- Or more explicit
brand_mention_order INTEGER  -- Order among all entities in response
```

### Problem 4: Competitor Analysis Not Working

**Symptom**: `competitor_mentions` returning `[]` empty arrays

**Possible Causes**:
1. Processor not running after executor
2. Competitor names don't match (case sensitivity?)
3. Analyzer logic broken

**Investigation Needed**:
```bash
# Check processor logs
ssh root@135.181.203.202 "tail -100 /root/be-visible.ai/worker/logs/brand-analyzer.log"

# Test competitor detection manually
node /root/be-visible.ai/worker/debug-brand-analyzer.js
```

---

## 7. Recommended Database Improvements

### Phase 1: Critical Fixes (Do First)

1. **Rename competitor_mentions column**
   ```sql
   ALTER TABLE prompt_results
   RENAME COLUMN competitor_mentions TO competitor_mention_details;
   ```

2. **Add documentation comments**
   ```sql
   COMMENT ON COLUMN prompt_results.brand_mentioned IS
     'Boolean flag: Was brand mentioned at least once? Used for presence percentage calculations.';

   COMMENT ON COLUMN prompt_results.brand_mention_count IS
     'Integer count: How many times was brand mentioned? Used for total mention aggregations.';

   COMMENT ON COLUMN prompt_results.brand_position IS
     'Ranking: Position of brand among ALL mentioned entities (1=first, 2=second, etc.). NOT character position.';

   COMMENT ON COLUMN prompt_results.competitor_mention_details IS
     'JSONB array: Detailed competitor mentions with counts and rankings. Example: [{"name":"Jenkins","count":3,"rankings":[1,3,5]}]';
   ```

3. **Fix free_trial report generation**
   ```sql
   -- Ensure worker skips free_trial users
   CREATE OR REPLACE VIEW active_reportable_brands AS
   SELECT b.*
   FROM brands b
   JOIN users u ON b.owner_user_id = u.id
   WHERE u.subscription_plan != 'free_trial'
   AND u.reports_enabled = true
   AND b.onboarding_completed = true;
   ```

### Phase 2: Structural Improvements

1. **Normalize competitors into separate table**
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

   -- Migrate existing data
   INSERT INTO brand_competitors (brand_id, competitor_name, display_order)
   SELECT
     b.id,
     jsonb_array_elements_text(b.onboarding_answers->'competitors') as competitor_name,
     row_number() OVER (PARTITION BY b.id ORDER BY ordinality) as display_order
   FROM brands b
   CROSS JOIN LATERAL jsonb_array_elements_text(b.onboarding_answers->'competitors') WITH ORDINALITY
   WHERE b.onboarding_answers ? 'competitors';
   ```

2. **Create competitor_results table**
   ```sql
   CREATE TABLE competitor_results (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     prompt_result_id UUID REFERENCES prompt_results(id) ON DELETE CASCADE,
     competitor_id UUID REFERENCES brand_competitors(id) ON DELETE CASCADE,

     -- Mention tracking
     mentioned BOOLEAN DEFAULT false,
     mention_count INTEGER DEFAULT 0,

     -- Position/ranking tracking
     first_ranking INTEGER,  -- First position among entities (1=first mentioned)
     all_rankings INTEGER[] DEFAULT ARRAY[]::INTEGER[],  -- All positions if mentioned multiple times

     created_at TIMESTAMPTZ DEFAULT now(),

     UNIQUE(prompt_result_id, competitor_id)
   );

   -- Index for fast aggregation
   CREATE INDEX idx_competitor_results_lookup
   ON competitor_results(competitor_id, mentioned);
   ```

3. **Add aggregation helper views**
   ```sql
   -- View: Competitor performance by daily report
   CREATE VIEW competitor_mentions_by_report AS
   SELECT
     dr.id as daily_report_id,
     dr.brand_id,
     dr.report_date,
     bc.competitor_name,
     COUNT(CASE WHEN cr.mentioned THEN 1 END) as times_mentioned,
     SUM(cr.mention_count) as total_mentions,
     AVG(cr.first_ranking) as avg_ranking
   FROM daily_reports dr
   JOIN prompt_results pr ON pr.daily_report_id = dr.id
   JOIN competitor_results cr ON cr.prompt_result_id = pr.id
   JOIN brand_competitors bc ON bc.id = cr.competitor_id
   GROUP BY dr.id, dr.brand_id, dr.report_date, bc.competitor_name;
   ```

### Phase 3: Performance Optimizations

1. **Add indexes for common queries**
   ```sql
   -- Fast brand lookups
   CREATE INDEX idx_prompt_results_brand_mentioned
   ON prompt_results(daily_report_id, brand_mentioned);

   -- Fast provider filtering
   CREATE INDEX idx_prompt_results_provider_status
   ON prompt_results(daily_report_id, provider, provider_status);

   -- Fast date range queries
   CREATE INDEX idx_daily_reports_date_range
   ON daily_reports(brand_id, report_date, status);
   ```

2. **Add materialized view for dashboard**
   ```sql
   CREATE MATERIALIZED VIEW brand_performance_summary AS
   SELECT
     b.id as brand_id,
     b.name as brand_name,
     dr.report_date,
     COUNT(DISTINCT pr.id) as total_prompts_executed,
     COUNT(CASE WHEN pr.brand_mentioned THEN 1 END) as prompts_with_mention,
     SUM(pr.brand_mention_count) as total_brand_mentions,
     AVG(pr.brand_position) as avg_brand_position,
     jsonb_object_agg(
       bc.competitor_name,
       jsonb_build_object(
         'mentions', SUM(cr.mention_count),
         'avg_ranking', AVG(cr.first_ranking)
       )
     ) as competitor_stats
   FROM brands b
   JOIN daily_reports dr ON dr.brand_id = b.id
   JOIN prompt_results pr ON pr.daily_report_id = dr.id
   LEFT JOIN competitor_results cr ON cr.prompt_result_id = pr.id
   LEFT JOIN brand_competitors bc ON bc.id = cr.competitor_id
   WHERE dr.status = 'completed'
   GROUP BY b.id, b.name, dr.report_date;

   -- Refresh daily after reports complete
   CREATE INDEX ON brand_performance_summary(brand_id, report_date);
   ```

---

## 8. Migration Plan

### Step 1: Update Column Names (Zero Downtime)

```sql
BEGIN;

-- Rename column
ALTER TABLE prompt_results
RENAME COLUMN competitor_mentions TO competitor_mention_details;

-- Add comments
COMMENT ON COLUMN prompt_results.competitor_mention_details IS
  'JSONB array of competitor mention details: [{"name":"CompetitorName","count":3,"rankings":[1,3,5]}]';

COMMENT ON COLUMN prompt_results.brand_position IS
  'Integer ranking: Position of brand among all mentioned entities (1=first, 2=second). NOT character position.';

COMMIT;
```

**Update application code**:
- Find/replace: `competitor_mentions` → `competitor_mention_details`
- Update API responses
- Update TypeScript types

### Step 2: Create Normalized Competitors Table

```sql
BEGIN;

-- Create table
CREATE TABLE brand_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  competitor_domain TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(brand_id, competitor_name)
);

-- Migrate existing data from onboarding_answers
INSERT INTO brand_competitors (brand_id, competitor_name, display_order)
SELECT
  b.id,
  competitor_name,
  row_number() OVER (PARTITION BY b.id ORDER BY ord) as display_order
FROM brands b
CROSS JOIN LATERAL jsonb_array_elements_text(b.onboarding_answers->'competitors') WITH ORDINALITY AS t(competitor_name, ord)
WHERE b.onboarding_answers ? 'competitors'
ON CONFLICT (brand_id, competitor_name) DO NOTHING;

-- Add indexes
CREATE INDEX idx_brand_competitors_brand ON brand_competitors(brand_id, is_active);

COMMIT;
```

**Update application**:
- `/setup/competitors/competitors-client.tsx`: Read from `brand_competitors` table instead of JSONB
- Add CRUD operations for competitors
- Keep `onboarding_answers` as backup during migration

### Step 3: Create Competitor Results Table

```sql
BEGIN;

-- Create table
CREATE TABLE competitor_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_result_id UUID REFERENCES prompt_results(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES brand_competitors(id) ON DELETE CASCADE,

  mentioned BOOLEAN DEFAULT false,
  mention_count INTEGER DEFAULT 0,
  first_ranking INTEGER,
  all_rankings INTEGER[] DEFAULT ARRAY[]::INTEGER[],

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(prompt_result_id, competitor_id)
);

-- Add indexes
CREATE INDEX idx_competitor_results_lookup ON competitor_results(prompt_result_id);
CREATE INDEX idx_competitor_results_competitor ON competitor_results(competitor_id, mentioned);

COMMIT;
```

**Update worker processor**:
```javascript
// New brand-analyzer.js logic
async function analyzeAndStoreCompetitorMentions(promptResult) {
  const brandCompetitors = await supabase
    .from('brand_competitors')
    .select('id, competitor_name')
    .eq('brand_id', promptResult.brand_id)
    .eq('is_active', true);

  for (const competitor of brandCompetitors) {
    const analysis = analyzeCompetitorInText(
      promptResult.response_text,
      competitor.competitor_name
    );

    await supabase.from('competitor_results').upsert({
      prompt_result_id: promptResult.id,
      competitor_id: competitor.id,
      mentioned: analysis.mentioned,
      mention_count: analysis.count,
      first_ranking: analysis.rankings[0] || null,
      all_rankings: analysis.rankings
    });
  }
}
```

### Step 4: Update API Endpoints

**Old Visibility API** (`/api/reports/visibility/route.ts`):
- ❌ Uses nested queries with RLS issues
- ❌ Tries to read non-existent columns

**New Visibility 2 API** (`/api/reports/visibility2/route.ts`):
- ✅ Uses `createServiceClient()` to bypass RLS
- ✅ Separate queries for clean data fetching
- ✅ Only reads existing columns

**Recommended**: Replace old API with new pattern:

```typescript
// Example: Updated visibility API with competitor data
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId');

  // Step 1: Get daily reports
  const { data: dailyReports } = await supabase
    .from('daily_reports')
    .select('id, report_date')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gte('report_date', fromDate)
    .lte('report_date', toDate);

  const dailyReportIds = dailyReports.map(dr => dr.id);

  // Step 2: Get prompt results with brand mentions
  const { data: promptResults } = await supabase
    .from('prompt_results')
    .select('id, daily_report_id, brand_mention_count')
    .in('daily_report_id', dailyReportIds)
    .eq('provider_status', 'ok');

  // Step 3: Get competitor results (NEW!)
  const { data: competitorResults } = await supabase
    .from('competitor_results')
    .select(`
      competitor_id,
      mention_count,
      brand_competitors(competitor_name)
    `)
    .in('prompt_result_id', promptResults.map(pr => pr.id));

  // Aggregate data...
  return NextResponse.json({
    success: true,
    data: {
      totalBrandMentions,
      competitorMentions: aggregateCompetitorMentions(competitorResults),
      mentionsOverTime
    }
  });
}
```

---

## 9. Verification Checklist

After implementing improvements, verify:

### Database Structure
- [ ] `users.subscription_plan` exists with default 'free_trial'
- [ ] All 5 plans (free_trial, basic, advanced, business, corporate) defined
- [ ] `brand_prompts.is_active` controls processing
- [ ] `brand_competitors` table created and populated
- [ ] `competitor_results` table created with indexes

### Data Integrity
- [ ] All brands have correct number of active prompts per subscription
- [ ] Free trial users have 0 daily_reports
- [ ] Basic users have max 10 active prompts
- [ ] All competitors migrated from onboarding_answers
- [ ] Competitor mention counts match JSONB data (during transition)

### API Functionality
- [ ] Visibility 2 shows correct brand mentions (currently: 5 for Incredibuild ✅)
- [ ] Old Visibility replaced with new pattern
- [ ] Competitor data returned in API responses
- [ ] Date filtering works correctly
- [ ] Model filtering works correctly

### Worker Processing
- [ ] Worker skips free_trial users
- [ ] Worker respects is_active flag
- [ ] Executor saves raw responses
- [ ] Trigger counts brand mentions automatically
- [ ] Processor analyzes competitors correctly
- [ ] Competitor results saved to new table
- [ ] Daily reports marked as completed

### UI Display
- [ ] `/reports/visibility2` shows data correctly
- [ ] `/setup/competitors` reads from brand_competitors table
- [ ] `/setup/prompts` allows toggling active/inactive
- [ ] Subscription limits enforced in UI

---

## 10. Summary

### Current State

✅ **Working**:
- Subscription plans exist (free_trial, basic, advanced, business, corporate)
- Active/inactive prompt management via `is_active` flag
- Brand mention counting via database trigger
- Visibility 2 page shows correct data (5 mentions)
- Basic users have 10 active prompts limit enforced

⚠️ **Needs Improvement**:
- Column naming inconsistency (`competitor_mentions` vs `brand_mention_count`)
- No per-competitor totals (must parse JSONB)
- Position definition unclear (should be ranking, not character index)
- Competitor analysis returning empty arrays (processor issue)

❌ **Critical Issues**:
- Old Visibility API uses wrong pattern (nested queries, RLS issues)
- No documentation on position meaning
- Competitors not normalized (stored in JSONB only)

### Recommended Next Steps

1. **Immediate** (fix data display):
   - Replace old Visibility API with new pattern
   - Debug why competitor_mentions returns []
   - Add clear documentation on position=ranking

2. **Short-term** (improve consistency):
   - Rename `competitor_mentions` to `competitor_mention_details`
   - Add database comments on all mention columns
   - Migrate competitors to normalized table

3. **Long-term** (optimize performance):
   - Create `competitor_results` table
   - Add aggregation views
   - Add performance indexes
   - Create materialized views for dashboard

---

**Document Version**: 2.0
**Last Updated**: 2025-12-16
**Verified Against**:
- Database: tzfvtofjcvpddqfgxdtn.supabase.co
- Worker: /root/be-visible.ai/worker/* (Hetzner server)
- App: be-visible.ai-main (4)
