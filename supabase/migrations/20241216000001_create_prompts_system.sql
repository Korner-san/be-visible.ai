-- Migration: Create prompts system tables
-- This migration creates the tables needed for the prompt generation and selection system

-- Create prompt_templates table (the 21 base templates)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  template text NOT NULL,
  category text,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create brand_prompts table (generated and improved prompts for each brand)
CREATE TABLE IF NOT EXISTS brand_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  source_template_code text REFERENCES prompt_templates(code) ON DELETE CASCADE NOT NULL,
  raw_prompt text NOT NULL,
  improved_prompt text,
  status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'improved', 'selected', 'archived')),
  category text,
  error_message text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Ensure no duplicate prompts for same brand
  UNIQUE(brand_id, raw_prompt)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_templates_code ON prompt_templates(code);
CREATE INDEX IF NOT EXISTS idx_brand_prompts_brand_id ON brand_prompts(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_prompts_status ON brand_prompts(status);
CREATE INDEX IF NOT EXISTS idx_brand_prompts_template_code ON brand_prompts(source_template_code);
CREATE INDEX IF NOT EXISTS idx_brand_prompts_brand_status ON brand_prompts(brand_id, status);

-- Add RLS policies for brand_prompts
ALTER TABLE brand_prompts ENABLE ROW LEVEL SECURITY;

-- Users can view prompts for their own brands and demo brands
CREATE POLICY "Users can view prompts for own brands and demo brands" ON brand_prompts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_prompts.brand_id 
      AND (brands.owner_user_id = auth.uid() OR brands.is_demo = true)
    )
  );

-- Users can insert prompts for their own brands (not demo brands)
CREATE POLICY "Users can create prompts for own brands" ON brand_prompts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_prompts.brand_id 
      AND brands.owner_user_id = auth.uid() 
      AND brands.is_demo = false
    )
  );

-- Users can update prompts for their own brands (not demo brands)
CREATE POLICY "Users can update prompts for own brands" ON brand_prompts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_prompts.brand_id 
      AND brands.owner_user_id = auth.uid() 
      AND brands.is_demo = false
    )
  );

-- Users can delete prompts for their own brands (not demo brands)
CREATE POLICY "Users can delete prompts for own brands" ON brand_prompts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_prompts.brand_id 
      AND brands.owner_user_id = auth.uid() 
      AND brands.is_demo = false
    )
  );

-- Add RLS policies for prompt_templates (read-only for all authenticated users)
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read prompt templates" ON prompt_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Insert the 21 base prompt templates from LLMSEO-master
INSERT INTO prompt_templates (code, template, category, description) VALUES
('q1', 'What do you know about [YourBrandName]?', 'Brand Awareness', 'Basic brand recognition query'),
('q2', 'Tell me about [YourBrandName] and what they offer.', 'Product Information', 'Product/service overview'),
('q3', 'What makes [YourBrandName] different from other companies?', 'Value Proposition', 'Unique value proposition'),
('q4', 'How does [YourBrandName] compare to competitors in [YourIndustry]?', 'Competitive Analysis', 'Industry comparison'),
('q5', 'What do people think about [YourBrandName]?', 'Public Perception', 'Brand sentiment and reputation'),
('q6', 'How can [YourBrandName] help solve [Problem YourBrandName Solves]?', 'Problem Resolution', 'Problem-solving capability'),
('q7', 'Can [YourBrandName] help me with [Task YourBrandName Helps With]?', 'Task Assistance', 'Specific task support'),
('q8', 'How can [YourBrandName] help me [Achieve Goal YourBrandName Facilitates]?', 'Goal Achievement', 'Goal facilitation'),
('q9', 'Does [YourBrandName] have [Specific Feature]?', 'Feature Recognition', 'Feature availability'),
('q10', 'Is [YourBrandName] good for [Specific Use Case]?', 'Use Case Application', 'Use case suitability'),
('q11', 'What are the alternatives to [Competitor A]?', 'Competitive Alternatives', 'Alternative solutions'),
('q12', 'Compare [YourBrandName] vs [Competitor B].', 'Direct Comparison', 'Head-to-head comparison'),
('q13', 'Which is better for [Specific Need]: [YourBrandName] or [Competitor C]?', 'Competitive Advantage', 'Need-based comparison'),
('q14', 'Who are the leading companies in [Product/Service Category YourBrandName Belongs To]?', 'Industry Leadership', 'Market leaders'),
('q15', 'What are the best [Product/Service Category YourBrandName Belongs To] solutions?', 'Category Recommendation', 'Category recommendations'),
('q16', 'What are the main challenges with [YourBrandName]?', 'Brand Challenges', 'Known issues or limitations'),
('q17', 'What concerns do users have about [YourBrandName]?', 'Customer Concerns', 'User concerns and feedback'),
('q18', 'Should I choose [YourBrandName] for [Specific Purpose]?', 'Purchase Decision', 'Decision support'),
('q19', 'Does [YourBrandName] meet [Specific Requirement]?', 'Requirement Matching', 'Requirements assessment'),
('q20', 'What is [YourBrandName]''s [Unique Selling Proposition]?', 'USP Handling', 'Unique selling point inquiry'),
('q21', 'How much does [YourBrandName] cost?', 'Pricing Information', 'Pricing and cost inquiry')
ON CONFLICT (code) DO UPDATE SET
  template = EXCLUDED.template,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  updated_at = timezone('utc'::text, now());

-- Add comments for documentation
COMMENT ON TABLE prompt_templates IS 'Base templates for generating brand-specific prompts';
COMMENT ON TABLE brand_prompts IS 'Generated and improved prompts for each brand, with selection status';
COMMENT ON COLUMN brand_prompts.status IS 'Status of the prompt: draft (generated), improved (enhanced by AI), selected (chosen for reports), archived (not used)';
COMMENT ON COLUMN brand_prompts.raw_prompt IS 'Original prompt generated from template with brand data substituted';
COMMENT ON COLUMN brand_prompts.improved_prompt IS 'AI-enhanced version of the raw prompt (optional)';
COMMENT ON COLUMN brand_prompts.error_message IS 'Error message if prompt improvement failed';
