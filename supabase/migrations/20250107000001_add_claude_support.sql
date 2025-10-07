-- Add Claude support to prompt_results table
-- This migration adds fields to store Claude API responses alongside Perplexity

-- Add Claude response field
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_response text;

-- Add Claude response time field  
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_response_time_ms integer;

-- Add Claude citations field (even though Claude doesn't provide structured citations, we'll store empty arrays for consistency)
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_citations jsonb DEFAULT '[]';

-- Add Claude portrayal classification fields (same structure as Perplexity)
ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_portrayal_type text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_classifier_stage text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_classifier_version text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_snippet_hash text;

ALTER TABLE prompt_results 
ADD COLUMN IF NOT EXISTS claude_portrayal_confidence numeric;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_results_claude_portrayal_type ON prompt_results(claude_portrayal_type);
CREATE INDEX IF NOT EXISTS idx_prompt_results_claude_classifier_stage ON prompt_results(claude_classifier_stage);

-- Add comments for documentation
COMMENT ON COLUMN prompt_results.claude_response IS 'Claude API response text for this prompt';
COMMENT ON COLUMN prompt_results.claude_response_time_ms IS 'Claude API response time in milliseconds';
COMMENT ON COLUMN prompt_results.claude_citations IS 'Claude citations array (empty for Claude as it does not provide structured citations)';
COMMENT ON COLUMN prompt_results.claude_portrayal_type IS 'Claude portrayal classification: RECOMMENDATION, COMPARISON, etc.';
COMMENT ON COLUMN prompt_results.claude_classifier_stage IS 'Claude classification stage: llm, keyword, null';
COMMENT ON COLUMN prompt_results.claude_classifier_version IS 'Claude classifier version for consistency tracking';
COMMENT ON COLUMN prompt_results.claude_snippet_hash IS 'Claude snippet hash for caching duplicate classifications';
COMMENT ON COLUMN prompt_results.claude_portrayal_confidence IS 'Claude portrayal classification confidence score 0-1';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Added Claude support fields to prompt_results table';
END $$;
