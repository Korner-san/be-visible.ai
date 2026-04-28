-- Worker V3 support table.
-- This file is not applied automatically. Apply it only when worker-v3 execution is ready.

create table if not exists public.worker_account_leases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.chatgpt_accounts(id) on delete cascade,
  owner_type text not null,
  owner_id text not null,
  pid integer,
  hostname text,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  expected_done_at timestamptz,
  hard_timeout_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists worker_account_leases_one_active_per_account
  on public.worker_account_leases(account_id)
  where released_at is null;

create index if not exists worker_account_leases_active_expiry_idx
  on public.worker_account_leases(expires_at)
  where released_at is null;

create index if not exists worker_account_leases_owner_idx
  on public.worker_account_leases(owner_type, owner_id);
