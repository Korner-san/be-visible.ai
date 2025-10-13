-- Table 1: URL Inventory (tracks all URLs ever seen)
CREATE TABLE IF NOT EXISTS url_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  normalized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_cited_at TIMESTAMP DEFAULT NOW(),
  citation_count INT DEFAULT 1,
  content_extracted BOOLEAN DEFAULT FALSE,
  content_extracted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: URL Content Facts (stores Tavily extraction + LLM classification)
CREATE TABLE IF NOT EXISTS url_content_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_id UUID REFERENCES url_inventory(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  raw_content TEXT,
  content_snippet TEXT,
  
  -- LLM Classifications
  content_structure_category TEXT,
  domain_role_category TEXT,
  classification_confidence FLOAT,
  classifier_version TEXT DEFAULT 'v1',
  
  extracted_at TIMESTAMP DEFAULT NOW(),
  classified_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(url_id)
);

-- Table 3: URL Citations (links URLs to specific prompts/responses)
CREATE TABLE IF NOT EXISTS url_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_id UUID REFERENCES url_inventory(id) ON DELETE CASCADE,
  prompt_result_id UUID REFERENCES prompt_results(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  cited_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(url_id, prompt_result_id, provider)
);

-- Table 4: Prompt Intent Classifications (stores daily prompt intent analysis)
CREATE TABLE IF NOT EXISTS prompt_intent_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_prompt_id UUID REFERENCES brand_prompts(id) ON DELETE CASCADE,
  daily_report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  intent_category TEXT NOT NULL,
  classification_confidence FLOAT,
  classified_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(brand_prompt_id, daily_report_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_url_inventory_domain ON url_inventory(domain);
CREATE INDEX IF NOT EXISTS idx_url_inventory_content_extracted ON url_inventory(content_extracted);
CREATE INDEX IF NOT EXISTS idx_url_citations_provider ON url_citations(provider);
CREATE INDEX IF NOT EXISTS idx_url_citations_prompt_result ON url_citations(prompt_result_id);
CREATE INDEX IF NOT EXISTS idx_prompt_intent_daily_report ON prompt_intent_classifications(daily_report_id);

-- Enable RLS
ALTER TABLE url_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_content_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_intent_classifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can see their own brand's data)
CREATE POLICY "Users can view their brand's URL inventory"
  ON url_inventory FOR SELECT
  USING (
    domain IN (
      SELECT DISTINCT domain FROM url_citations uc
      JOIN prompt_results pr ON pr.id = uc.prompt_result_id
      JOIN daily_reports dr ON dr.id = pr.daily_report_id
      JOIN brands b ON b.id = dr.brand_id
      WHERE b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their brand's URL content"
  ON url_content_facts FOR SELECT
  USING (
    url_id IN (
      SELECT id FROM url_inventory
      WHERE domain IN (
        SELECT DISTINCT domain FROM url_citations uc
        JOIN prompt_results pr ON pr.id = uc.prompt_result_id
        JOIN daily_reports dr ON dr.id = pr.daily_report_id
        JOIN brands b ON b.id = dr.brand_id
        WHERE b.owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can view their brand's URL citations"
  ON url_citations FOR SELECT
  USING (
    prompt_result_id IN (
      SELECT pr.id FROM prompt_results pr
      JOIN daily_reports dr ON dr.id = pr.daily_report_id
      JOIN brands b ON b.id = dr.brand_id
      WHERE b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their brand's prompt intents"
  ON prompt_intent_classifications FOR SELECT
  USING (
    daily_report_id IN (
      SELECT dr.id FROM daily_reports dr
      JOIN brands b ON b.id = dr.brand_id
      WHERE b.owner_user_id = auth.uid()
    )
  );

