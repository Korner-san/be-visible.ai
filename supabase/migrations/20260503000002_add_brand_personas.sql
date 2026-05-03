-- Add brand personas collected from the Personas page.
-- Personas are saved for future prompt simulation but are not used by prompt execution yet.

CREATE TABLE IF NOT EXISTS public.brand_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brand_personas_description_not_empty CHECK (length(trim(description)) > 0),
  CONSTRAINT brand_personas_name_not_empty CHECK (length(trim(name)) > 0),
  UNIQUE (brand_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brand_personas_brand_id ON public.brand_personas(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_personas_owner_user_id ON public.brand_personas(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_brand_personas_brand_active ON public.brand_personas(brand_id, is_active);

CREATE OR REPLACE FUNCTION public.enforce_starter_persona_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_plan text;
  active_count integer;
BEGIN
  IF NEW.is_active IS DISTINCT FROM false THEN
    SELECT COALESCE(u.subscription_plan, 'basic')
    INTO user_plan
    FROM public.users u
    WHERE u.id = NEW.owner_user_id;

    user_plan := COALESCE(user_plan, 'basic');

    IF lower(user_plan) IN ('starter', 'basic', 'free_trial') THEN
      SELECT count(*)
      INTO active_count
      FROM public.brand_personas bp
      WHERE bp.brand_id = NEW.brand_id
        AND bp.is_active = true
        AND (TG_OP <> 'UPDATE' OR bp.id <> NEW.id);

      IF active_count >= 3 THEN
        RAISE EXCEPTION 'Starter plans can save a maximum of 3 personas.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_starter_persona_limit_trigger ON public.brand_personas;
CREATE TRIGGER enforce_starter_persona_limit_trigger
  BEFORE INSERT OR UPDATE OF is_active, brand_id, owner_user_id
  ON public.brand_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_starter_persona_limit();

DROP TRIGGER IF EXISTS update_brand_personas_updated_at ON public.brand_personas;
CREATE TRIGGER update_brand_personas_updated_at
  BEFORE UPDATE ON public.brand_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.brand_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_personas_select_policy" ON public.brand_personas;
CREATE POLICY "brand_personas_select_policy" ON public.brand_personas
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_personas.brand_id
        AND (b.owner_user_id = auth.uid() OR b.is_demo = true)
    )
  );

DROP POLICY IF EXISTS "brand_personas_insert_policy" ON public.brand_personas;
CREATE POLICY "brand_personas_insert_policy" ON public.brand_personas
  FOR INSERT WITH CHECK (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_personas.brand_id
        AND b.owner_user_id = auth.uid()
        AND b.is_demo = false
    )
  );

DROP POLICY IF EXISTS "brand_personas_update_policy" ON public.brand_personas;
CREATE POLICY "brand_personas_update_policy" ON public.brand_personas
  FOR UPDATE USING (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_personas.brand_id
        AND b.owner_user_id = auth.uid()
        AND b.is_demo = false
    )
  ) WITH CHECK (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_personas.brand_id
        AND b.owner_user_id = auth.uid()
        AND b.is_demo = false
    )
  );

DROP POLICY IF EXISTS "brand_personas_delete_policy" ON public.brand_personas;
CREATE POLICY "brand_personas_delete_policy" ON public.brand_personas
  FOR DELETE USING (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_personas.brand_id
        AND b.owner_user_id = auth.uid()
        AND b.is_demo = false
    )
  );

COMMENT ON TABLE public.brand_personas IS 'User-defined personas to simulate in future prompt execution.';
COMMENT ON COLUMN public.brand_personas.description IS 'Freeform persona description supplied by the user. Not used in prompt execution yet.';
