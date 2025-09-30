-- Insert subscription plans
INSERT INTO subscription_plans (id, name, price_monthly, max_brands, max_queries_per_day, features, is_active) VALUES
('basic', 'Basic', 30.00, 3, 50, 
 '{"daily_reports": true, "email_alerts": false, "api_access": false, "priority_support": false, "custom_queries": false}', 
 true),
 
('business', 'Business', 200.00, 25, 500, 
 '{"daily_reports": true, "email_alerts": true, "api_access": true, "priority_support": true, "custom_queries": true, "advanced_analytics": true, "white_label": false}', 
 true),
 
('custom', 'Custom', NULL, 999, 9999, 
 '{"daily_reports": true, "email_alerts": true, "api_access": true, "priority_support": true, "custom_queries": true, "advanced_analytics": true, "white_label": true, "dedicated_support": true}', 
 true)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  max_brands = EXCLUDED.max_brands,
  max_queries_per_day = EXCLUDED.max_queries_per_day,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- Create some sample data for development/testing (optional)
-- Uncomment these lines if you want sample data for testing

-- INSERT INTO users (id, email, subscription_plan) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'business')
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO brands (id, user_id, name, domain) VALUES
-- ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Demo Company', 'demo.com'),
-- ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Test Brand', 'testbrand.io')
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO daily_reports (brand_id, report_date, report_score, models_indexed, bot_scans, ai_sessions, pages_indexed, raw_ai_responses) VALUES
-- ('10000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '1 day', 85, 
--  '{"gpt4": true, "claude": true, "perplexity": true}', 
--  12, 45, 8, 
--  '{"gpt4_response": "Sample response", "processing_time": 2.3}'),
-- ('10000000-0000-0000-0000-000000000001', CURRENT_DATE, 88, 
--  '{"gpt4": true, "claude": true, "perplexity": true}', 
--  15, 52, 9, 
--  '{"gpt4_response": "Today sample response", "processing_time": 1.8}')
-- ON CONFLICT (brand_id, report_date) DO NOTHING;
