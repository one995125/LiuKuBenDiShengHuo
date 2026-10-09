# 02 技术架构

> 2026-07-22 更新：`liuku-user-api` 已恢复仅 `merchant | rental` 的受控投稿；`liuku-public-api`、`liuku-user-api`、`liuku-admin-api` 对招聘执行服务端硬关闭。店、修、购由统一商家分类表推导板块并复用列表组件，房源保持独立；投稿文件按 `liuku/submissions/{openid}/{requestId}/public|evidence` 分目录，`liuku-maintenance` 每日清理到期核验材料。

## 当前架构

项目基于微信小程序原生框架，目录根为 `miniprogram/`，使用 TypeScript、Less 和 TDesign Miniprogram。四个 CloudBase 云函数、9 个集合的基础设施声明、公开数据和运营后台已完成；普通用户仅可提交持照商家和合规出租房源，全部经后台人工审核后公开。

## 分层设计

- `pages/`：页面生命周期、页面级状态和用户操作。
- `services/`：业务数据读取、搜索、提交、管理更新。页面不得直接操作 mock 数据。
- `constants/`：分类、状态文案、存储 key、路由等稳定配置。
- `types/`：商家、招聘、租房、优惠活动、投稿、审核状态等类型。
- `utils/`：纯工具函数。

## 本地数据流

1. 首页、列表和详情页调用 `services/public-data.ts`。
2. 公开数据门面在功能开关关闭时回退到 `services/local-life.ts`。
3. 功能开关开启后按“云函数 -> 最近本地缓存 -> 本地 mock”读取。
4. 私密纠错投诉调用 `services/user-data.ts`；失败反馈草稿绑定 `openid + appid`。
5. 用户云函数只接受 `merchant | rental` 投稿，招聘等类型返回稳定禁用码；头像昵称和私密反馈继续按 `openid + appid` 隔离。
6. 独立运营后台通过管理员云函数直接录入、编辑、发布和下架公开内容；隐藏小程序页不读取业务数据。

## 未来云开发迁移

上线前建议迁移到云开发：

- 集合：统一使用 `liuku_` 前缀，具体清单见 `docs/09-cloudbase-stage2-checklist.md`。
- 云函数：`liuku-public-api`、`liuku-user-api`、`liuku-admin-api`。
- 权限：私密反馈关联 openid + appid；管理员操作走 CloudBase Auth 与管理员白名单；敏感更新仅允许云函数执行。
- 分页：列表默认按 `isTop desc, updatedAt desc` 分页。
- 索引：`type/status/category/isTop/isFeatured/updatedAt/expireAt`。

## 阶段 3 已完成准备

- `liuku-public-api` 支持首页、分页列表、搜索和详情；首页同时返回 `carouselItems` 和兼容旧缓存的 `recommendations`。
- 云函数只查询 `published`，并按字段白名单返回，避免泄露 openid、收费和管理备注。
- 页面具备加载、空、错误提示，并统一使用异步公开数据门面。
- 最近一次云端成功结果保存到本地缓存；云端失败时自动回退。
- 种子数据由 `npm run generate:cloud-seeds` 生成。
- `CLOUD_BASE_CONFIG.features.publicData` 当前为 `true`，云端失败时回退公开缓存和本地 mock。
- 优惠活动使用 `liuku_offers`，公开查询会过滤未开始、已过期、未发布和已下架记录。

## 用户数据收口状态

- `liuku-user-api` 开放身份检查、头像昵称资料、私密反馈、商家/房源投稿和本人投稿查询。
- `submitEntry` 仅接受 `merchant | rental`，招聘投稿返回 `CHANNEL_DISABLED`；`submitComment` 返回 `COMMENT_DISABLED`，`saveMyProfile` 仅保存用户主动选择的头像和填写的昵称。
- 云函数只信任 `cloud.getWXContext()` 的 `OPENID` 与 `APPID`，不接受客户端传入身份。
- 我的页通过 `services/local-collections.ts` 读取当前设备的收藏与最近浏览；两类记录不上传云端、不关联 openid，足迹按内容去重并最多保留 50 条。
- “我的投稿”只读取当前 `openid + appid` 的商家和房源投稿；弱网草稿同样绑定当前身份并使用幂等请求标识重试。
- `liuku_submissions`、`liuku_comments` 保持客户端不可直读写；`liuku_users` 同样禁止客户端直读写，仅由用户云函数按 `openid + appid` 访问。

## 原型限制

本地 storage 数据只存在于当前微信开发者工具或当前设备，不能跨设备、不能多人协作、不能作为正式运营数据。管理页本地权限不是生产安全机制。
