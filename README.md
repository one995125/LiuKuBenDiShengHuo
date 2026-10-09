# 六库生活圈

六库生活圈是面向六库居民和商家的便民信息黄页小程序，集中展示商家电话、人才招聘、房屋出租、上门服务和优惠活动。公开内容仅由运营者通过独立后台维护，普通用户只浏览信息并可私密提交纠错或投诉。

## 已实现

- 方案10用户端视觉：米白背景、深绿信息层级、橙色强调
- 自定义四项底栏：首页、商家、客服、我的；招聘、租房、上门服务从首页入口进入
- 首页分类入口和“本地精选”混合轮播
- 优惠活动详情、运营后台直接管理和自动过期
- 商家十二分类、维修商家独立筛选、列表与详情
- 招聘和租房搜索、筛选、详情、拨号、复制联系与免责声明
- 私密纠错/投诉提交、弱网反馈草稿和帮助页重试
- 隐藏运营页只展示边界说明，不读取历史UGC
- 本地 mock、`wx storage`、运营者发布、置顶、推荐和收费备注
- CloudBase 环境配置、四个 Nodejs18.15 云函数、默认拒绝数据库规则和索引清单
- 云函数使用 `liuku_` 命名并校验来源 AppID，支持环境未来共享
- 公开信息分页、搜索、详情和首页云函数，以及云端、缓存、本地三级回退
- 商家、招聘、房源种子数据生成和私有字段泄露测试
- 私密反馈和用户主动保存的头像昵称使用 `openid + appid` 隔离；投稿、评论返回稳定禁用码
- 用户资料集合仅允许云函数读写；历史投稿和评论保持客户端不可读写并停止新增
- Vue 3 + TDesign 运营后台：登录、内容直发、推广、纠错、客服、导入和日志
- 商家、招聘、房源 Excel 模板及 ZIP 图片导入
- 定时处理内容、置顶和推荐到期

## 技术栈

- 微信小程序原生框架
- TypeScript、Less、TDesign Miniprogram
- 基础库兼容目标：2.21.0+

## 本地检查

```bash
npm install
npm run check:baseline
npm run check:full
npm run check:cloud
npm run test:public-query
npm run test:user-cloud
npm run check:user-cloud
npm run test:smoke
```

当前开发者工具版本在 Skyline 模式下可能不支持自动截图，`test:smoke` 默认只执行页面和交互检查。确认本机版本支持时，可设置 `WECHAT_CAPTURE_SCREENSHOTS=1` 后运行。

使用微信开发者工具导入：

```text
E:\Loong\projects\LiuKuBenDiShengHuo
```

运行自动化前需在微信开发者工具“设置 -> 安全设置”开启服务端口。如 TDesign 组件缺失，执行“工具 -> 构建 npm”，然后按照 `docs/07-acceptance-checklist.md` 验收。

## 目录

```text
miniprogram/
  components/               自定义顶部、搜索、底栏、悬浮客服/纠错
  constants/local-life.ts   品牌、分类、客服配置、storage key
  services/local-life.ts    旧本地 mock 与归档兼容服务层
  services/public-data.ts   公开数据云端、缓存、本地回退门面
  services/user-data.ts     头像昵称、私密反馈、失败重试与历史数据兼容门面
  pages/                    用户端页面与隐藏管理页
docs/
  01-prd.md                 当前产品需求
  02-architecture.md        本地架构和云开发迁移边界
  04-tasks.md               任务状态
  07-acceptance-checklist.md 微信开发者工具验收清单
  08-pre-cloud-baseline.md   阶段1云迁移前基线
  10-cloudbase-stage4-checklist.md 阶段4启用与验收清单
  11-cloudbase-admin-setup.md 云资源、管理员和后台部署清单
cloudfunctions/
  liuku-public-api/          公开信息云函数入口
  liuku-user-api/            用户身份、私密反馈与历史兼容入口
  liuku-admin-api/           管理权限云函数入口
  liuku-maintenance/         定时到期维护
admin-web/                   Vue 3 运营后台
```

## 当前限制

- `liuku-user-api` 1.2.0 及其余云函数和新版运营后台已部署到开发环境。
- 小程序源码已完成仅运营者发布改造，但仍需上传新的体验版本。
- 微信公众平台隐私保护指引需保留并准确说明用户主动选择头像、填写昵称及云端保存用途，同时删除投稿图片、用户发布内容和公开评论等已停用声明。
- 正式提审前仍需按平台实时提示核对招聘、租房及其他敏感内容的服务类目和资质。
