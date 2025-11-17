-- Add retry tracking columns to url_inventory
-- Allows tracking of failed extraction attempts with a cap

ALTER TABLE public.url_inventory
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_retry_error TEXT;

COMMENT ON COLUMN public.url_inventory.retry_count IS 'Number of times extraction was attempted for this URL';
COMMENT ON COLUMN public.url_inventory.last_retry_at IS 'Last time extraction was attempted';
COMMENT ON COLUMN public.url_inventory.last_retry_error IS 'Error message from last failed extraction attempt';

-- Create index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_url_inventory_retry_status 
ON public.url_inventory(content_extracted, retry_count)
WHERE content_extracted = false;

