create table if not exists public.private_memos_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  record_id text not null,
  encrypted_payload jsonb not null,
  record_updated_at timestamptz not null,
  deleted boolean not null default false,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity, record_id)
);

create index if not exists private_memos_records_user_updated_idx
  on public.private_memos_records (user_id, updated_at desc);

create index if not exists private_memos_records_user_entity_idx
  on public.private_memos_records (user_id, entity, record_updated_at desc);

alter table public.private_memos_records enable row level security;

drop policy if exists "private_memos_records_select_own" on public.private_memos_records;
drop policy if exists "private_memos_records_insert_own" on public.private_memos_records;
drop policy if exists "private_memos_records_update_own" on public.private_memos_records;
drop policy if exists "private_memos_records_delete_own" on public.private_memos_records;

create policy "private_memos_records_select_own"
  on public.private_memos_records for select
  using (auth.uid() = user_id);

create policy "private_memos_records_insert_own"
  on public.private_memos_records for insert
  with check (auth.uid() = user_id);

create policy "private_memos_records_update_own"
  on public.private_memos_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "private_memos_records_delete_own"
  on public.private_memos_records for delete
  using (auth.uid() = user_id);

create or replace function public.set_private_memos_records_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_private_memos_records_updated_at on public.private_memos_records;
create trigger set_private_memos_records_updated_at
  before update on public.private_memos_records
  for each row
  execute function public.set_private_memos_records_updated_at();
