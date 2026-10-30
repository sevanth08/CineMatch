-- CineMatch watchlist. FOR YOUR REVIEW. Safe to re-run (policies are dropped and recreated; table data is never touched).
create table if not exists public.watchlist (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id    integer not null check (tmdb_id > 0),
  title      text not null check (char_length(title) <= 300),
  poster_path text,
  year       smallint,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);
create index if not exists watchlist_user_idx on public.watchlist (user_id, created_at desc);
alter table public.watchlist enable row level security;
-- Least privilege: signed-out visitors (anon) get no access at all; signed-in users get only what the app needs.
revoke all on public.watchlist from anon;
grant select, insert, delete on public.watchlist to authenticated;
-- Users can only see, add and remove their own rows. Anonymous visitors get nothing.
drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own" on public.watchlist for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own" on public.watchlist for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own" on public.watchlist for delete to authenticated using ((select auth.uid()) = user_id);
-- Rollback: drop table if exists public.watchlist;
