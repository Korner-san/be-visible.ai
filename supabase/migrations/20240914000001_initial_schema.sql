-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  subscription_plan text DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'business', 'custom')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create brands table (aligned with current Brand interface)
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  domain text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Constraints
  CONSTRAINT brands_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT brands_domain_format CHECK (domain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$')
);

-- Create daily_reports table (time-series data for AI processing)
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  report_date date NOT NULL,
  report_score integer CHECK (report_score >= 0 AND report_score <= 100),
  models_indexed jsonb DEFAULT '{}' NOT NULL,
  bot_scans integer DEFAULT 0 CHECK (bot_scans >= 0),
  ai_sessions integer DEFAULT 0 CHECK (ai_sessions >= 0),
  pages_indexed integer DEFAULT 0 CHECK (pages_indexed >= 0),
  raw_ai_responses jsonb DEFAULT '{}' NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Unique constraint to prevent duplicate reports for same brand/date
  UNIQUE(brand_id, report_date)
);

-- Create subscription_plans table (for plan enforcement)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_monthly numeric(10,2) CHECK (price_monthly >= 0),
  max_brands integer CHECK (max_brands > 0),
  max_queries_per_day integer CHECK (max_queries_per_day > 0),
  features jsonb DEFAULT '{}' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);
CREATE INDEX IF NOT EXISTS idx_daily_reports_brand_id ON daily_reports(brand_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_brand_date ON daily_reports(brand_id, report_date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan ON users(subscription_plan);

-- Add comments for documentation
COMMENT ON TABLE users IS 'Extended user profile data linked to Supabase auth.users';
COMMENT ON TABLE brands IS 'User-owned brands/domains for AI visibility tracking';
COMMENT ON TABLE daily_reports IS 'Time-series data of daily AI processing results per brand';
COMMENT ON TABLE subscription_plans IS 'Available subscription plans with limits and features';

COMMENT ON COLUMN users.subscription_plan IS 'Current subscription plan: basic, business, or custom';
COMMENT ON COLUMN brands.domain IS 'Primary domain for the brand (must be unique across all users)';
COMMENT ON COLUMN daily_reports.report_score IS 'Overall visibility score (0-100) for the day';
COMMENT ON COLUMN daily_reports.models_indexed IS 'JSON data about which AI models indexed the brand';
COMMENT ON COLUMN daily_reports.raw_ai_responses IS 'Raw API responses from AI services for analysis';
