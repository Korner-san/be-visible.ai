# BeVisible.ai Onboarding System Implementation

## Overview

This implementation provides a comprehensive onboarding system with deterministic user state management, server-first routing, and stable brand management. The system eliminates flicker and properly manages the user journey from authentication through onboarding to dashboard access.

## Architecture

### State Machine

The system implements 5 distinct user states:

1. **NOT_AUTHENTICATED** → Redirect to `/auth/signin`
2. **AUTHENTICATED_NO_BRAND** → Redirect to `/setup/onboarding`
3. **AUTHENTICATED_ONBOARDING_IN_PROGRESS** → Redirect to `/setup/onboarding`
4. **AUTHENTICATED_ONBOARDING_DONE_NO_REPORT** → Redirect to `/reports/overview?demo=true`
5. **AUTHENTICATED_READY** → Redirect to `/reports/overview`

### Key Components

#### Server-Side
- `lib/supabase/user-state.ts` - Single source of truth for user state
- `app/page.tsx` - Server-first routing decision
- `app/setup/onboarding/page.tsx` - Server component with route protection
- Migration: `supabase/migrations/20241215000001_onboarding_system.sql`

#### Client-Side
- `app/setup/onboarding/onboarding-client.tsx` - 10-question onboarding flow
- `store/brands.ts` - Simplified brand management with demo support
- API routes for onboarding operations

### Database Schema Updates

Added to `brands` table:
- `is_demo` (boolean) - Marks demo brands
- `onboarding_completed` (boolean) - Tracks completion status
- `onboarding_answers` (jsonb) - Stores incremental answers
- `first_report_status` (enum) - Tracks report generation
- `owner_user_id` (uuid) - Clearer ownership reference

### Demo Brand System

- Single global demo brand: "TechFlow Solutions"
- Read-only access for all authenticated users
- Automatically shown while real reports are generating
- Sample data provided for immediate value demonstration

## Features

### ✅ Server-First Routing
- No client-side route ping-pong
- Single redirect per page load
- State determined server-side before rendering

### ✅ Incremental Save System
- Answers saved automatically as user progresses
- Resume capability if user refreshes mid-flow
- No data loss during navigation

### ✅ Website Analysis
- Optional website URL analysis for prefilling
- Graceful fallback to manual entry
- Smart brand data extraction

### ✅ Background Report Generation
- Async report creation after onboarding
- Status tracking: idle → queued → running → succeeded/failed
- Demo brand shown during processing

### ✅ Error Handling
- Comprehensive error boundaries
- Graceful degradation
- Development logging with production safety

### ✅ Zero Flicker Navigation
- Server-side state resolution
- No visible route oscillation
- Deterministic user experience

## API Endpoints

- `POST /api/onboarding/init` - Initialize/resume onboarding
- `POST /api/onboarding/save` - Save incremental answers
- `POST /api/onboarding/complete` - Complete onboarding
- `POST /api/onboarding/analyze-website` - Website analysis
- `POST /api/reports/generate` - Background report generation

## Manual QA Testing Script

### 1. New User Flow
```bash
# Test new user signup and onboarding
1. Navigate to `/` (should redirect to auth)
2. Sign up with new email
3. Verify redirect to `/setup/onboarding`
4. Complete 10-question flow
5. Verify redirect to demo dashboard
6. Check that demo brand is selected
```

### 2. Onboarding Progress Persistence
```bash
# Test incremental save functionality
1. Start onboarding, answer 5 questions
2. Refresh browser
3. Verify form shows at question 6 with previous answers
4. Complete remaining questions
5. Verify successful completion
```

### 3. Website Analysis
```bash
# Test website prefill functionality
1. Enter website URL in onboarding
2. Verify analysis loading state
3. Check prefilled answers in subsequent questions
4. Modify prefilled data if needed
5. Complete onboarding
```

### 4. Report Generation
```bash
# Test background job system
1. Complete onboarding
2. Verify demo dashboard is shown
3. Wait 5-10 seconds for background job
4. Check brand selector for real brand availability
5. Switch to real brand when ready
```

### 5. State Machine Validation
```bash
# Test all state transitions
1. NOT_AUTHENTICATED: Visit `/` → `/auth/signin`
2. AUTHENTICATED_NO_BRAND: After signin → `/setup/onboarding`
3. ONBOARDING_IN_PROGRESS: Refresh mid-flow → `/setup/onboarding`
4. ONBOARDING_DONE_NO_REPORT: After completion → `/reports/overview?demo=true`
5. AUTHENTICATED_READY: After report ready → `/reports/overview`
```

### 6. Error Scenarios
```bash
# Test error handling
1. Network interruption during onboarding
2. Invalid website URL analysis
3. Database connection issues
4. Background job failures
5. Verify graceful error messages and recovery options
```

### 7. Multi-User Isolation
```bash
# Test RLS and data isolation
1. Create User A with Brand A
2. Create User B with Brand B
3. Verify User A cannot see User B's data
4. Verify both users can see demo brand
5. Check report data isolation
```

## Development Logging

When `NODE_ENV=development`, the system logs:
- User state decisions and transitions
- Onboarding progress and completion
- Report generation status changes
- Brand selection changes
- Error conditions with context

Production logs are minimal and safe.

## Safeguards

- All database operations use RLS policies
- Server-side validation of all inputs
- Graceful error handling with fallbacks
- Demo brand isolation from user data
- Atomic onboarding completion
- Idempotent background jobs

## File Structure

```
app/
├── page.tsx                           # Server-first routing
├── setup/onboarding/
│   ├── page.tsx                      # Server component
│   ├── onboarding-client.tsx         # Client component
│   ├── error.tsx                     # Error boundary
│   └── loading.tsx                   # Loading UI
└── api/onboarding/
    ├── init/route.ts                 # Initialize onboarding
    ├── save/route.ts                 # Save answers
    ├── complete/route.ts             # Complete flow
    └── analyze-website/route.ts      # Website analysis

lib/supabase/
└── user-state.ts                    # State machine logic

store/
└── brands.ts                        # Updated brand management

supabase/migrations/
└── 20241215000001_onboarding_system.sql
```

## Success Criteria

- ✅ Zero visible route flicker
- ✅ Deterministic state machine
- ✅ Incremental answer persistence
- ✅ Demo brand immediate availability
- ✅ Background report generation
- ✅ Comprehensive error handling
- ✅ RLS data isolation
- ✅ Server-first architecture

The implementation successfully addresses all requirements from the original prompt and provides a stable, user-friendly onboarding experience.
