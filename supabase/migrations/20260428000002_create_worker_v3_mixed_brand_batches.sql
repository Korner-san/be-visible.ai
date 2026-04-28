-- Worker V3 mixed-brand batch model.
-- Additive only: these tables are not read by the current production worker.
--
-- Purpose:
--   One browser process can run exactly 5 prompts, even when those prompts belong to
--   different brands. Each prompt keeps its own brand, user, report date, retry state,
--   provider status, and EOD ownership.

create table if not exists public.worker_v3_batches (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('daily', 'onboarding')),
  schedule_date date not null,
  execution_time timestamptz not null,
  chatgpt_account_id uuid references public.chatgpt_accounts(id) on delete set null,
  batch_number integer,
  batch_size integer not null default 5 check (batch_size = 5),
  priority integer not null default 100,
  status text not null default 'pending' check (status in ('pending', 'leased', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  is_retry boolean not null default false,
  retry_of_batch_id uuid references public.worker_v3_batches(id) on delete set null,
  lease_id uuid references public.worker_account_leases(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_v3_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.worker_v3_batches(id) on delete cascade,
  item_index integer not null check (item_index between 1 and 5),
  item_kind text not null check (item_kind in ('daily', 'onboarding')),
  schedule_date date not null,
  user_id uuid not null,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_id uuid not null references public.brand_prompts(id) on delete cascade,
  daily_report_id uuid references public.daily_reports(id) on delete set null,
  onboarding_wave integer check (onboarding_wave in (1, 2)),
  is_retry boolean not null default false,
  retry_of_item_id uuid references public.worker_v3_batch_items(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  chatgpt_status text not null default 'pending',
  google_ai_overview_status text not null default 'pending',
  claude_status text not null default 'pending',
  result_id uuid,
  error_message text,
  error_details jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, item_index)
);

create table if not exists public.worker_v3_model_executions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.worker_v3_batches(id) on delete cascade,
  item_id uuid references public.worker_v3_batch_items(id) on delete cascade,
  provider text not null check (provider in ('chatgpt', 'google_ai_overview', 'claude')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  prompts_attempted integer not null default 0,
  prompts_ok integer not null default 0,
  prompts_failed integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_v3_eod_runs (
  id uuid primary key default gen_random_uuid(),
  eod_kind text not null check (eod_kind in ('daily', 'onboarding_wave1', 'onboarding_wave2')),
  schedule_date date not null,
  brand_id uuid not null references public.brands(id) on delete cascade,
  daily_report_id uuid references public.daily_reports(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  trigger_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate primary daily execution for the same prompt/date.
create unique index if not exists worker_v3_daily_prompt_once_idx
  on public.worker_v3_batch_items(schedule_date, prompt_id)
  where item_kind = 'daily' and is_retry = false;

-- Prevent duplicate primary onboarding execution for the same prompt/wave.
create unique index if not exists worker_v3_onboarding_prompt_once_idx
  on public.worker_v3_batch_items(prompt_id, onboarding_wave)
  where item_kind = 'onboarding' and is_retry = false;

create index if not exists worker_v3_batches_due_idx
  on public.worker_v3_batches(status, execution_time, priority desc);

create index if not exists worker_v3_batch_items_brand_date_idx
  on public.worker_v3_batch_items(brand_id, schedule_date, item_kind, status);

create unique index if not exists worker_v3_model_batch_provider_once_idx
  on public.worker_v3_model_executions(batch_id, provider)
  where item_id is null;

create unique index if not exists worker_v3_model_item_provider_once_idx
  on public.worker_v3_model_executions(item_id, provider)
  where item_id is not null;

create unique index if not exists worker_v3_daily_eod_once_idx
  on public.worker_v3_eod_runs(schedule_date, brand_id, eod_kind)
  where eod_kind = 'daily';

create unique index if not exists worker_v3_onboarding_eod_once_idx
  on public.worker_v3_eod_runs(daily_report_id, brand_id, eod_kind)
  where eod_kind in ('onboarding_wave1', 'onboarding_wave2');
