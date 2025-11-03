-- ============================================================================
-- Migration: Add User Plans and ChatGPT Pipeline Support
-- Date: 2025-11-01
-- Purpose: Transition to ChatGPT-only Basic plan with tiered pricing
-- ============================================================================

-- 1. Add subscription_plan column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic';

-- Valid plans: 'free_trial', 'basic', 'advanced', 'business', 'corporate'
COMMENT ON COLUMN users.subscription_plan IS 'User subscription plan: free_trial (5 prompts, no reports), basic (10 prompts, ChatGPT only), advanced (15 prompts, all models), business, corporate';

-- 2. Add plan metadata
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS plan_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reports_enabled BOOLEAN DEFAULT true;

-- 3. Update existing users to basic plan (default)
UPDATE users 
SET subscription_plan = 'basic',
    plan_start_date = NOW(),
    reports_enabled = true
WHERE subscription_plan IS NULL;

-- 4. Set kk1995current@gmail.com as free trial (no reports)
UPDATE users 
SET subscription_plan = 'free_trial',
    reports_enabled = false
WHERE email = 'kk1995current@gmail.com';

-- 5. Deactivate all prompts for kk1995current@gmail.com
UPDATE brand_prompts bp
SET is_active = false
FROM brands b
WHERE bp.brand_id = b.id
  AND b.owner_user_id IN (
    SELECT id FROM users WHERE email = 'kk1995current@gmail.com'
  );

-- 6. Ensure korenk878@gmail.com has basic plan with ChatGPT enabled
-- (User should already exist from manual creation)
UPDATE users 
SET subscription_plan = 'basic',
    plan_start_date = NOW(),
    reports_enabled = true
WHERE email = 'korenk878@gmail.com';

-- 7. Limit active prompts to 10 for basic plan users
-- Deactivate excess prompts (keep 10 most recently modified)
WITH user_prompts AS (
  SELECT 
    bp.id,
    bp.brand_id,
    b.owner_user_id,
    u.subscription_plan,
    ROW_NUMBER() OVER (
      PARTITION BY b.owner_user_id 
      ORDER BY bp.updated_at DESC NULLS LAST, bp.created_at DESC
    ) as prompt_rank
  FROM brand_prompts bp
  JOIN brands b ON bp.brand_id = b.id
  JOIN users u ON b.owner_user_id = u.id
  WHERE bp.is_active = true
    AND u.subscription_plan IN ('basic', 'free_trial')
)
UPDATE brand_prompts
SET is_active = false
FROM user_prompts up
WHERE brand_prompts.id = up.id
  AND (
    (up.subscription_plan = 'basic' AND up.prompt_rank > 10)
    OR (up.subscription_plan = 'free_trial' AND up.prompt_rank > 5)
  );

-- 8. Create function to enforce prompt limits on insert/update
CREATE OR REPLACE FUNCTION enforce_prompt_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
  active_count INTEGER;
  max_prompts INTEGER;
BEGIN
  -- Get user's plan
  SELECT u.subscription_plan INTO user_plan
  FROM brands b
  JOIN users u ON b.owner_user_id = u.id
  WHERE b.id = NEW.brand_id;
  
  -- Set max prompts based on plan
  max_prompts := CASE user_plan
    WHEN 'free_trial' THEN 5
    WHEN 'basic' THEN 10
    WHEN 'advanced' THEN 15
    WHEN 'business' THEN 20
    WHEN 'corporate' THEN 30
    ELSE 10
  END;
  
  -- Count active prompts for this brand
  SELECT COUNT(*) INTO active_count
  FROM brand_prompts
  WHERE brand_id = NEW.brand_id
    AND is_active = true
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  -- If trying to activate and would exceed limit, prevent it
  IF NEW.is_active = true AND active_count >= max_prompts THEN
    RAISE EXCEPTION 'Maximum active prompts for % plan is %. You currently have % active prompts.', 
      user_plan, max_prompts, active_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS enforce_prompt_limit_trigger ON brand_prompts;
CREATE TRIGGER enforce_prompt_limit_trigger
  BEFORE INSERT OR UPDATE ON brand_prompts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_prompt_limit();

-- 9. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan ON users(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_users_reports_enabled ON users(reports_enabled);

-- 10. Update RLS policies to respect reports_enabled flag
-- (Existing policies will continue to work, but we'll add plan-aware logic)

-- 11. Create view for active reportable users
CREATE OR REPLACE VIEW active_reportable_users AS
SELECT 
  u.id,
  u.email,
  u.subscription_plan,
  u.reports_enabled,
  COUNT(DISTINCT b.id) as brand_count,
  COUNT(DISTINCT bp.id) FILTER (WHERE bp.is_active = true) as active_prompt_count
FROM users u
LEFT JOIN brands b ON b.owner_user_id = u.id
LEFT JOIN brand_prompts bp ON bp.brand_id = b.id
WHERE u.reports_enabled = true
  AND u.subscription_plan != 'free_trial'
GROUP BY u.id, u.email, u.subscription_plan, u.reports_enabled;

COMMENT ON VIEW active_reportable_users IS 'Users eligible for daily report generation (excludes free_trial, reports_enabled=false)';


