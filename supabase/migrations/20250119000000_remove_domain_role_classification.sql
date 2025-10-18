-- Remove domain role classification from the system
-- This migration removes the domain_role_category field and related logic

-- Drop the domain_role_category column from url_content_facts table
ALTER TABLE url_content_facts DROP COLUMN IF EXISTS domain_role_category;

-- Drop the prompt_intent_classifications table since we no longer classify prompts
DROP TABLE IF EXISTS prompt_intent_classifications;

-- Update the daily_reports table to remove prompts_classified field
ALTER TABLE daily_reports DROP COLUMN IF EXISTS prompts_classified;

-- Add a comment to document the change
COMMENT ON TABLE url_content_facts IS 'URL content facts with content structure classification only (domain role classification removed)';
