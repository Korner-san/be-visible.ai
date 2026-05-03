-- Fix onboarding wave-2 activation by aligning the active prompt limit with
-- the current onboarding prompt set. Wave 2 is intentionally inactive during
-- onboarding, then becomes active after the full onboarding report is complete.

CREATE OR REPLACE FUNCTION public.get_active_prompt_limit(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(u.subscription_plan, 'starter'))
    WHEN 'free_trial' THEN 5
    WHEN 'business' THEN 200
    WHEN 'corporate' THEN 200
    WHEN 'starter' THEN 50
    WHEN 'basic' THEN 50
    WHEN 'advanced' THEN 50
    ELSE 50
  END
  FROM public.users u
  WHERE u.id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.enforce_prompt_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id uuid;
  user_plan text;
  active_count integer;
  max_prompts integer;
BEGIN
  -- Keep both prompt status columns consistent for all callers.
  NEW.is_active := (NEW.status = 'active');

  IF NEW.is_active = true THEN
    SELECT b.owner_user_id, COALESCE(u.subscription_plan, 'starter')
    INTO owner_id, user_plan
    FROM public.brands b
    LEFT JOIN public.users u ON u.id = b.owner_user_id
    WHERE b.id = NEW.brand_id;

    max_prompts := COALESCE(public.get_active_prompt_limit(owner_id), 50);

    SELECT count(*)
    INTO active_count
    FROM public.brand_prompts bp
    WHERE bp.brand_id = NEW.brand_id
      AND bp.is_active = true
      AND bp.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF active_count >= max_prompts THEN
      RAISE EXCEPTION 'Maximum active prompts for % plan is %. You currently have % active prompts.',
        COALESCE(user_plan, 'starter'), max_prompts, active_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_prompt_limit_trigger ON public.brand_prompts;
CREATE TRIGGER enforce_prompt_limit_trigger
  BEFORE INSERT OR UPDATE ON public.brand_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_prompt_limit();

-- Repair brands already stuck with only wave-1 active prompts after onboarding.
WITH ranked_prompts AS (
  SELECT
    bp.id,
    row_number() OVER (
      PARTITION BY bp.brand_id
      ORDER BY bp.created_at ASC, bp.id ASC
    ) AS prompt_rank,
    public.get_active_prompt_limit(b.owner_user_id) AS prompt_limit
  FROM public.brand_prompts bp
  JOIN public.brands b ON b.id = bp.brand_id
  WHERE b.onboarding_completed = true
    AND b.first_report_status IN ('succeeded', 'phase1_complete')
    AND COALESCE(bp.onboarding_wave, 1) IN (1, 2)
)
UPDATE public.brand_prompts bp
SET status = 'active'
FROM ranked_prompts rp
WHERE bp.id = rp.id
  AND rp.prompt_rank <= COALESCE(rp.prompt_limit, 50)
  AND bp.status <> 'active';

COMMENT ON FUNCTION public.get_active_prompt_limit(uuid) IS 'Returns the maximum active prompts allowed for a user plan.';
COMMENT ON FUNCTION public.enforce_prompt_limit() IS 'Keeps brand_prompts.is_active synced with status and enforces plan active prompt limits.';
