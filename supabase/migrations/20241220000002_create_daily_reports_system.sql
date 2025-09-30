-- Create tables for daily Perplexity reports and results

-- Daily reports table - one per brand per day
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  report_date date NOT NULL,
  status text DEFAULT 'running' NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  total_prompts integer DEFAULT 0,
  completed_prompts integer DEFAULT 0,
  total_mentions integer DEFAULT 0,
  average_position numeric,
  sentiment_scores jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at timestamp with time zone,
  
  -- Unique constraint: one report per brand per date (allow multiple manual runs)
  UNIQUE(brand_id, report_date, created_at)
);

-- Prompt results table - individual Perplexity responses
CREATE TABLE IF NOT EXISTS prompt_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id uuid REFERENCES daily_reports(id) ON DELETE CASCADE NOT NULL,
  brand_prompt_id uuid REFERENCES brand_prompts(id) ON DELETE CASCADE NOT NULL,
  prompt_text text NOT NULL,
  perplexity_response text,
  response_time_ms integer,
  brand_mentioned boolean DEFAULT false,
  brand_position integer, -- Position where brand was first mentioned
  competitor_mentions jsonb DEFAULT '[]', -- Array of competitor mentions
  citations jsonb DEFAULT '[]', -- Array of citation objects
  sentiment_score numeric, -- -1 to 1 scale
  portrayal_type text, -- 'positive', 'neutral', 'negative', 'comparison', 'feature_focus', etc.
  error_message text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Index for quick lookups
  INDEX idx_prompt_results_report_id ON prompt_results(daily_report_id),
  INDEX idx_prompt_results_brand_prompt ON prompt_results(brand_prompt_id),
  INDEX idx_prompt_results_date ON prompt_results(created_at)
);

-- Citation details table - individual citations from Perplexity
CREATE TABLE IF NOT EXISTS citation_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_result_id uuid REFERENCES prompt_results(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  title text,
  domain text,
  content_type text, -- 'blog', 'product_page', 'press_release', 'news', 'documentation', 'other'
  relevance_score numeric, -- 0-1 score of how relevant to the brand
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  INDEX idx_citations_prompt_result ON citation_details(prompt_result_id)
);

-- RLS Policies
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_details ENABLE ROW LEVEL SECURITY;

-- Daily reports policies
CREATE POLICY "Users can view their own brand daily reports" ON daily_reports
  FOR SELECT USING (
    brand_id IN (
      SELECT id FROM brands WHERE owner_user_id = auth.uid() OR is_demo = true
    )
  );

CREATE POLICY "System can manage daily reports" ON daily_reports
  FOR ALL USING (true);

-- Prompt results policies  
CREATE POLICY "Users can view their own prompt results" ON prompt_results
  FOR SELECT USING (
    daily_report_id IN (
      SELECT id FROM daily_reports WHERE brand_id IN (
        SELECT id FROM brands WHERE owner_user_id = auth.uid() OR is_demo = true
      )
    )
  );

CREATE POLICY "System can manage prompt results" ON prompt_results
  FOR ALL USING (true);

-- Citation details policies
CREATE POLICY "Users can view their own citations" ON citation_details
  FOR SELECT USING (
    prompt_result_id IN (
      SELECT id FROM prompt_results WHERE daily_report_id IN (
        SELECT id FROM daily_reports WHERE brand_id IN (
          SELECT id FROM brands WHERE owner_user_id = auth.uid() OR is_demo = true
        )
      )
    )
  );

CREATE POLICY "System can manage citations" ON citation_details
  FOR ALL USING (true);

-- Comments for documentation
COMMENT ON TABLE daily_reports IS 'Daily Perplexity analysis reports for each brand';
COMMENT ON TABLE prompt_results IS 'Individual Perplexity API responses for each prompt';
COMMENT ON TABLE citation_details IS 'Citations and sources from Perplexity responses';

COMMENT ON COLUMN prompt_results.brand_position IS 'Character position where brand was first mentioned in response';
COMMENT ON COLUMN prompt_results.competitor_mentions IS 'JSON array of competitor names mentioned in response';
COMMENT ON COLUMN prompt_results.sentiment_score IS 'Sentiment analysis score from -1 (negative) to 1 (positive)';
COMMENT ON COLUMN prompt_results.portrayal_type IS 'How the brand was portrayed: positive, neutral, negative, comparison, etc.';
