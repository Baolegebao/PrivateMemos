alter table public.private_memos_snapshots add column if not exists sync_id text;
alter table public.private_memos_records add column if not exists sync_id text;

update public.private_memos_snapshots
set sync_id = user_id::text
where sync_id is null and user_id is not null;

update public.private_memos_records
set sync_id = user_id::text
where sync_id is null and user_id is not null;

alter table public.private_memos_snapshots drop constraint if exists private_memos_snapshots_pkey;
alter table public.private_memos_records drop constraint if exists private_memos_records_pkey;

alter table public.private_memos_snapshots alter column user_id drop not null;
alter table public.private_memos_records alter column user_id drop not null;
alter table public.private_memos_snapshots alter column sync_id set not null;
alter table public.private_memos_records alter column sync_id set not null;

alter table public.private_memos_snapshots add primary key (sync_id);
alter table public.private_memos_records add primary key (sync_id, entity, record_id);

create index if not exists private_memos_records_sync_updated_idx
  on public.private_memos_records (sync_id, updated_at desc);

create index if not exists private_memos_records_sync_entity_idx
  on public.private_memos_records (sync_id, entity, record_updated_at desc);

grant select, insert, update, delete on table public.private_memos_snapshots to anon, authenticated;
grant select, insert, update, delete on table public.private_memos_records to anon, authenticated;

drop policy if exists "private memos snapshots select own" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots insert own" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots update own" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots delete own" on public.private_memos_snapshots;

create policy "private memos snapshots select by sync id"
on public.private_memos_snapshots
for select
to anon, authenticated
using (sync_id is not null);

create policy "private memos snapshots insert by sync id"
on public.private_memos_snapshots
for insert
to anon, authenticated
with check (sync_id is not null);

create policy "private memos snapshots update by sync id"
on public.private_memos_snapshots
for update
to anon, authenticated
using (sync_id is not null)
with check (sync_id is not null);

create policy "private memos snapshots delete by sync id"
on public.private_memos_snapshots
for delete
to anon, authenticated
using (sync_id is not null);

drop policy if exists "private_memos_records_select_own" on public.private_memos_records;
drop policy if exists "private_memos_records_insert_own" on public.private_memos_records;
drop policy if exists "private_memos_records_update_own" on public.private_memos_records;
drop policy if exists "private_memos_records_delete_own" on public.private_memos_records;

create policy "private_memos_records_select_by_sync_id"
  on public.private_memos_records for select
  to anon, authenticated
  using (sync_id is not null);

create policy "private_memos_records_insert_by_sync_id"
  on public.private_memos_records for insert
  to anon, authenticated
  with check (sync_id is not null);

create policy "private_memos_records_update_by_sync_id"
  on public.private_memos_records for update
  to anon, authenticated
  using (sync_id is not null)
  with check (sync_id is not null);

create policy "private_memos_records_delete_by_sync_id"
  on public.private_memos_records for delete
  to anon, authenticated
  using (sync_id is not null);
