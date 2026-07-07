create table if not exists public.private_memos_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot_version integer not null default 1,
  encrypted_payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.private_memos_snapshots enable row level security;

revoke all on table public.private_memos_snapshots from anon;
grant select, insert, update, delete on table public.private_memos_snapshots to authenticated;

create or replace function public.set_private_memos_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_private_memos_snapshot_updated_at on public.private_memos_snapshots;
create trigger set_private_memos_snapshot_updated_at
before update on public.private_memos_snapshots
for each row execute function public.set_private_memos_snapshot_updated_at();

drop policy if exists "private memos snapshots select own" on public.private_memos_snapshots;
create policy "private memos snapshots select own"
on public.private_memos_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "private memos snapshots insert own" on public.private_memos_snapshots;
create policy "private memos snapshots insert own"
on public.private_memos_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "private memos snapshots update own" on public.private_memos_snapshots;
create policy "private memos snapshots update own"
on public.private_memos_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "private memos snapshots delete own" on public.private_memos_snapshots;
create policy "private memos snapshots delete own"
on public.private_memos_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);
