-- Create get_brand_domain_citations RPC function
-- Returns citations from the brand's own website domain

CREATE OR REPLACE FUNCTION public.get_brand_domain_citations(
  p_brand_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_providers TEXT[] DEFAULT ARRAY['chatgpt']
)
RETURNS TABLE(
  url TEXT,
  mentions_count BIGINT,
  providers TEXT[],
  last_seen_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_brand_domain TEXT;
BEGIN
  -- Get the brand's website domain
  SELECT
    LOWER(TRIM(BOTH '/' FROM
      REGEXP_REPLACE(
        REGEXP_REPLACE((onboarding_answers->>'website')::text, '^https?://', ''),
        '^www\.', ''
      )
    ))
  INTO v_brand_domain
  FROM brands
  WHERE id = p_brand_id;

  IF v_brand_domain IS NULL THEN
    RAISE EXCEPTION 'Brand not found or website not configured';
  END IF;

  RETURN QUERY
  WITH extracted_citations AS (
    -- Extract citations from Perplexity
    SELECT
      pr.id as result_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation->>'url') as normalized_url,
      citation->>'url' as original_url
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.citations) AS citation
    WHERE pr.provider = 'perplexity'
      AND pr.citations IS NOT NULL
      AND jsonb_array_length(pr.citations) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)

    UNION ALL

    -- Extract citations from Google AI Overview
    SELECT
      pr.id as result_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation->>'link') as normalized_url,
      citation->>'link' as original_url
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.google_ai_overview_citations) AS citation
    WHERE pr.provider = 'google_ai_overview'
      AND pr.google_ai_overview_citations IS NOT NULL
      AND jsonb_array_length(pr.google_ai_overview_citations) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)

    UNION ALL

    -- Extract citations from ChatGPT
    SELECT
      pr.id as result_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation_url) as normalized_url,
      citation_url as original_url
    FROM prompt_results pr
    CROSS JOIN unnest(pr.chatgpt_citations) AS citation_url
    WHERE pr.provider = 'chatgpt'
      AND pr.chatgpt_citations IS NOT NULL
      AND array_length(pr.chatgpt_citations, 1) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)
  ),
  brand_domain_citations AS (
    SELECT
      ec.normalized_url,
      ec.result_id,
      ec.provider,
      ec.created_at
    FROM extracted_citations ec
    WHERE ec.normalized_url IS NOT NULL
      AND extract_domain(ec.normalized_url) = v_brand_domain
  )
  SELECT
    bdc.normalized_url as url,
    COUNT(*) as mentions_count,
    ARRAY_AGG(DISTINCT bdc.provider) as providers,
    MAX(bdc.created_at) as last_seen_at
  FROM brand_domain_citations bdc
  GROUP BY bdc.normalized_url
  ORDER BY mentions_count DESC, last_seen_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_brand_domain_citations IS 'Returns citations from the brand''s own website domain across ChatGPT, Perplexity, and Google AI Overview';
