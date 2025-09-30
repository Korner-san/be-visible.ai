-- Migration: Add onboarding system fields to brands table
-- This migration adds the required fields for the onboarding state machine

-- Add new columns to brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS onboarding_answers jsonb DEFAULT '{}' NOT NULL,
ADD COLUMN IF NOT EXISTS first_report_status text DEFAULT 'idle' NOT NULL,
ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- Create constraint for first_report_status enum
ALTER TABLE brands 
ADD CONSTRAINT brands_first_report_status_check 
CHECK (first_report_status IN ('idle', 'queued', 'running', 'succeeded', 'failed'));

-- Update owner_user_id to reference user_id for existing records
UPDATE brands SET owner_user_id = user_id WHERE owner_user_id IS NULL;

-- Make owner_user_id NOT NULL after populating
ALTER TABLE brands ALTER COLUMN owner_user_id SET NOT NULL;

-- Add foreign key constraint for owner_user_id
ALTER TABLE brands 
ADD CONSTRAINT brands_owner_user_id_fkey 
FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create global demo brand (read-only for all users)
INSERT INTO brands (
  id, 
  user_id, 
  owner_user_id, 
  name, 
  domain, 
  is_demo, 
  onboarding_completed, 
  first_report_status
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', -- Demo user ID
  '00000000-0000-0000-0000-000000000001',
  'TechFlow Solutions',
  'techflow-demo.ai',
  true,
  true,
  'succeeded'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  is_demo = EXCLUDED.is_demo,
  onboarding_completed = EXCLUDED.onboarding_completed,
  first_report_status = EXCLUDED.first_report_status;

-- Create demo user for the demo brand
INSERT INTO users (
  id,
  email,
  subscription_plan
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo@bevisible.ai',
  'basic'
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  subscription_plan = EXCLUDED.subscription_plan;

-- Create demo daily report
INSERT INTO daily_reports (
  id,
  brand_id,
  report_date,
  report_score,
  models_indexed,
  bot_scans,
  ai_sessions,
  pages_indexed,
  raw_ai_responses
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  CURRENT_DATE,
  85,
  '{"gpt4": true, "claude": true, "perplexity": true}',
  247,
  189,
  23,
  '{"demo": true, "sample_data": "This is demo data for TechFlow Solutions"}'
) ON CONFLICT (brand_id, report_date) DO UPDATE SET
  report_score = EXCLUDED.report_score,
  models_indexed = EXCLUDED.models_indexed,
  bot_scans = EXCLUDED.bot_scans,
  ai_sessions = EXCLUDED.ai_sessions,
  pages_indexed = EXCLUDED.pages_indexed,
  raw_ai_responses = EXCLUDED.raw_ai_responses;

-- Update RLS policies to allow read access to demo brands
DROP POLICY IF EXISTS "Users can view own brands" ON brands;
CREATE POLICY "Users can view own brands and demo brands" ON brands
  FOR SELECT USING (
    auth.uid() = owner_user_id OR is_demo = true
  );

-- Update other brand policies to use owner_user_id
DROP POLICY IF EXISTS "Users can create own brands" ON brands;
CREATE POLICY "Users can create own brands" ON brands
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id AND is_demo = false);

DROP POLICY IF EXISTS "Users can update own brands" ON brands;
CREATE POLICY "Users can update own brands" ON brands
  FOR UPDATE USING (auth.uid() = owner_user_id AND is_demo = false);

DROP POLICY IF EXISTS "Users can delete own brands" ON brands;
CREATE POLICY "Users can delete own brands" ON brands
  FOR DELETE USING (auth.uid() = owner_user_id AND is_demo = false);

-- Update daily_reports policies to allow reading demo brand reports
DROP POLICY IF EXISTS "Users can view reports for own brands" ON daily_reports;
CREATE POLICY "Users can view reports for own brands and demo brands" ON daily_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = daily_reports.brand_id 
      AND (brands.owner_user_id = auth.uid() OR brands.is_demo = true)
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_brands_owner_user_id ON brands(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_brands_is_demo ON brands(is_demo);
CREATE INDEX IF NOT EXISTS idx_brands_onboarding_completed ON brands(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_brands_first_report_status ON brands(first_report_status);

-- Add comments for documentation
COMMENT ON COLUMN brands.is_demo IS 'Whether this is a demo brand visible to all users (read-only)';
COMMENT ON COLUMN brands.onboarding_completed IS 'Whether the user has completed the onboarding process for this brand';
COMMENT ON COLUMN brands.onboarding_answers IS 'JSON data storing the 10 onboarding questions and answers';
COMMENT ON COLUMN brands.first_report_status IS 'Status of the first report generation: idle|queued|running|succeeded|failed';
COMMENT ON COLUMN brands.owner_user_id IS 'The user who owns this brand (same as user_id but clearer naming)';
