-- Fix RLS policies for brands table to ensure onboarding works properly

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own brands or demo brands" ON brands;
DROP POLICY IF EXISTS "Users can insert their own brands" ON brands;
DROP POLICY IF EXISTS "Users can update their own brands" ON brands;
DROP POLICY IF EXISTS "Users can delete their own brands" ON brands;

-- Enable RLS on brands table
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT: Users can view their own brands or demo brands
CREATE POLICY "Users can view own brands or demo brands" ON brands
  FOR SELECT USING (
    auth.uid() = owner_user_id OR 
    auth.uid() = user_id OR 
    is_demo = TRUE
  );

-- Policy for INSERT: Users can only insert brands they own
CREATE POLICY "Users can insert their own brands" ON brands
  FOR INSERT WITH CHECK (
    auth.uid() = owner_user_id OR 
    auth.uid() = user_id
  );

-- Policy for UPDATE: Users can only update their own brands (not demo brands)
CREATE POLICY "Users can update their own brands" ON brands
  FOR UPDATE USING (
    (auth.uid() = owner_user_id OR auth.uid() = user_id) AND 
    is_demo = FALSE
  ) WITH CHECK (
    (auth.uid() = owner_user_id OR auth.uid() = user_id) AND 
    is_demo = FALSE
  );

-- Policy for DELETE: Users can only delete their own brands (not demo brands)
CREATE POLICY "Users can delete their own brands" ON brands
  FOR DELETE USING (
    (auth.uid() = owner_user_id OR auth.uid() = user_id) AND 
    is_demo = FALSE
  );

-- Ensure the demo brand is properly set up
INSERT INTO brands (
  id, 
  owner_user_id, 
  user_id,
  name, 
  domain, 
  is_demo, 
  onboarding_completed, 
  first_report_status
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000', -- System user
  '00000000-0000-0000-0000-000000000000', -- System user
  'TechFlow Solutions',
  'techflow-demo.ai',
  TRUE,
  TRUE,
  'succeeded'
) ON CONFLICT (id) DO UPDATE SET
  is_demo = TRUE,
  onboarding_completed = TRUE,
  first_report_status = 'succeeded';

-- Add helpful logging for development
DO $$
BEGIN
  IF current_setting('log_statement') = 'all' THEN
    RAISE NOTICE 'Fixed RLS policies for brands table';
  END IF;
END $$;
