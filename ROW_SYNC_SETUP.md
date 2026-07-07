# Private Memos 逐条同步版本说明

## 功能声明

Private Memos 的逐条同步版本使用 Supabase 保存加密后的单条记录。

用户需要自行准备：

- Supabase 账号
- Supabase 项目
- Supabase Auth 登录账号
- `private_memos_records` 数据表
- Supabase Project URL
- Supabase Publishable key
- 登录邮箱和密码
- 本地加密口令

本仓库不提供任何 Supabase 密钥、账号密码、加密口令或私人数据。

请不要上传或提交：

- Supabase 登录密码
- 加密口令
- `service_role` key
- Secret key
- `.env` 文件
- 本地数据文件
- 安装包或构建产物

客户端只应使用 Publishable key。不要在桌面端或前端代码中使用 `service_role` key。

## 逐条同步机制

逐条同步会把不同模块的数据拆成独立记录后上传：

- 私人笔记
- 重点内容
- 提醒
- 任务
- 账本
- 日程
- 倒计时

每条记录上传前都会在本地用加密口令加密。Supabase 表中的 `encrypted_payload` 是密文，不能直接阅读。

剪贴板集合只保存在本机，不参与云端同步。

## Supabase 数据表配置

打开 Supabase Dashboard，进入 SQL Editor，新建 Query，执行下面的 SQL。

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

## App 设置

打开 Private Memos 设置页，填写：

```txt
Supabase URL: https://你的项目ID.supabase.co
Publishable key: 你的 Supabase publishable key
邮箱: Supabase Auth 登录邮箱
密码: Supabase Auth 登录密码
加密口令: 自己设置并妥善保存
```

填写完成后，桌面端会自动进行逐条同步。

登录密码和加密口令只保存在当前运行内存中，不写入本地数据文件。重新打开软件后，需要重新输入。

## 删除同步

删除记录时，软件会生成删除标记并同步到 Supabase：

```txt
deleted = true
```

其他设备拉取数据时，会根据删除标记移除对应记录。

## 冲突规则

同一条记录在多端修改时，以 `record_updated_at` 较新的记录为准。

同一条记录由以下字段唯一确定：

```txt
user_id + entity + record_id
```

## 验证同步

在 Supabase SQL Editor 执行：

```sql
select user_id, entity, record_id, deleted, record_updated_at, updated_at
from public.private_memos_records
order by updated_at desc;
```

如果能看到当前用户的数据，说明逐条同步表已经正常写入。

如需按模块查看：

```sql
select entity, count(*) as total
from public.private_memos_records
group by entity
order by entity;
```

## 恢复数据

如果本地数据丢失：

1. 安装并打开 Private Memos。
2. 在设置页填写 Supabase URL、Publishable key、邮箱、密码和原加密口令。
3. 拉取云端逐条记录。
4. 确认数据恢复后再继续使用自动同步。

如果加密口令丢失，云端密文无法解密，只能从本地备份恢复。

## 安全建议

- 必须启用 Row Level Security。
- 客户端只使用 Publishable key。
- 不要使用 `service_role` key。
- 不要把密码、密钥、加密口令写进 GitHub。
- 不要上传本地数据目录。
- 怀疑 key 泄露时，应在 Supabase 后台轮换 key，并在 App 设置页重新填写。
