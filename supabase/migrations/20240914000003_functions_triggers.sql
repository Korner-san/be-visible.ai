-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brands_updated_at 
  BEFORE UPDATE ON brands 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user profile when auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, subscription_plan)
  VALUES (NEW.id, NEW.email, 'basic')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to validate domain format
CREATE OR REPLACE FUNCTION validate_domain_format(domain_input text)
RETURNS boolean AS $$
BEGIN
  -- Remove protocol if present
  domain_input := regexp_replace(domain_input, '^https?://', '', 'i');
  -- Remove www if present
  domain_input := regexp_replace(domain_input, '^www\.', '', 'i');
  -- Remove trailing slash
  domain_input := regexp_replace(domain_input, '/$', '');
  
  -- Check if domain matches basic format
  RETURN domain_input ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$';
END;
$$ LANGUAGE plpgsql;

-- Function to normalize domain (remove protocol, www, trailing slash)
CREATE OR REPLACE FUNCTION normalize_domain(domain_input text)
RETURNS text AS $$
BEGIN
  -- Remove protocol if present
  domain_input := regexp_replace(domain_input, '^https?://', '', 'i');
  -- Remove www if present  
  domain_input := regexp_replace(domain_input, '^www\.', '', 'i');
  -- Remove trailing slash
  domain_input := regexp_replace(domain_input, '/$', '');
  -- Convert to lowercase
  domain_input := lower(domain_input);
  
  RETURN domain_input;
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize domain before insert/update
CREATE OR REPLACE FUNCTION normalize_brand_domain()
RETURNS TRIGGER AS $$
BEGIN
  NEW.domain := normalize_domain(NEW.domain);
  
  -- Validate the normalized domain
  IF NOT validate_domain_format(NEW.domain) THEN
    RAISE EXCEPTION 'Invalid domain format: %', NEW.domain;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_brands_domain
  BEFORE INSERT OR UPDATE OF domain ON brands
  FOR EACH ROW
  EXECUTE FUNCTION normalize_brand_domain();

-- Function to check brand creation limits based on subscription
CREATE OR REPLACE FUNCTION check_brand_creation_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan text;
  max_brands_allowed integer;
  current_brand_count integer;
BEGIN
  -- Get user's subscription plan
  SELECT subscription_plan INTO user_plan 
  FROM users 
  WHERE id = NEW.user_id;
  
  -- Get max brands for the plan
  SELECT max_brands INTO max_brands_allowed 
  FROM subscription_plans 
  WHERE id = user_plan AND is_active = true;
  
  -- Count current brands for this user
  SELECT COUNT(*) INTO current_brand_count 
  FROM brands 
  WHERE user_id = NEW.user_id;
  
  -- Check if user has reached their limit
  IF current_brand_count >= max_brands_allowed THEN
    RAISE EXCEPTION 'Brand limit reached. Your % plan allows maximum % brands. Upgrade your subscription to add more brands.', 
      user_plan, max_brands_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to enforce brand limits on creation
CREATE TRIGGER enforce_brand_limit
  BEFORE INSERT ON brands
  FOR EACH ROW
  EXECUTE FUNCTION check_brand_creation_limit();

-- Function to get user's active brand count
CREATE OR REPLACE FUNCTION get_user_brand_count(user_uuid uuid)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer 
    FROM brands 
    WHERE user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's latest report data for a brand
CREATE OR REPLACE FUNCTION get_latest_brand_report(brand_uuid uuid)
RETURNS daily_reports AS $$
BEGIN
  RETURN (
    SELECT * 
    FROM daily_reports 
    WHERE brand_id = brand_uuid 
    ORDER BY report_date DESC 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get aggregated report data for date range
CREATE OR REPLACE FUNCTION get_brand_reports_summary(
  brand_uuid uuid, 
  start_date date, 
  end_date date
)
RETURNS TABLE(
  total_reports integer,
  avg_score numeric,
  total_bot_scans bigint,
  total_ai_sessions bigint,
  total_pages_indexed bigint,
  date_range_days integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::integer as total_reports,
    ROUND(AVG(report_score), 2) as avg_score,
    SUM(bot_scans) as total_bot_scans,
    SUM(ai_sessions) as total_ai_sessions,
    SUM(pages_indexed) as total_pages_indexed,
    (end_date - start_date + 1)::integer as date_range_days
  FROM daily_reports
  WHERE brand_id = brand_uuid
    AND report_date BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
