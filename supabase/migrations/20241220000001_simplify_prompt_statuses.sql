-- Simplify prompt statuses to just 'active' and 'inactive'
-- Remove draft, improved, selected, archived - just have active/inactive

-- First, update existing statuses to the new simplified system
UPDATE brand_prompts 
SET status = CASE 
  WHEN status = 'selected' THEN 'active'
  WHEN status IN ('draft', 'improved', 'archived') THEN 'inactive'
  ELSE 'inactive'
END;

-- Drop the old constraint
ALTER TABLE brand_prompts DROP CONSTRAINT IF EXISTS brand_prompts_status_check;

-- Add the new simplified constraint
ALTER TABLE brand_prompts ADD CONSTRAINT brand_prompts_status_check 
  CHECK (status IN ('active', 'inactive'));

-- Add a comment to document the change
COMMENT ON COLUMN brand_prompts.status IS 'Simplified status: active (user selected for use) or inactive (not selected)';
