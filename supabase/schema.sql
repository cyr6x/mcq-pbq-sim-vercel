-- 22mcq-pbq — cloud sync for attempt history (Supabase / Postgres 15+)
--
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Then in the app: Settings → Cloud sync → paste the Project URL and the
-- publishable (or legacy anon) key from Project Settings → API.
--
-- Security model ("sync key")
--   * No Supabase Auth is needed, so no dashboard toggles.
--   * The app generates a 256-bit random sync key on first connect. Enter the
--     same key on another device to see the same history.
--   * The database stores only sha256(sync key), never the key itself.
--   * The table is closed to the anon/authenticated roles (RLS on, no
--     policies, privileges revoked). The browser can only call three
--     SECURITY DEFINER functions, each scoped to the caller's key hash.
--   * Anyone who has the sync key can read and add to that history, so treat
--     it like a password. Rotating = generating a new key in the app.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.sim_attempts (
  profile_hash text        not null check (profile_hash ~ '^[0-9a-f]{64}$'),
  client_key   text        not null check (char_length(client_key) between 1 and 80),
  mode         text        not null check (mode in ('exam', 'study')),
  track        text        not null default '701' check (track in ('701', '801')),
  variant      int         check (variant between 0 and 1000),
  label        text        check (char_length(label) <= 120),
  score        int         not null check (score between 0 and 100),
  correct      int         not null check (correct >= 0),
  total        int         not null check (total between 1 and 200),
  duration     int         not null default 0 check (duration between 0 and 86400),
  items        jsonb       not null default '[]'::jsonb
                           check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  at           timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (profile_hash, client_key),
  constraint sim_attempts_correct_lte_total check (correct <= total)
);

create index if not exists sim_attempts_profile_at_idx
  on public.sim_attempts (profile_hash, at desc);

alter table public.sim_attempts enable row level security;
revoke all on table public.sim_attempts from public, anon, authenticated;

-- Internal: validate a sync key and return its hash.
create or replace function public._sim_profile(p_key text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{40,128}$' then
    raise exception 'invalid sync key' using errcode = '22023';
  end if;
  return encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
end;
$$;
revoke all on function public._sim_profile(text) from public, anon, authenticated;

-- Upload attempts. Duplicate client_keys are ignored, so retries are safe.
-- Returns the number of rows actually inserted.
create or replace function public.sim_push(p_key text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := public._sim_profile(p_key);
  v_count int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'at most 200 rows per call' using errcode = '22023';
  end if;
  insert into public.sim_attempts
    (profile_hash, client_key, mode, track, variant, label, score, correct, total, duration, items, at)
  select v_hash, r.client_key, r.mode, coalesce(r.track, '701'), r.variant, r.label,
         r.score, r.correct, r.total, coalesce(r.duration, 0), coalesce(r.items, '[]'::jsonb), r.at
  from jsonb_to_recordset(p_rows) as r(
    client_key text, mode text, track text, variant int, label text,
    score int, correct int, total int, duration int, items jsonb, at timestamptz)
  on conflict (profile_hash, client_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Download this profile's attempts, oldest first (most recent 500).
create or replace function public.sim_pull(p_key text)
returns table (client_key text, mode text, track text, variant int, label text, score int,
               correct int, total int, duration int, items jsonb, at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select * from (
    select a.client_key, a.mode, a.track, a.variant, a.label, a.score,
           a.correct, a.total, a.duration, a.items, a.at
    from public.sim_attempts a
    where a.profile_hash = public._sim_profile(p_key)
    order by a.at desc
    limit 500
  ) recent
  order by recent.at asc;
$$;

-- Delete every attempt for this profile (Settings → "Delete cloud copy").
create or replace function public.sim_forget(p_key text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  delete from public.sim_attempts where profile_hash = public._sim_profile(p_key);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sim_push(text, jsonb) from public;
revoke all on function public.sim_pull(text)        from public;
revoke all on function public.sim_forget(text)      from public;
grant execute on function public.sim_push(text, jsonb) to anon, authenticated;
grant execute on function public.sim_pull(text)        to anon, authenticated;
grant execute on function public.sim_forget(text)      to anon, authenticated;

-- Optional clean-up if you ran the previous (anonymous sign-in) schema:
--   drop table if exists public.attempts;
