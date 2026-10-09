# 11 CloudBase 与运营后台部署清单

> 2026-07-22 当前口径：商家和出租房源开放先审后发投稿；招聘频道关闭。`liuku_configs` 必须存在 `_id=channel_policy`，其 `channels.merchant`、`channels.rental` 三项为 `true`，`channels.job` 三项为 `false`。`liuku_submissions` 继续保持客户端不可读写，核验材料仅通过管理员后台临时地址访问。

上线前先导出 `liuku_jobs` 与历史招聘投稿，再把已公开招聘改为 `offline`，待审招聘投稿改为 `rejected` 且拒绝原因为“招聘频道暂未开放”。不要删除历史数据。为 `liuku-maintenance` 配置每日触发器，以清理 `evidenceRetainUntil` 到期的私密材料。

备份完成后，可由管理员直接调用 `liuku-admin-api` 的受控动作 `closeJobChannel`，传入 `{ "backupConfirmed": true, "confirm": "CLOSE_JOB_CHANNEL_AFTER_BACKUP" }`。若返回 `hasMore=true`，重复调用直到为 `false`。该动作未在常规后台提供按钮，也不得在备份前执行。

## 当前边界

- 开发环境：`cloud1-d6glqc7e7244211f2`
- 小程序 AppID：以 `config/liuku-app-config.json` 的 `appId` 为准，`project.config.json` 仅保留微信开发者工具所需镜像值。
- 云函数来源校验：`liuku-public-api`、`liuku-user-api`、`liuku-admin-api` 必须在云函数环境变量 `LIUKU_ALLOWED_APP_ID` 中配置同一个正式 AppID。
- 云函数运行时：`Nodejs18.15`
- 小程序公开数据和私密反馈云端能力已开启；用户投稿、评论和资料保存由云函数明确禁用。
- 小程序与运营后台均只调用云函数，不直接读写数据库。
- CloudBase CLI 已完成授权，9 个集合、4 个云函数、管理员白名单和运营后台均已创建并部署。
- 运营后台开发地址：`https://cloud1-d6glqc7e7244211f2-1441695282.tcloudbaseapp.com/liuku-admin/`
- 免费开发环境测试域名首次访问会显示 CloudBase 风险提醒，等待倒计时后点击“确定访问”即可。

## 1. 本地完整检查

```powershell
npm run check:full
```

后台浏览器验收使用本地模拟数据，不会写入 CloudBase：

```powershell
npm --prefix admin-web run test:e2e
```

## 2. 登录 CloudBase CLI

不要向项目或 Codex 提供腾讯云 SecretId、SecretKey、后台密码。

```powershell
npx.cmd --yes --package @cloudbase/cli tcb login
npx.cmd --yes --package @cloudbase/cli tcb env:list
```

确认列表中存在 `cloud1-d6glqc7e7244211f2` 后再继续。

## 3. 创建集合、权限和索引

在 CloudBase 控制台创建以下集合：

- `liuku_merchants`
- `liuku_jobs`
- `liuku_rentals`
- `liuku_offers`
- `liuku_submissions`
- `liuku_feedbacks`
- `liuku_comments`
- `liuku_users`
- `liuku_admins`
- `liuku_admin_logs`
- `liuku_configs`

事实源文件：

- 集合说明：`cloudfunctions/database-collections.json`
- 权限规则：`cloudfunctions/database-rules/*.json`
- 索引清单：`cloudfunctions/database-indexes.json`

所有集合的客户端权限必须配置为不可读、不可写。公开查询、投稿、审核和配置均由云函数执行。创建完后，在小程序 Console 直接写 `liuku_configs`，预期必须返回权限拒绝。

## 4. 部署云函数

`cloudbaserc.json` 固定了四个函数目录、Node.js 运行时和超时时间：

- `liuku-public-api`
- `liuku-user-api`
- `liuku-admin-api`
- `liuku-maintenance`

执行。脚本会从 `config/liuku-app-config.json` 读取正式 AppID，生成一次性部署配置，并把 `LIUKU_ALLOWED_APP_ID` 自动写入三个 API 云函数；不再依赖部署人员在控制台手工补变量：

```powershell
.\tools\deploy-cloudbase.ps1 -Functions
```

仅修改单个云函数时，可在仍然自动注入来源 AppID 的前提下定向部署，避免重发其他函数：

```powershell
.\tools\deploy-cloudbase.ps1 -Functions -OnlyFunction liuku-user-api
```

部署后检查：

1. 四个函数运行时均为 `Nodejs18.15`。
2. `liuku-maintenance` 存在每天 02:10 的定时触发器。
3. 小程序调用公开、用户健康检查成功。
4. 未加入管理员白名单的身份调用管理 API 返回 `ADMIN_FORBIDDEN`。

如果小程序出现“云函数未配置来源 AppID”，说明线上函数仍是旧配置或部署时未携带环境变量。重新登录 CloudBase CLI 后执行上述脚本，并重新上传小程序体验版；仅重新上传小程序代码不能修复该错误。

2026-06-11 开发环境部署记录：

- 四个云函数均已部署为 `Nodejs18.15`。
- `liuku-maintenance` 已绑定 `liuku-daily-maintenance`，Cron 为 `0 10 2 * * * *`。
- CLI 无微信或网页登录上下文时，三个 API 均正确返回 `UNAUTHENTICATED`。
- 维护函数已线上执行成功，返回 `checked=0 / updated=0 / failed=0`。
- 商家多电话号码版本已重新部署 `liuku-public-api` 和 `liuku-admin-api`；运营后台及新版资料采集模板已同步发布。
- 已导入并验证 6 条商家、2 条招聘和 2 条房源公开种子数据；临时导入函数执行后已从云端删除。
- 用户数据已验证可信微信身份、`openid + appid` 查询、账号绑定缓存、投稿/反馈集合禁止客户端直写，以及当前用户云存储上传和清理。

