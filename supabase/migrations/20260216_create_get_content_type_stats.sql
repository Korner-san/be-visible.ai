-- Create get_content_type_stats RPC function
-- Returns content structure category aggregation for the Content page
-- Uses SECURITY DEFINER to bypass RLS (validates brand ownership internally)

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
  WITH all_citations AS (
    -- Perplexity citations
    SELECT
      normalize_url(citation->>'url') as normalized_url,
      citation->>'url' as original_url
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.citations) AS citation
    WHERE pr.provider = 'perplexity'
      AND pr.citations IS NOT NULL
      AND jsonb_array_length(pr.citations) > 0
      AND pr.provider_status = 'ok'
      AND pr.daily_report_id IN (
        SELECT dr.id FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )

    UNION ALL

    -- Google AI Overview citations
    SELECT
      normalize_url(citation->>'link') as normalized_url,
      citation->>'link' as original_url
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.google_ai_overview_citations) AS citation
    WHERE pr.provider = 'google_ai_overview'
      AND pr.google_ai_overview_citations IS NOT NULL
      AND jsonb_array_length(pr.google_ai_overview_citations) > 0
      AND pr.provider_status = 'ok'
      AND pr.daily_report_id IN (
        SELECT dr.id FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )

    UNION ALL

    -- ChatGPT citations
    SELECT
      normalize_url(citation_url) as normalized_url,
      citation_url as original_url
    FROM prompt_results pr
    CROSS JOIN unnest(pr.chatgpt_citations) AS citation_url
    WHERE pr.provider = 'chatgpt'
      AND pr.chatgpt_citations IS NOT NULL
      AND array_length(pr.chatgpt_citations, 1) > 0
      AND pr.provider_status = 'ok'
      AND pr.daily_report_id IN (
        SELECT dr.id FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
  ),
  -- Match citations to URL inventory and content facts
  citation_with_category AS (
    SELECT
      ac.original_url,
      COALESCE(ucf.content_structure_category, 'UNCLASSIFIED') as content_category
    FROM all_citations ac
    LEFT JOIN url_inventory ui ON ui.normalized_url = ac.normalized_url
    LEFT JOIN url_content_facts ucf ON ucf.url_id = ui.id
  ),
  -- Aggregate by category
  category_agg AS (
    SELECT
      cwc.content_category,
      COUNT(DISTINCT cwc.original_url) as unique_url_count,
      COUNT(*) as citation_count
    FROM citation_with_category cwc
    GROUP BY cwc.content_category
  ),
  total AS (
    SELECT SUM(citation_count) as total_count FROM category_agg
  ),
  -- Get top 3 URLs per category by citation count
  url_counts AS (
    SELECT
      cwc.content_category,
      cwc.original_url,
      COUNT(*) as url_citation_count,
      ROW_NUMBER() OVER (PARTITION BY cwc.content_category ORDER BY COUNT(*) DESC) as rn
    FROM citation_with_category cwc
    GROUP BY cwc.content_category, cwc.original_url
  )
  SELECT
    ca.content_category,
    ca.unique_url_count,
    ca.citation_count,
    ROUND((ca.citation_count::NUMERIC / NULLIF(t.total_count, 0)) * 100, 1) as pct,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('url', uc.original_url, 'citations', uc.url_citation_count))
       FROM url_counts uc
       WHERE uc.content_category = ca.content_category AND uc.rn <= 3),
      '[]'::jsonb
    ) as top_urls_json
  FROM category_agg ca
  CROSS JOIN total t
  ORDER BY ca.citation_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_content_type_stats IS 'Returns content structure category stats for the Content page. SECURITY DEFINER to bypass RLS on url_inventory/url_content_facts.';
