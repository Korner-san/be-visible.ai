-- Returns all URLs for a specific domain in citation sources
-- Includes citation count, brand mention status (checked against raw_content),
-- and page title from url_content_facts.
-- Used by CitationSourcesTable when expanding a domain row.

CREATE OR REPLACE FUNCTION public.get_citation_source_urls(
  p_brand_id UUID,
  p_domain TEXT,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
  url TEXT,
  mentions BIGINT,
  brand_mentioned BOOLEAN,
  page_title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_name TEXT;
BEGIN
  -- Verify the caller owns this brand (or it's a demo brand)
  IF NOT EXISTS (
    SELECT 1 FROM brands
    WHERE id = p_brand_id
      AND (owner_user_id = auth.uid() OR is_demo = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not own this brand';
  END IF;

  -- Get brand name for content matching
  SELECT b.name INTO v_brand_name
  FROM brands b
  WHERE b.id = p_brand_id;

  RETURN QUERY
  WITH brand_reports AS (
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
  domain_citations AS (
    SELECT
      ui.id AS url_id,
      ui.url AS full_url,
      COUNT(*) AS citation_count
    FROM url_citations uc
    JOIN url_inventory ui ON ui.id = uc.url_id
    WHERE uc.prompt_result_id IN (SELECT id FROM brand_prompt_results)
      AND ui.domain = p_domain
    GROUP BY ui.id, ui.url
  )
  SELECT
    dc.full_url,
    dc.citation_count,
    CASE
      WHEN v_brand_name IS NOT NULL
        AND ucf.raw_content IS NOT NULL
        AND ucf.raw_content ILIKE '%' || v_brand_name || '%'
      THEN TRUE
      ELSE FALSE
    END AS is_brand_mentioned,
    COALESCE(ucf.title, '') AS url_title
  FROM domain_citations dc
  LEFT JOIN url_content_facts ucf ON ucf.url_id = dc.url_id
  ORDER BY dc.citation_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_citation_source_urls IS 'Returns all URLs for a domain with mention counts and brand mention detection. SECURITY DEFINER to bypass RLS.';
