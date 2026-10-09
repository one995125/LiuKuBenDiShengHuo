# START HERE

> 2026-07-22 当前开发版已切换为“商家黄页 + 合规出租房源投稿”：商家/房源先审后发，招聘入口、公开接口、投稿、后台发布与 Excel 导入全部关闭。部署与真机验收尚需按 `docs/12-wechat-review-materials.md` 执行。

这是“六库生活圈”项目后续开发入口。

## 当前状态

- 当前版本：方案10用户端 + CloudBase 四云函数 + Vue 运营后台，仅运营者发布
- 当前阶段：云函数和运营后台已更新；等待上传新版小程序、更新隐私指引并重新提审
- 已完成：首页、商家、招聘、租房、上门服务、帮助、私密纠错反馈和隐藏运营说明页
- 数据方式：公开信息和私密反馈使用 CloudBase；失败反馈草稿按当前账号保存在本机
- 管理权限：运营后台使用 CloudBase Auth UID 白名单；隐藏小程序页不处理业务数据
- CloudBase 环境：`cloud1-d6glqc7e7244211f2`
- 云端状态：三个 API 云函数已部署为 1.1.0，新版运营后台已发布；历史投稿、评论和资料集合封存
- 微信版本：`1.0.0`，2026-06-15 已通过开发者工具 CLI 上传，包体 232058 Byte

## 继续开发前阅读

1. `PROJECT_CONTEXT.md`
2. `docs/01-prd.md`
3. `docs/02-architecture.md`
4. `docs/04-tasks.md`
5. `docs/07-acceptance-checklist.md`
6. `docs/11-cloudbase-admin-setup.md`

## 检查命令

```bash
npm run check:full
npm --prefix admin-web run test:e2e
npm run generate:cloud-seeds
npm run test:smoke
```

## 开发规则

- 页面通过 `services/public-data.ts` 和 `services/user-data.ts` 访问业务数据，本地服务仅作为回退。
- 用户端主入口使用自定义底栏和 `wx.reLaunch`；首页信息类目、详情与反馈使用 `wx.navigateTo`。
- 不使用 `document`、`window`、`localStorage` 或其他浏览器 API。
- 首版不接用户发布、公开评论、支付、订单、聊天、社区、简历投递和中介撮合。
- 云资源统一使用 `liuku_` 前缀，并校验来源 AppID，避免未来共享环境时越权调用。
- 页面统一通过 `miniprogram/services/public-data.ts` 读取公开信息。
- `features.publicData=true` 用于公开信息，`features.userData=true` 仅用于身份和私密反馈；投稿、评论和资料保存由云函数禁用。
- 后台本地模拟使用 `npm --prefix admin-web run dev:mock`，生产构建必须保持 `VITE_USE_MOCK_API=false`。
