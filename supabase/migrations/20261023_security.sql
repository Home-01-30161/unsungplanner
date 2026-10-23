-- Atomic quota counters + cache table hardening.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- The app calls public.take_slot() from the server with the SERVICE ROLE key.
-- It replaces the old read-then-write quota check, which let parallel requests
-- slip past the limit.

create table if not exists public.api_cache (
    key        text primary key,
    data       jsonb not null,
    expires_at timestamptz not null
);

-- If the table already existed with a `json` column, convert it once:
--   alter table public.api_cache alter column data type jsonb using data::jsonb;

create index if not exists api_cache_expires_at_idx on public.api_cache (expires_at);

-- No policies + RLS enabled = anon/authenticated keys can read nothing.
-- The service role bypasses RLS, which is the only key the server uses.
alter table public.api_cache enable row level security;

-- Atomically increment a counter and report whether it is within the limit.
create or replace function public.take_slot(
    p_key         text,
    p_limit       integer,
    p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    used integer;
begin
    insert into public.api_cache (key, data, expires_at)
    values (p_key, jsonb_build_object('n', 1), now() + make_interval(secs => p_ttl_seconds))
    on conflict (key) do update
        set data       = jsonb_build_object('n', coalesce((public.api_cache.data ->> 'n')::integer, 0) + 1),
            expires_at = excluded.expires_at
    returning coalesce((data ->> 'n')::integer, 1) into used;

    return used <= p_limit;
end;
$$;

revoke all on function public.take_slot(text, integer, integer) from public;
grant execute on function public.take_slot(text, integer, integer) to service_role;

-- Housekeeping: delete expired rows (schedule with pg_cron if available).
create or replace function public.cleanup_expired_cache() returns void
language sql
security definer
set search_path = public
as $$
    delete from public.api_cache where expires_at < now();
$$;

revoke all on function public.cleanup_expired_cache() from public;
grant execute on function public.cleanup_expired_cache() to service_role;
