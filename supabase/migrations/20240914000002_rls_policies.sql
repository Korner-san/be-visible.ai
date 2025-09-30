-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can only see and update their own profile
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Brands table policies  
-- Users can only see, create, update, and delete their own brands
CREATE POLICY "Users can view own brands" ON brands
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brands" ON brands
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brands" ON brands
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brands" ON brands
  FOR DELETE USING (auth.uid() = user_id);

-- Daily reports table policies
-- Users can only see reports for their own brands
CREATE POLICY "Users can view reports for own brands" ON daily_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = daily_reports.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create reports for own brands" ON daily_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = daily_reports.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update reports for own brands" ON daily_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = daily_reports.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete reports for own brands" ON daily_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = daily_reports.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

-- Subscription plans table policies
-- All authenticated users can read subscription plans (for plan selection)
CREATE POLICY "Authenticated users can view subscription plans" ON subscription_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify subscription plans
CREATE POLICY "Only service role can modify subscription plans" ON subscription_plans
  FOR ALL USING (auth.role() = 'service_role');

-- Security function to check brand ownership
CREATE OR REPLACE FUNCTION auth.user_owns_brand(brand_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM brands 
    WHERE id = brand_uuid 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security function to get user's subscription plan
CREATE OR REPLACE FUNCTION auth.get_user_subscription_plan()
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT subscription_plan 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security function to check subscription limits
CREATE OR REPLACE FUNCTION auth.check_brand_limit()
RETURNS boolean AS $$
DECLARE
  user_plan text;
  max_brands_allowed integer;
  current_brand_count integer;
BEGIN
  -- Get user's subscription plan
  SELECT subscription_plan INTO user_plan FROM users WHERE id = auth.uid();
  
  -- Get max brands for the plan
  SELECT max_brands INTO max_brands_allowed 
  FROM subscription_plans 
  WHERE id = user_plan AND is_active = true;
  
  -- Count current brands
  SELECT COUNT(*) INTO current_brand_count 
  FROM brands 
  WHERE user_id = auth.uid();
  
  -- Return true if under limit
  RETURN current_brand_count < max_brands_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
