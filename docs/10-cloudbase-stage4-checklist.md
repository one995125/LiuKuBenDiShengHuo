# 10 CloudBase 用户数据收口清单

> 2026-07-22 更新：本清单中“投稿禁用”的旧步骤已由受控投稿替代。现在应验证商家/房源投稿成功进入 `pending`，伪造招聘投稿返回 `CHANNEL_DISABLED`，并验证公开图片、核验材料目录归属和到期清理。

## 当前状态

- 环境：`cloud1-d6glqc7e7244211f2`。
- 当前 AppID：以 `config/liuku-app-config.json` 的 `appId` 为准。
- `features.userData=true` 继续用于可信身份和私密反馈，不代表开放用户投稿。
- `liuku_submissions`、`liuku_comments` 保持 ADMINONLY 并封存；`liuku_users` 和 `liuku_feedbacks` 保持 ADMINONLY，由用户云函数按可信身份读写。

## 部署验收

1. 部署新版 `liuku-user-api`、`liuku-public-api`、`liuku-admin-api`。
2. 直接调用 `submitEntry`，确认返回 `USER_PUBLISH_DISABLED` 且投稿集合数量不变。
3. 直接调用 `submitComment`，确认返回 `COMMENT_DISABLED` 且评论集合数量不变。
4. 用无效空资料调用 `saveMyProfile`，确认返回 `INVALID_PROFILE` 且用户集合数量不变；再由真实用户主动选择头像昵称并确认可以保存和再次读取。
5. 调用公开 `listComments`，确认返回 `COMMENTS_DISABLED`，日志中没有评论集合查询。
6. 两个真实微信账号分别提交私密反馈，确认记录按 `openid + appid` 隔离。
7. 断网提交反馈后进入帮助页，确认只有当前账号反馈草稿可见，恢复网络后可重试且只生成一条记录。
8. 记录升级前后历史投稿和评论集合数量，确认部署过程没有删除数据；资料集合只因用户主动保存而新增或更新。

## 本地检查

```powershell
npm run check:baseline
npm run test:user-cloud
npm run test:user-scope
npm run test:user-isolation
npm run check:user-cloud
npm run check:user-cloud-remote
```

远程检查只用于验证已部署环境；本地源码通过不代表云函数已经生效。
