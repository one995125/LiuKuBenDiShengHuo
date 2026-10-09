# CloudBase 资源说明

开发环境为 `cloud1-d6glqc7e7244211f2`，资源统一使用 `liuku_` 前缀。

当前目录包含：

- `database-collections.json`：8 个集合及用途。
- `database-rules/`：所有集合默认拒绝客户端直接读写。
- `database-indexes.json`：公开查询、投稿、反馈和日志索引。
- `functions-manifest.json`：4 个 Nodejs18.15 云函数和维护定时器。
- `seeds/`：公开精选数据种子。
- `liuku-public-api/`：首页、搜索、列表、详情和客服配置。
- `liuku-user-api/`：投稿、我的发布、图片归属和纠错投诉。
- `liuku-admin-api/`：Auth UID 白名单、审核、内容、推广、配置、导入和日志。
- `liuku-maintenance/`：内容、置顶和推荐到期处理。

完整创建、管理员初始化、后台部署和生产迁移步骤见：

```text
docs/11-cloudbase-admin-setup.md
```
