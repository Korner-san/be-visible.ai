-- Add competitor_metrics column to daily_reports
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS competitor_metrics jsonb;

-- Set competitor domains for Incredibuild so citation share works
UPDATE brand_competitors SET competitor_domain = 'jenkins.io' WHERE competitor_name = 'Jenkins' AND brand_id = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
UPDATE brand_competitors SET competitor_domain = 'circleci.com' WHERE competitor_name = 'CircleCI' AND brand_id = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
UPDATE brand_competitors SET competitor_domain = 'travis-ci.com' WHERE competitor_name = 'Travis CI' AND brand_id = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
UPDATE brand_competitors SET competitor_domain = 'gitlab.com' WHERE competitor_name = 'GitLab CI' AND brand_id = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
