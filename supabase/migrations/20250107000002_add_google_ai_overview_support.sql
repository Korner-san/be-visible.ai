-- Add Google AI Overview support to prompt_results table
-- This migration adds fields to store Google AI Overview API responses alongside Perplexity and Claude

-- Add Google AI Overview response field
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_response text;

-- Add Google AI Overview response time field  
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_response_time_ms integer;

-- Add Google AI Overview citations field (Google AI Overview provides structured citations)
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_citations jsonb DEFAULT '[]';

-- Add Google AI Overview portrayal classification fields (same structure as Perplexity and Claude)
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_portrayal_type text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_classifier_stage text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_classifier_version text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_snippet_hash text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS google_ai_overview_portrayal_confidence numeric;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_results_google_ai_overview_portrayal_type ON prompt_results(google_ai_overview_portrayal_type);
CREATE INDEX IF NOT EXISTS idx_prompt_results_google_ai_overview_classifier_stage ON prompt_results(google_ai_overview_classifier_stage);

-- Add comments for documentation
COMMENT ON COLUMN prompt_results.google_ai_overview_response IS 'Google AI Overview API response text for this prompt';
COMMENT ON COLUMN prompt_results.google_ai_overview_response_time_ms IS 'Google AI Overview API response time in milliseconds';
COMMENT ON COLUMN prompt_results.google_ai_overview_citations IS 'Google AI Overview citations array from structured responses';
COMMENT ON COLUMN prompt_results.google_ai_overview_portrayal_type IS 'Google AI Overview portrayal classification: RECOMMENDATION, COMPARISON, etc.';
COMMENT ON COLUMN prompt_results.google_ai_overview_classifier_stage IS 'Google AI Overview classification stage: llm, keyword, null';
COMMENT ON COLUMN prompt_results.google_ai_overview_classifier_version IS 'Google AI Overview classifier version for consistency tracking';
COMMENT ON COLUMN prompt_results.google_ai_overview_snippet_hash IS 'Google AI Overview snippet hash for caching duplicate classifications';
COMMENT ON COLUMN prompt_results.google_ai_overview_portrayal_confidence IS 'Google AI Overview portrayal classification confidence score 0-1';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Added Google AI Overview support fields to prompt_results table';
END $$;
