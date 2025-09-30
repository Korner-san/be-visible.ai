-- Add source field to track AI-generated vs user-added prompts
ALTER TABLE brand_prompts 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'ai_generated' CHECK (source IN ('ai_generated', 'user_added'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_brand_prompts_source ON brand_prompts(source);

-- Add generation metadata for GPT context (optional)
ALTER TABLE brand_prompts 
ADD COLUMN IF NOT EXISTS generation_metadata jsonb DEFAULT '{}';

-- Update existing prompts to have ai_generated source
UPDATE brand_prompts 
SET source = 'ai_generated' 
WHERE source IS NULL;