优惠活动版本部署顺序：

1. 创建 `liuku_offers`，客户端权限设为不可读、不可写。
2. 按 `cloudfunctions/database-indexes.json` 创建活动状态、日期、排序索引。
3. 重新部署 `liuku-public-api`、`liuku-user-api`、`liuku-admin-api` 和 `liuku-maintenance`。
4. 重新构建并部署 `admin-web/dist`。
5. 后台创建一条草稿活动，发布后验证首页轮播和详情；再将其下架确认前台不可见。

2026-06-12 部署记录：

- `liuku_offers` 已创建，基础权限为 `ADMINONLY`。
- 已创建 `status_validFrom_validUntil_displayOrder_updatedAt` 和 `status_validUntil` 两个业务索引。
- 四个云函数已重新部署，`liuku-maintenance` 线上执行返回 `checked=10 / updated=0 / failed=0`。
- 运营后台已重新构建并发布至 `/liuku-admin/`。
- 部署后小程序 13 页 smoke 通过，首页公开数据来源保持为 `cloud`。

## 5. 创建首个后台管理员

1. 在 CloudBase 控制台开启用户名密码登录。
2. 在用户管理中创建账号，不开放公开注册。
3. 复制该账号的 Auth UID。
4. 在 `liuku_admins` 新建文档，文档 `_id` 必须等于 Auth UID：

```json
{
  "_id": "替换为 CloudBase Auth UID",
  "uid": "替换为 CloudBase Auth UID",
  "displayName": "六库生活圈管理员",
  "role": "super_admin",
  "enabled": true,
  "createdAt": "使用控制台当前时间",
  "updatedAt": "使用控制台当前时间"
}
```

账号密码只在 CloudBase 控制台创建和保管，项目只需要 UID。

## 6. 配置和部署运营后台

复制 `admin-web/.env.example` 为生产构建使用的环境文件，确认：

```text
VITE_CLOUDBASE_ENV_ID=cloud1-d6glqc7e7244211f2
VITE_USE_MOCK_API=false
```

如控制台要求 Web SDK Client ID，再填写 `VITE_CLOUDBASE_CLIENT_ID`。不得把服务端密钥写入前端环境变量。

先构建：

```powershell
npm --prefix admin-web run build
```

CLI 登录后部署：

```powershell
.\tools\deploy-cloudbase.ps1 -Hosting
```

后台使用 Hash 路由和相对静态资源路径，`admin-web/dist` 固定上传至 `/liuku-admin`。

当前线上入口：

```text
https://cloud1-d6glqc7e7244211f2-1441695282.tcloudbaseapp.com/liuku-admin/
```

线上已验证登录页标题、表单渲染和用户名输入。真实密码登录、后台会话和管理操作由管理员本人完成验收，密码不得写入项目或聊天记录。

## 7. Excel 导入

模板：

```text
admin-web/public/六库生活圈资料采集模板.xlsx
```

约束：

- 商家、招聘、房源编号分别使用 `M0001`、`J0001`、`R0001` 格式。
- 商家联系电话保持文本格式；多个号码用英文竖线 `|` 分隔，最多 3 个，第一个号码为主号码。
- 日期使用 `YYYY-MM-DD`。
- 标签使用 `|` 分隔。
- ZIP 图片命名为 `M0001_1.jpg`，每条最多 3 张，每张不超过 2MB。
- 重复编号会更新原记录，不创建重复内容。
- 浏览器先校验，云函数再次校验；有校验错误时不允许确认导入。

## 8. 开启小程序云数据

公开数据已于 2026-06-11 完成导入和自动化验收，当前配置为：

```ts
CLOUD_BASE_CONFIG.features.publicData = true
```

首页、商家搜索、列表和详情通过 `liuku-public-api` 读取；云端失败时继续使用最近缓存和本地 mock。重新初始化开发环境时可执行：

```powershell
.\tools\seed-public-cloud.ps1
```

该脚本只按固定种子 ID 新增或更新公开精选数据，不删除其他业务数据；执行完成后会删除临时云函数和本地临时依赖。

用户数据已完成开发环境自动化和当前账号远程检查，当前设置为：

```ts
CLOUD_BASE_CONFIG.features.userData = true
```

正式上线前仍需使用两个真实微信账号完成交叉查看、断网草稿和恢复重试。生产环境两个开关仍必须分开验证和回滚。

## 9. 生产环境

小程序审核通过前创建独立生产环境。生产环境只迁移：

- 已审核且状态为 `published` 的商家、招聘、房源和有效期内优惠活动。
- `liuku_configs` 中的正式客服配置。
- 正式管理员白名单。

不要迁移开发环境测试投稿、测试反馈和测试日志。部署前替换小程序、后台和 `cloudbaserc.json` 的环境 ID，再执行完整验收。

## 官方依据

- [CloudBase CLI 云函数部署](https://docs.cloudbase.net/en/cli-v1/functions/deploy)
- [CloudBase CLI 静态托管](https://docs.cloudbase.net/en/cli-v1/hosting)
- [用户名密码登录](https://docs.cloudbase.net/en/api-reference/webv2/authentication)
- [数据库安全规则](https://docs.cloudbase.net/en/rule/introduce)
