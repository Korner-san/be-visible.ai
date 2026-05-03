-- Soft delete support for Manage Prompts.
-- Historical prompt_results remain connected to brand_prompts, while deleted prompts
-- are excluded from management UI and future execution.

ALTER TABLE public.brand_prompts
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.brand_prompts
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_brand_prompts_brand_deleted
ON public.brand_prompts(brand_id, deleted_at);

COMMENT ON COLUMN public.brand_prompts.deleted_at IS 'Soft delete timestamp. Deleted prompts are inactive and excluded from future execution.';
COMMENT ON COLUMN public.brand_prompts.deleted_by IS 'User who removed the prompt from Manage Prompts.';
