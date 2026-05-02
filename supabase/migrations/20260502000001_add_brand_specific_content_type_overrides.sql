-- Brand-specific content type overrides.
-- Used for business-type-specific taxonomies without changing the global URL
-- classification shared by general users.

CREATE TABLE IF NOT EXISTS brand_url_content_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  url_id UUID NOT NULL REFERENCES url_inventory(id) ON DELETE CASCADE,
  content_structure_category TEXT NOT NULL,
  classification_confidence FLOAT,
  classifier_version TEXT NOT NULL DEFAULT 'brand_override_v1',
  classified_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(brand_id, url_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_url_content_facts_brand_url
  ON brand_url_content_facts(brand_id, url_id);

CREATE INDEX IF NOT EXISTS idx_brand_url_content_facts_category
  ON brand_url_content_facts(brand_id, content_structure_category);

ALTER TABLE brand_url_content_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their brand URL content overrides"
  ON brand_url_content_facts FOR SELECT
  USING (
    brand_id IN (
      SELECT id FROM brands
      WHERE owner_user_id = auth.uid() OR is_demo = true
    )
  );

DROP FUNCTION IF EXISTS public.get_content_type_stats(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_content_type_stats(
  p_brand_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
  category TEXT,
  unique_urls BIGINT,
  total_citations BIGINT,
  percentage NUMERIC,
  top_urls JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller owns this brand (or it's a demo brand)
  IF NOT EXISTS (
    SELECT 1 FROM brands
    WHERE id = p_brand_id
      AND (owner_user_id = auth.uid() OR is_demo = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not own this brand';
  END IF;

  RETURN QUERY
  WITH brand_context AS (
    SELECT id, user_business_type
    FROM brands
    WHERE id = p_brand_id
  ),
  brand_reports AS (
    SELECT dr.id
    FROM daily_reports dr
    WHERE dr.brand_id = p_brand_id
      AND dr.status = 'completed'
      AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
      AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
  ),
  brand_prompt_results AS (
    SELECT pr.id
    FROM prompt_results pr
    WHERE pr.daily_report_id IN (SELECT id FROM brand_reports)
      AND pr.provider_status = 'ok'
  ),
  brand_citations AS (
    SELECT
      uc.url_id,
      uc.prompt_result_id
    FROM url_citations uc
    WHERE uc.prompt_result_id IN (SELECT id FROM brand_prompt_results)
  ),
  latest_global_classification AS (
    SELECT DISTINCT ON (url_id)
      url_id,
      content_structure_category
    FROM url_content_facts
    ORDER BY url_id, extracted_at DESC NULLS LAST
  ),
  latest_brand_classification AS (
    SELECT DISTINCT ON (url_id)
      url_id,
      content_structure_category
    FROM brand_url_content_facts
    WHERE brand_id = p_brand_id
    ORDER BY url_id, classified_at DESC NULLS LAST
  ),
  citation_with_category AS (
    SELECT
      bc.url_id,
      ui.url AS original_url,
      COALESCE(
        CASE
          WHEN (SELECT user_business_type FROM brand_context) = 'real_estate_israel'
          THEN lbc.content_structure_category
          ELSE NULL
        END,
        lgc.content_structure_category,
        'UNCLASSIFIED'
      ) AS content_category
    FROM brand_citations bc
    LEFT JOIN url_inventory ui ON ui.id = bc.url_id
    LEFT JOIN latest_global_classification lgc ON lgc.url_id = bc.url_id
    LEFT JOIN latest_brand_classification lbc ON lbc.url_id = bc.url_id
  ),
  category_agg AS (
    SELECT
      cwc.content_category,
      COUNT(DISTINCT cwc.url_id) AS unique_url_count,
      COUNT(*) AS citation_count
    FROM citation_with_category cwc
    GROUP BY cwc.content_category
  ),
  total AS (
    SELECT SUM(citation_count) AS total_count FROM category_agg
  ),
  url_counts AS (
    SELECT
      cwc.content_category,
      cwc.original_url,
      COUNT(*) AS url_citation_count,
      ROW_NUMBER() OVER (PARTITION BY cwc.content_category ORDER BY COUNT(*) DESC) AS rn
    FROM citation_with_category cwc
    WHERE cwc.original_url IS NOT NULL
    GROUP BY cwc.content_category, cwc.original_url
  )
  SELECT
    ca.content_category,
    ca.unique_url_count,
    ca.citation_count,
    ROUND((ca.citation_count::NUMERIC / NULLIF(t.total_count, 0)) * 100, 1) AS pct,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('url', uc.original_url, 'citations', uc.url_citation_count))
       FROM url_counts uc
       WHERE uc.content_category = ca.content_category AND uc.rn <= 3),
      '[]'::jsonb
    ) AS top_urls_json
  FROM category_agg ca
  CROSS JOIN total t
  ORDER BY ca.citation_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_content_type_stats IS 'Returns content structure category stats. Uses brand-specific overrides for real_estate_israel brands and global URL classifications for general brands.';
