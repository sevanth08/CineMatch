-- CineMatch user preferences (theme + last mood). FOR YOUR REVIEW - NOT APPLIED. Creates one table; drops nothing.
create table if not exists public.user_preferences (
  user_id   uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme     text check (theme in ('technicolor','noir')),
  last_mood text check (char_length(last_mood) <= 40),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;
drop policy if exists "prefs_select_own" on public.user_preferences;
create policy "prefs_select_own" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "prefs_insert_own" on public.user_preferences;
create policy "prefs_insert_own" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "prefs_update_own" on public.user_preferences;
create policy "prefs_update_own" on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Rollback: drop table if exists public.user_preferences;
