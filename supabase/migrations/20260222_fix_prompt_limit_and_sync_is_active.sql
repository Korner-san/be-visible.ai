-- ============================================================================
-- Migration: Fix prompt limit to 30 and sync is_active with status
-- Date: 2026-02-22
-- Purpose:
--   1. Raise the default (NULL plan) prompt limit from 10 → 30 so that the
--      new 30-prompt onboarding system works for users without an explicit plan.
--   2. Auto-sync the is_active boolean with the status column inside the
--      enforce_prompt_limit trigger so callers only need to update status.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_prompt_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
  active_count INTEGER;
  max_prompts INTEGER;
BEGIN
  -- Always keep is_active in sync with status so both columns stay consistent
  NEW.is_active := (NEW.status = 'active');

  -- Only enforce limit when activating a prompt
  IF NEW.is_active = true THEN
    -- Get user's plan
    SELECT u.subscription_plan INTO user_plan
    FROM brands b
    JOIN users u ON b.owner_user_id = u.id
    WHERE b.id = NEW.brand_id;

    -- Set max prompts based on plan
    max_prompts := CASE user_plan
      WHEN 'free_trial' THEN 5
      WHEN 'basic'      THEN 10
      WHEN 'advanced'   THEN 15
      WHEN 'business'   THEN 20
      WHEN 'corporate'  THEN 30
      ELSE 30  -- Default: allow 30 for the new onboarding system
    END;

    -- Count currently active prompts for this brand (excluding the row being updated)
    SELECT COUNT(*) INTO active_count
    FROM brand_prompts
    WHERE brand_id = NEW.brand_id
      AND is_active = true
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    -- Block the update if it would exceed the plan limit
    IF active_count >= max_prompts THEN
      RAISE EXCEPTION 'Maximum active prompts for % plan is %. You currently have % active prompts.',
        user_plan, max_prompts, active_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-attach the trigger (DROP + CREATE to make sure settings are fresh)
DROP TRIGGER IF EXISTS enforce_prompt_limit_trigger ON brand_prompts;
CREATE TRIGGER enforce_prompt_limit_trigger
  BEFORE INSERT OR UPDATE ON brand_prompts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_prompt_limit();

-- Back-fill is_active for any rows where it is out of sync with status
UPDATE brand_prompts
SET is_active = (status = 'active')
WHERE is_active IS DISTINCT FROM (status = 'active');
