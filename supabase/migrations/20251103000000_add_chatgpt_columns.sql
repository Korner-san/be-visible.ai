-- ============================================================================
-- Migration: Add ChatGPT Columns to Daily Reports and Prompt Results
-- Date: 2025-11-03
-- Purpose: Support ChatGPT provider alongside Perplexity and Google AI Overview
-- ============================================================================

-- 1. Add ChatGPT tracking columns to daily_reports table
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS chatgpt_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS chatgpt_attempted INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chatgpt_ok INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chatgpt_no_result INTEGER DEFAULT 0;

-- Add check constraint for chatgpt_status
ALTER TABLE daily_reports
DROP CONSTRAINT IF EXISTS daily_reports_chatgpt_status_check;

ALTER TABLE daily_reports
ADD CONSTRAINT daily_reports_chatgpt_status_check 
CHECK (chatgpt_status IN ('not_started', 'running', 'complete', 'failed', 'skipped'));

COMMENT ON COLUMN daily_reports.chatgpt_status IS 'ChatGPT processing status for this report';
COMMENT ON COLUMN daily_reports.chatgpt_attempted IS 'Number of prompts attempted with ChatGPT';
COMMENT ON COLUMN daily_reports.chatgpt_ok IS 'Number of successful ChatGPT responses with citations';
COMMENT ON COLUMN daily_reports.chatgpt_no_result IS 'Number of ChatGPT responses without citations';

-- 2. Add ChatGPT response columns to prompt_results table
ALTER TABLE prompt_results
ADD COLUMN IF NOT EXISTS chatgpt_response TEXT,
ADD COLUMN IF NOT EXISTS chatgpt_response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS chatgpt_citations TEXT[];

COMMENT ON COLUMN prompt_results.chatgpt_response IS 'Full text response from ChatGPT';
COMMENT ON COLUMN prompt_results.chatgpt_response_time_ms IS 'Response time in milliseconds for ChatGPT';
COMMENT ON COLUMN prompt_results.chatgpt_citations IS 'Array of citation URLs from ChatGPT';

-- 3. Add index for faster ChatGPT queries
CREATE INDEX IF NOT EXISTS idx_daily_reports_chatgpt_status 
ON daily_reports(chatgpt_status);

CREATE INDEX IF NOT EXISTS idx_prompt_results_provider_chatgpt 
ON prompt_results(provider) 
WHERE provider = 'chatgpt';

-- 4. Update existing check constraint on users.subscription_plan to include new plans
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_subscription_plan_check;

ALTER TABLE users
ADD CONSTRAINT users_subscription_plan_check 
CHECK (subscription_plan IN ('free_trial', 'basic', 'advanced', 'business', 'corporate'));

-- 5. Update brand_prompts to use 'is_active' boolean (ensure compatibility)
-- The worker code expects is_active, not status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'brand_prompts' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE brand_prompts ADD COLUMN is_active BOOLEAN DEFAULT true;
    
    -- Migrate existing status column if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'brand_prompts' AND column_name = 'status'
    ) THEN
      UPDATE brand_prompts SET is_active = (status = 'active');
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN brand_prompts.is_active IS 'Whether this prompt is active for report generation';

-- 6. Create index on brand_prompts.is_active for faster queries
CREATE INDEX IF NOT EXISTS idx_brand_prompts_is_active 
ON brand_prompts(brand_id, is_active);


