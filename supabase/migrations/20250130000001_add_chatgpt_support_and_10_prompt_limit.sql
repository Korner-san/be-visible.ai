-- Migration: Add ChatGPT support and enforce 10 prompt limit
-- Date: 2025-01-30
-- Description: Transition to ChatGPT-only mode for Basic plan ($30)

-- ============================================================================
-- PART 1: Add ChatGPT columns to daily_reports table
-- ============================================================================

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chatgpt_status TEXT DEFAULT 'not_started' CHECK (chatgpt_status IN ('not_started', 'running', 'complete', 'failed', 'expired', 'skipped'));

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chatgpt_attempted INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chatgpt_ok INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chatgpt_no_result INTEGER DEFAULT 0;

-- ============================================================================
-- PART 2: Add ChatGPT columns to prompt_results table
-- ============================================================================

ALTER TABLE prompt_results
ADD COLUMN IF NOT EXISTS chatgpt_response TEXT;

ALTER TABLE prompt_results
ADD COLUMN IF NOT EXISTS chatgpt_response_time_ms INTEGER;

ALTER TABLE prompt_results
ADD COLUMN IF NOT EXISTS chatgpt_citations JSONB DEFAULT '[]';

-- ============================================================================
-- PART 3: Deactivate excess prompts (keep only 10 active per brand)
-- ============================================================================

-- For brands with more than 10 active prompts, deactivate the oldest ones
-- Keep the 10 most recently created prompts active
WITH ranked_prompts AS (
  SELECT 
    id,
    brand_id,
    ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY created_at ASC) as prompt_rank
  FROM brand_prompts
  WHERE status = 'active'
),
prompts_to_deactivate AS (
  SELECT id
  FROM ranked_prompts
  WHERE prompt_rank > 10
)
UPDATE brand_prompts
SET 
  status = 'inactive',
  updated_at = NOW()
WHERE id IN (SELECT id FROM prompts_to_deactivate);

-- ============================================================================
-- PART 4: Deactivate all prompts for specific test user
-- ============================================================================

-- Deactivate all prompts for kk1995current@gmail.com
UPDATE brand_prompts
SET 
  status = 'inactive',
  updated_at = NOW()
WHERE brand_id IN (
  SELECT id 
  FROM brands 
  WHERE owner_user_id IN (
    SELECT id 
    FROM users 
    WHERE email = 'kk1995current@gmail.com'
  )
);

-- ============================================================================
-- PART 5: Create index for ChatGPT queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_daily_reports_chatgpt_status 
ON daily_reports(chatgpt_status);

CREATE INDEX IF NOT EXISTS idx_prompt_results_provider_chatgpt 
ON prompt_results(provider) 
WHERE provider = 'chatgpt';

-- ============================================================================
-- PART 6: Update completion logic to include ChatGPT
-- ============================================================================

-- Note: The completion logic in the application code will need to check
-- chatgpt_status in addition to perplexity_status and google_ai_overview_status

COMMENT ON COLUMN daily_reports.chatgpt_status IS 'Status of ChatGPT processing for this report (primary provider for Basic plan)';
COMMENT ON COLUMN daily_reports.chatgpt_attempted IS 'Number of prompts attempted with ChatGPT';
COMMENT ON COLUMN daily_reports.chatgpt_ok IS 'Number of prompts successfully processed with ChatGPT';
COMMENT ON COLUMN daily_reports.chatgpt_no_result IS 'Number of prompts with no results from ChatGPT';

COMMENT ON COLUMN prompt_results.chatgpt_response IS 'Full response text from ChatGPT';
COMMENT ON COLUMN prompt_results.chatgpt_response_time_ms IS 'Response time in milliseconds for ChatGPT automation';
COMMENT ON COLUMN prompt_results.chatgpt_citations IS 'Citations extracted from ChatGPT response';




