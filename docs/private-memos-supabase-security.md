# Private Memos 云端同步与安全使用文档

## 设计说明

Private Memos 早期云端同步使用“整份数据快照”模式。当前桌面端已改为逐条记录同步，新的 Supabase 操作说明见 `docs/private-memos-row-sync.md`。旧快照表可以继续保留作为历史备份。

## Supabase 初始化

1. 打开 Supabase 项目 SQL Editor。
2. 执行 `supabase/migrations/0001_private_memos_cloud_snapshots.sql`。
3. 在 Authentication 中启用 Email/Password 登录。
4. 不要在前端、文档或聊天中使用 `service_role` key。

## App 设置

在 `设置 -> 云端同步` 填写：

- Supabase URL：`https://your-project-id.supabase.co`
- Publishable key：填入项目的 publishable key
- 云端账号：邮箱
- 登录密码：Supabase Auth 密码
- 加密口令：用于加密快照的独立口令

加密口令不会上传到 Supabase。丢失后，云端密文无法解密，只能使用本地备份恢复。

## 同步流程

- 首次使用：点击 `注册账号`，如开启邮箱确认，先完成邮箱确认。
- 上传本机数据：点击 `上传本机快照`，覆盖云端快照。
- 恢复云端数据：先在 `本地数据` 导出备份，再点击 `拉取云端快照` 覆盖本机。

## 数据恢复

1. 安装或打开 Private Memos。
2. 进入 `设置 -> 云端同步`。
3. 填入 Supabase URL、publishable key、邮箱、密码和原加密口令。
4. 点击 `拉取云端快照`。
5. 确认覆盖本机数据。

如果只需要查看云端是否有数据，可以在 Supabase 表 `private_memos_snapshots` 查看 `updated_at`。表里的 `encrypted_payload` 是密文，不能直接阅读。

## 安全策略

- 数据表启用 RLS，每个用户只能访问自己的 `user_id` 行。
- `anon` 无表权限，登录后的 `authenticated` 用户只能按 RLS 策略访问自己的快照。
- 客户端只使用 publishable key，绝不使用 `service_role` key。
- 私人数据在上传前使用 AES-GCM 加密，密钥由 PBKDF2-SHA256 从加密口令派生。
- Supabase 登录密码和加密口令不写入快照，也不写入云端。
- 修改 Supabase 密码不会改变加密口令；修改加密口令需要重新上传快照。

## 后期维护

- 定期使用 `设置 -> 本地数据 -> 导出备份` 保存离线 JSON。
- 如果怀疑 publishable key 泄露，可在 Supabase 后台轮换 key，并在 App 设置页更新。
- 如果怀疑账号密码泄露，先改 Supabase Auth 密码，再重新上传快照。
- 如果迁移到新 Supabase 项目，先执行同一份 SQL，再在 App 中更新 URL 和 publishable key。
