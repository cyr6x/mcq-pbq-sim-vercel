-- SY0-701 Simulator — optional cloud sync schema (Supabase / Postgres)
--
-- Run once in the Supabase SQL editor.
-- Before connecting from the app, enable anonymous sign-in:
--   Authentication → Providers → Anonymous sign-ins → Enable
--
-- Security model:
--   * The browser uses only the public anon key.
--   * Every row is owned by auth.uid() (anonymous users still get a stable uid).
--   * RLS policies below restrict select/insert/update/delete to the owner.
--   * client_key makes uploads idempotent across retries and devices.

create table if not exists public.attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_key  text not null,
  mode        text not null check (mode in ('exam', 'study')),
  variant     int,
  label       text,
  score       int  not null check (score between 0 and 100),
  correct     int  not null check (correct >= 0),
  total       int  not null check (total > 0),
  duration    int  not null default 0 check (duration >= 0),
  items       jsonb not null default '[]'::jsonb,
  at          timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint attempts_user_client_key_key unique (user_id, client_key),
  constraint attempts_correct_lte_total check (correct <= total)
);

create index if not exists attempts_user_at_idx
  on public.attempts (user_id, at desc);

alter table public.attempts enable row level security;

drop policy if exists "attempts_select_own" on public.attempts;
drop policy if exists "attempts_insert_own" on public.attempts;
drop policy if exists "attempts_update_own" on public.attempts;
drop policy if exists "attempts_delete_own" on public.attempts;

create policy "attempts_select_own"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "attempts_insert_own"
  on public.attempts for insert
  with check (auth.uid() = user_id);

create policy "attempts_update_own"
  on public.attempts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "attempts_delete_own"
  on public.attempts for delete
  using (auth.uid() = user_id);
