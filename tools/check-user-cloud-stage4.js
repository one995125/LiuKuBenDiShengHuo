const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const failures = []
const readText = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))
const assert = (condition, message) => { if (!condition) failures.push(message) }

const appConfig = readJson('miniprogram/app.json')
const minePage = readText('miniprogram/pages/mine/index.wxml')
const profileEditor = readText('miniprogram/components/user-profile-editor/index.wxml')
const userService = readText('miniprogram/services/user-data.ts')
const userFunction = readText('cloudfunctions/liuku-user-api/index.js')
const userUtils = readText('cloudfunctions/liuku-user-api/user-utils.js')
const publicFunction = readText('cloudfunctions/liuku-public-api/index.js')
const submissionRule = readJson('cloudfunctions/database-rules/liuku_submissions.json')
const feedbackRule = readJson('cloudfunctions/database-rules/liuku_feedbacks.json')
const userRule = readJson('cloudfunctions/database-rules/liuku_users.json')
const commentRule = readJson('cloudfunctions/database-rules/liuku_comments.json')

assert(appConfig.pages.includes('pages/submit-entry/index'), '缺少商家/房源投稿页注册')
assert(appConfig.pages.includes('pages/my-submissions/index'), '缺少我的投稿页注册')
assert(!appConfig.pages.includes('pages/job-list/index'), '招聘列表仍被打包注册')
assert(!appConfig.pages.includes('pages/job-detail/index'), '招聘详情仍被打包注册')
assert(minePage.includes('我的投稿'), '我的页缺少“我的投稿”入口')
assert(profileEditor.includes('open-type="chooseAvatar"'), '资料组件缺少主动选择头像控件')
assert(profileEditor.includes('type="nickname"'), '资料组件缺少昵称输入控件')
assert(userService.includes("folder: 'public' | 'evidence'"), '投稿文件未区分公开图片和核验材料')
assert(userService.includes("response.code === 'CHANNEL_DISABLED'"), '客户端未处理频道关闭错误码')

assert(userFunction.includes("action === 'submitEntry'"), '用户投稿云函数入口缺失')
assert(userFunction.includes("failure('CHANNEL_DISABLED'"), '用户云函数缺少频道关闭防护')
assert(userFunction.includes("action === 'listMySubmissions'"), '我的投稿查询入口缺失')
assert(userFunction.includes("failure('COMMENT_DISABLED'"), '公开评论写入未关闭')
assert(userUtils.includes("const ALLOWED_SUBMISSION_TYPES = ['merchant', 'rental']"), '投稿类型白名单不正确')
assert(userUtils.includes('const expectedFolder = `/${folder}/`'), '云函数未校验投稿文件目录')
assert(publicFunction.includes("type === 'job'"), '公开接口缺少招聘硬关闭判断')
assert(publicFunction.includes("failure('CHANNEL_DISABLED'"), '公开接口未返回稳定频道关闭码')

assert(submissionRule.read === false && submissionRule.write === false, '投稿集合必须禁止客户端直读直写')
assert(feedbackRule.read === false && feedbackRule.write === false, '反馈集合必须禁止客户端直读直写')
assert(userRule.read === false && userRule.write === false, '用户集合必须禁止客户端直读直写')
assert(commentRule.read === false && commentRule.write === false, '评论集合必须禁止客户端直读直写')

if (failures.length > 0) {
  console.error('受控投稿与用户隔离检查失败：')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('受控投稿与用户隔离检查通过：商家/房源先审后发，招聘与评论关闭，集合禁止客户端直读直写。')
