-- CineMatch: OPTIONAL profiles table. FOR YOUR REVIEW - NOT APPLIED AUTOMATICALLY.
-- Sign-in/sign-up works without this file (Supabase Auth keeps users in auth.users).
-- Apply only if you want a per-user row for future features (e.g. saved films).
-- Non-destructive: creates one new table, one function, one trigger. Drops nothing.
-- Try it on a throwaway/branch project first: a failing signup trigger blocks new sign-ups.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- Each signed-in user can see and edit only their own row. Anonymous visitors get nothing.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- No delete policy: the row is removed automatically if the auth user is deleted (cascade).

-- Create the profile row automatically at sign-up (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rollback (run manually if you want to undo this migration):
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
--   drop table if exists public.profiles;
