# Supabase Setup

## Important Notice

Private Memos supports Supabase automatic sync, but users must configure their own Supabase account, project, Auth user, tables, and client key.

This repository does not provide, store, or upload any private Supabase secret, password, encryption passphrase, or personal sync data.

Do not commit these files or values to GitHub:

- Supabase password
- Encryption passphrase
- Secret key or `service_role` key
- `.env` files
- Local data files
- Private notes, tasks, ledgers, schedules, or clipboard content

The desktop app should only use:

- Supabase Project URL
- Supabase Publishable key
- Supabase Auth email and password
- Private encryption passphrase

Never use the `service_role` key in this app. The `service_role` key bypasses Row Level Security and must only be used in trusted server-side environments.

## Required Supabase Resources

You need:

- A Supabase account
- A Supabase project
- A Supabase Auth user
- The `private_memos_snapshots` table
- The `private_memos_records` table
- Row Level Security policies for both tables

## 1. Create A Supabase Project

1. Open the Supabase dashboard.
2. Create a new project.
3. Wait for the project to finish provisioning.
4. Open the project settings and copy:
   - Project URL
   - Publishable key

Use the Publishable key for the app. Do not use the Secret key or `service_role` key.

## 2. Create Or Prepare An Auth User

Private Memos sync data is isolated by Supabase Auth user.

You can create a user in either way:

- Create the user manually in Supabase Dashboard > Authentication.
- Register from the app if your Supabase Auth settings allow signups.

Keep this account information private:

- Email
- Password

## 3. Create Database Tables

Open Supabase Dashboard > SQL Editor, create a new query, then run the SQL below.

### Snapshot Table

```sql
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
```

### Row Sync Table

```sql
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
```

## 4. Configure Private Memos

Open Private Memos > Settings > Supabase sync, then fill in:

```txt
Supabase URL: https://your-project-id.supabase.co
Publishable key: your Supabase publishable key
Email: your Supabase Auth email
Password: your Supabase Auth password
Encryption passphrase: your private sync passphrase
```

The encryption passphrase is used locally before uploading data. Supabase stores encrypted payloads only.

Keep the same encryption passphrase when using another computer. If the passphrase is lost, existing cloud data cannot be decrypted.

## 5. Verify Sync

After configuring the app, run one sync, then check Supabase SQL Editor.

Check row sync data:

```sql
select user_id, entity, record_id, deleted, updated_at
from public.private_memos_records
order by updated_at desc;
```

Check snapshot data:

```sql
select user_id, snapshot_version, updated_at
from public.private_memos_snapshots
order by updated_at desc;
```

The `encrypted_payload` column is encrypted data and is not readable directly.

## 6. Security Checklist

- Enable Row Level Security on both tables.
- Use only the Publishable key in the app.
- Never paste the `service_role` key into the app.
- Do not commit passwords, keys, local data, or `.env` files.
- Rotate the Publishable key in Supabase if you suspect it has leaked.
- Keep the encryption passphrase private and backed up.

## Official Supabase References

- API keys: https://supabase.com/docs/guides/getting-started/api-keys
- SQL Editor: https://supabase.com/features/sql-editor
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
