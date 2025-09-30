-- Fix existing brands that might not have the new fields populated
-- This ensures all existing users go through onboarding

-- Update existing brands to have proper onboarding status
UPDATE brands 
SET 
  is_demo = COALESCE(is_demo, false),
  onboarding_completed = COALESCE(onboarding_completed, false),
  onboarding_answers = COALESCE(onboarding_answers, '{}'),
  first_report_status = COALESCE(first_report_status, 'idle'),
  owner_user_id = COALESCE(owner_user_id, user_id)
WHERE is_demo IS NULL OR onboarding_completed IS NULL OR owner_user_id IS NULL;

-- For existing real brands (non-demo), set onboarding to incomplete
-- This forces existing users to complete onboarding
UPDATE brands 
SET 
  onboarding_completed = false,
  first_report_status = 'idle'
WHERE is_demo = false 
  AND name != 'TechFlow Solutions'  -- Don't touch the demo brand
  AND id != '00000000-0000-0000-0000-000000000001';

-- Ensure all non-demo brands have proper constraints
ALTER TABLE brands 
ALTER COLUMN is_demo SET DEFAULT false,
ALTER COLUMN onboarding_completed SET DEFAULT false,
ALTER COLUMN onboarding_answers SET DEFAULT '{}',
ALTER COLUMN first_report_status SET DEFAULT 'idle';

-- Add logging for development
DO $$
BEGIN
  IF current_setting('log_statement') = 'all' THEN
    RAISE NOTICE 'Updated existing brands to require onboarding completion';
  END IF;
END $$;
