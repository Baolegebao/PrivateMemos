# Private Memos v0.3.0 Supabase 同步配置

本文档用于配置 Private Memos v0.3.0 的电脑端和手机端自动同步。

当前版本不需要注册软件账号，也不需要在客户端填写 Supabase 登录邮箱或密码。客户端只需要：

- Supabase URL
- Supabase publishable key
- 电脑和手机一致的同步口令

同步口令不会上传到 Supabase。软件会在本地用同步口令派生加密密钥和同步 ID，然后把加密后的逐条记录写入 Supabase。

## 安全声明

请不要把以下内容提交到 GitHub：

- 真实 Supabase URL
- 真实 publishable key
- secret key 或 service_role key
- 同步口令
- 本地数据文件
- 安装包、构建产物、数据库文件
- 私人笔记、记账、任务、日程、剪贴板内容

客户端只能使用 publishable key。不要在客户端、文档或前端代码中使用 secret key 或 service_role key。

## Supabase 后台配置

打开 Supabase Dashboard，进入项目的 SQL Editor，新建 Query，执行下面的 SQL。

```sql
create table if not exists public.private_memos_snapshots (
  sync_id text primary key,
  snapshot_version integer not null default 1,
  encrypted_payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.private_memos_records (
  sync_id text not null,
  entity text not null,
  record_id text not null,
  encrypted_payload jsonb not null,
  record_updated_at timestamptz not null,
  deleted boolean not null default false,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key (sync_id, entity, record_id)
);

create index if not exists private_memos_records_sync_updated_idx
  on public.private_memos_records (sync_id, updated_at desc);

create index if not exists private_memos_records_sync_entity_idx
  on public.private_memos_records (sync_id, entity, record_updated_at desc);

alter table public.private_memos_snapshots enable row level security;
alter table public.private_memos_records enable row level security;

grant select, insert, update, delete on table public.private_memos_snapshots to anon, authenticated;
grant select, insert, update, delete on table public.private_memos_records to anon, authenticated;

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

create or replace function public.set_private_memos_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_private_memos_records_updated_at on public.private_memos_records;
create trigger set_private_memos_records_updated_at
before update on public.private_memos_records
for each row execute function public.set_private_memos_records_updated_at();

drop policy if exists "private memos snapshots select by sync id" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots insert by sync id" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots update by sync id" on public.private_memos_snapshots;
drop policy if exists "private memos snapshots delete by sync id" on public.private_memos_snapshots;

create policy "private memos snapshots select by sync id"
on public.private_memos_snapshots for select
to anon, authenticated
using (sync_id is not null);

create policy "private memos snapshots insert by sync id"
on public.private_memos_snapshots for insert
to anon, authenticated
with check (sync_id is not null);

create policy "private memos snapshots update by sync id"
on public.private_memos_snapshots for update
to anon, authenticated
using (sync_id is not null)
with check (sync_id is not null);

create policy "private memos snapshots delete by sync id"
on public.private_memos_snapshots for delete
to anon, authenticated
using (sync_id is not null);

drop policy if exists "private_memos_records_select_by_sync_id" on public.private_memos_records;
drop policy if exists "private_memos_records_insert_by_sync_id" on public.private_memos_records;
drop policy if exists "private_memos_records_update_by_sync_id" on public.private_memos_records;
drop policy if exists "private_memos_records_delete_by_sync_id" on public.private_memos_records;

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
```

## 获取客户端配置

在 Supabase Dashboard 中打开 Project Settings > API，复制：

- Project URL
- Project API keys 中的 publishable key

不要复制 secret key 或 service_role key。

## 客户端操作

电脑端和手机端都打开 Private Memos，进入设置页的云端同步区域，填写同一组配置：

```txt
Supabase URL: https://your-project-id.supabase.co
Publishable key: paste-your-publishable-key
同步口令: 自己设置一段足够长的口令
```

电脑和手机必须使用同一个 Supabase URL、同一个 publishable key、同一个同步口令，才能解密并同步同一份数据。

## 自动同步规则

- 新增、编辑、删除本地数据后，约 250ms 后自动提交同步。
- 软件活跃时，每 8 秒自动拉取一次云端变更。
- 回到前台或窗口重新聚焦时，会立即同步。
- 如果同步正在进行，新的变更会排队，当前同步结束后自动补跑。
- 删除会生成删除标记，另一端拉取后会删除对应记录。

参与同步的数据包括：

- 记事
- 私人笔记
- 重点
- 提醒
- 任务
- 记账
- 日程
- 倒计时

剪贴板集合只保存在本机，不上传 Supabase。

## 换设备或恢复数据

1. 在新设备安装 Private Memos。
2. 打开设置页，填写相同 Supabase URL 和 publishable key。
3. 输入原来的同步口令。
4. 保持软件活跃，等待自动同步完成。

如果同步口令丢失，云端密文无法解密，只能从本地备份恢复。

## 已有旧表的项目

如果你曾经使用过旧版本账号密码同步，请先备份本地数据，再执行仓库里的迁移 SQL：

```txt
supabase/migrations/0004_private_memos_passphrase_sync.sql
```

新项目建议直接执行本文档中的完整 SQL。
