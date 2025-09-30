-- Seed the global demo brand
-- This will create a demo brand owned by the first admin user found

DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Find the first user in auth.users (typically the admin/first user)
  -- You can replace this with a specific user ID if needed
  SELECT id INTO admin_user_id 
  FROM auth.users 
  ORDER BY created_at ASC 
  LIMIT 1;

  -- If no users exist yet, create a placeholder system user ID
  IF admin_user_id IS NULL THEN
    admin_user_id := '00000000-0000-0000-0000-000000000000';
    RAISE NOTICE 'No users found, using system user ID for demo brand';
  ELSE
    RAISE NOTICE 'Using admin user ID % for demo brand', admin_user_id;
  END IF;

  -- Insert the global demo brand
  INSERT INTO public.brands (
    id,
    owner_user_id,
    name,
    domain,
    is_demo,
    onboarding_completed,
    first_report_status,
    onboarding_answers
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    admin_user_id,
    'TechFlow Solutions',
    'techflow-demo.ai',
    true,
    true,
    'succeeded',
    '{
      "brandName": "TechFlow Solutions",
      "website": "https://techflow-demo.ai",
      "industry": "Technology",
      "productCategory": "AI-powered workflow automation",
      "problemSolved": "Helps businesses automate repetitive tasks and streamline workflows using AI",
      "tasksHelped": ["Document processing", "Data analysis", "Customer support", "Report generation"],
      "goalFacilitated": "Increase productivity and reduce manual work",
      "keyFeatures": ["AI automation", "Real-time analytics", "API integrations", "Custom workflows"],
      "useCases": ["Enterprise automation", "Small business efficiency", "Developer tools", "Data processing"],
      "competitors": ["Zapier", "Microsoft Power Automate", "UiPath", "Automation Anywhere"],
      "uniqueSellingProps": ["Advanced AI capabilities", "Easy setup", "Affordable pricing", "24/7 support"]
    }'::jsonb
  ) ON CONFLICT (id) DO UPDATE SET
    owner_user_id = EXCLUDED.owner_user_id,
    name = EXCLUDED.name,
    domain = EXCLUDED.domain,
    is_demo = EXCLUDED.is_demo,
    onboarding_completed = EXCLUDED.onboarding_completed,
    first_report_status = EXCLUDED.first_report_status,
    onboarding_answers = EXCLUDED.onboarding_answers,
    updated_at = now();

  -- Create some sample daily reports for the demo brand
  INSERT INTO public.daily_reports (
    brand_id,
    report_date,
    score,
    models_indexed,
    bot_scans,
    ai_sessions,
    pages_indexed,
    raw_ai_responses
  ) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    CURRENT_DATE - INTERVAL '0 days',
    85,
    '{"gpt-4": 12, "claude": 8, "gemini": 15}'::jsonb,
    1250,
    890,
    45,
    '{"total_responses": 35, "positive_sentiment": 28, "neutral_sentiment": 5, "negative_sentiment": 2}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    CURRENT_DATE - INTERVAL '1 days',
    82,
    '{"gpt-4": 10, "claude": 9, "gemini": 13}'::jsonb,
    1180,
    820,
    42,
    '{"total_responses": 32, "positive_sentiment": 25, "neutral_sentiment": 4, "negative_sentiment": 3}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    CURRENT_DATE - INTERVAL '2 days',
    78,
    '{"gpt-4": 8, "claude": 11, "gemini": 12}'::jsonb,
    1095,
    765,
    38,
    '{"total_responses": 31, "positive_sentiment": 22, "neutral_sentiment": 6, "negative_sentiment": 3}'::jsonb
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Demo brand and sample reports created successfully';
END $$;
