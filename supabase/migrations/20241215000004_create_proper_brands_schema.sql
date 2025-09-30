-- Create proper brands table schema with all required columns
-- This migration will drop any broken/empty brands table and recreate it correctly

-- Drop existing broken brands table if it exists with no proper columns
DROP TABLE IF EXISTS public.brands CASCADE;
DROP TABLE IF EXISTS public.daily_reports CASCADE;

-- Create brands table with correct structure
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  domain text,
  is_demo boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_answers jsonb,
  first_report_status text NOT NULL DEFAULT 'idle' 
    CHECK (first_report_status IN ('idle', 'queued', 'running', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create daily_reports table (minimal structure for now)
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  score integer,
  models_indexed jsonb,
  bot_scans integer,
  ai_sessions integer,
  pages_indexed integer,
  raw_ai_responses jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_brands_owner_user_id ON public.brands(owner_user_id);
CREATE INDEX idx_brands_is_demo ON public.brands(is_demo);
CREATE INDEX idx_brands_onboarding_completed ON public.brands(onboarding_completed);
CREATE INDEX idx_brands_composite ON public.brands(owner_user_id, is_demo, onboarding_completed);

CREATE INDEX idx_daily_reports_brand_id ON public.daily_reports(brand_id);
CREATE INDEX idx_daily_reports_date ON public.daily_reports(report_date);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_brands_updated_at 
  BEFORE UPDATE ON public.brands 
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Enable RLS on both tables
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for brands table

-- SELECT: Users can view their own brands OR demo brands
CREATE POLICY "brands_select_policy" ON public.brands
  FOR SELECT USING (
    owner_user_id = auth.uid() OR is_demo = true
  );

-- INSERT: Users can only insert brands they own
CREATE POLICY "brands_insert_policy" ON public.brands
  FOR INSERT WITH CHECK (
    owner_user_id = auth.uid()
  );

-- UPDATE: Users can only update their own non-demo brands
CREATE POLICY "brands_update_policy" ON public.brands
  FOR UPDATE USING (
    owner_user_id = auth.uid() AND is_demo = false
  ) WITH CHECK (
    owner_user_id = auth.uid() AND is_demo = false
  );

-- DELETE: Users can only delete their own non-demo brands
CREATE POLICY "brands_delete_policy" ON public.brands
  FOR DELETE USING (
    owner_user_id = auth.uid() AND is_demo = false
  );

-- RLS Policies for daily_reports table

-- SELECT: Users can view reports for their own brands OR demo brands
CREATE POLICY "daily_reports_select_policy" ON public.daily_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = daily_reports.brand_id
      AND (brands.owner_user_id = auth.uid() OR brands.is_demo = true)
    )
  );

-- INSERT: Users can only insert reports for their own brands
CREATE POLICY "daily_reports_insert_policy" ON public.daily_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = daily_reports.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update reports for their own brands
CREATE POLICY "daily_reports_update_policy" ON public.daily_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = daily_reports.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = daily_reports.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete reports for their own brands
CREATE POLICY "daily_reports_delete_policy" ON public.daily_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.brands
      WHERE brands.id = daily_reports.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- Add helpful logging for development
DO $$
BEGIN
  RAISE NOTICE 'Created proper brands and daily_reports tables with RLS policies';
END $$;
