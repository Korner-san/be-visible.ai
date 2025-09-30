# Be-Visible.ai Database Setup Guide

This guide will help you set up the Supabase database schema for the be-visible.ai application.

## Prerequisites

1. **Supabase Project**: You should have a Supabase project created
2. **Environment Variables**: Your `.env.local` should have:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

## Database Schema Overview

The database consists of 4 main tables:

- **`users`** - Extended user profiles (linked to Supabase auth.users)
- **`brands`** - User-owned brands/domains for tracking
- **`daily_reports`** - Time-series data from AI processing
- **`subscription_plans`** - Plan definitions with limits and features

## Migration Files

The migrations are ordered and should be run in sequence:

1. `20240914000001_initial_schema.sql` - Creates all tables and indexes
2. `20240914000002_rls_policies.sql` - Sets up Row Level Security
3. `20240914000003_functions_triggers.sql` - Database functions and triggers
4. `20240914000004_seed_data.sql` - Initial subscription plans data

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste each migration file content in order
4. Run each migration by clicking "Run"

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
# Initialize Supabase in your project (if not done)
supabase init

# Link to your remote project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push
```

### Option 3: Manual SQL Execution

1. Open each `.sql` file in the `migrations/` folder
2. Copy the content
3. Paste into your Supabase SQL Editor
4. Execute in the correct order

## Verification Steps

After running all migrations, verify the setup:

### 1. Check Tables Created
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'brands', 'daily_reports', 'subscription_plans');
```

### 2. Check RLS Policies
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

### 3. Check Subscription Plans
```sql
SELECT * FROM subscription_plans;
```

### 4. Test User Creation
Create a test user through your auth system and verify a `users` record is automatically created.

## Key Features

### Row Level Security (RLS)
- Users can only access their own data
- Brands are protected by user ownership
- Reports are accessible only through owned brands
- Subscription plans are readable by all authenticated users

### Automatic Triggers
- **User Profile Creation**: Automatically creates user profile when auth user signs up
- **Domain Normalization**: Cleans up domain formats (removes www, protocols, etc.)
- **Brand Limits**: Enforces subscription-based brand creation limits
- **Timestamp Updates**: Auto-updates `updated_at` fields

### Database Functions
- `get_user_brand_count()` - Count user's brands
- `get_latest_brand_report()` - Get most recent report for a brand
- `get_brand_reports_summary()` - Aggregate report data for date ranges
- `validate_domain_format()` - Validate domain format
- `normalize_domain()` - Clean up domain strings

## Usage in Application

### Import Types
```typescript
import { Brand, User, DailyReport } from '@/types/database'
import { db } from '@/lib/supabase/database-types'
```

### Common Operations
```typescript
// Get user's brands
const brands = await db.getUserBrands(userId)

// Create new brand
const newBrand = await db.createBrand({
  user_id: userId,
  name: 'My Company',
  domain: 'mycompany.com'
})

// Get brand reports for date range
const reports = await db.getBrandReports(brandId, '2024-01-01', '2024-01-31')

// Get aggregated summary
const summary = await db.getBrandReportsSummary(brandId, '2024-01-01', '2024-01-31')
```

## Subscription Plan Limits

The system enforces these limits:

- **Basic ($30/month)**: 3 brands, 50 queries/day
- **Business ($200/month)**: 25 brands, 500 queries/day  
- **Custom (Contact)**: 999 brands, 9999 queries/day

Limits are enforced at the database level through triggers and RLS policies.

## Troubleshooting

### Common Issues

1. **Migration fails on RLS policies**
   - Make sure you're running as a superuser or service role
   - Check that all tables exist before applying RLS

2. **User profile not created automatically**
   - Verify the trigger on `auth.users` is created
   - Check if the user exists in `auth.users` table

3. **Brand creation fails with limit error**
   - Check user's subscription plan in `users` table
   - Verify subscription plans are seeded correctly

4. **Domain validation fails**
   - Test domain format with `validate_domain_format()` function
   - Check domain normalization with `normalize_domain()` function

### Debug Queries

```sql
-- Check user's current plan and brand count
SELECT u.email, u.subscription_plan, sp.max_brands, 
       COUNT(b.id) as current_brands
FROM users u
LEFT JOIN brands b ON u.id = b.user_id
LEFT JOIN subscription_plans sp ON u.subscription_plan = sp.id
WHERE u.id = 'user-uuid-here'
GROUP BY u.id, u.email, u.subscription_plan, sp.max_brands;

-- Check recent reports for a brand
SELECT * FROM daily_reports 
WHERE brand_id = 'brand-uuid-here' 
ORDER BY report_date DESC 
LIMIT 5;
```

## Next Steps

After completing the database setup:

1. **Update Brand Store**: Migrate from Zustand to Supabase-backed data (Phase 1.3)
2. **Test Authentication**: Verify user creation and brand management work
3. **Prepare for AI Processing**: Database is ready for daily report generation (Phase 3)

## Support

If you encounter issues:
1. Check Supabase logs in the dashboard
2. Verify environment variables are correct
3. Test database connection with a simple query
4. Review RLS policies if data access fails
