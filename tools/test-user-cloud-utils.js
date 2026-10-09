const assert = require('assert')
const { getOfficialAppId } = require('./project-config')
const {
  makeDocumentId,
  makeUserDocumentId,
  makeUserPublicId,
  sanitizeClientRequestId,
  sanitizeFeedback,
  sanitizeProfile,
  sanitizeProfileAvatarFile,
  sanitizeSubmission,
  stripSubmissionPrivateFields,
  stripUserProfilePublic,
  stripUserProfileSnapshot,
} = require('../cloudfunctions/liuku-user-api/user-utils')

const openid = 'openid-user-a'
const requestId = 'submission_abc12345'
const officialAppId = getOfficialAppId()
const root = `cloud://env.bucket/liuku/submissions/${openid}/${requestId}`
const declarations = {
  truthConfirmed: true,
  displayConsentConfirmed: true,
  materialUseConsentConfirmed: true,
}

const file = (folder, name) => `${root}/${folder}/${name}.jpg`
const evidence = (...types) => types.map((type, index) => ({
  type,
  fileId: file('evidence', `${index + 1}-${type}`),
}))

assert.strictEqual(sanitizeClientRequestId(requestId), requestId)
assert.strictEqual(sanitizeClientRequestId('bad id'), '')

const stableId = makeDocumentId('submission', openid, requestId)
assert.strictEqual(stableId, makeDocumentId('submission', openid, requestId))
assert.notStrictEqual(stableId, makeDocumentId('submission', 'openid-user-b', requestId))

const stableUserId = makeUserDocumentId(openid, officialAppId)
assert.strictEqual(stableUserId, makeUserDocumentId(openid, officialAppId))
assert.notStrictEqual(stableUserId, makeUserDocumentId('openid-user-b', officialAppId))
assert(makeUserPublicId(openid, officialAppId).startsWith('LK'))

const merchant = sanitizeSubmission({
  type: 'merchant',
  title: '江边家电维修',
  category: '生活服务',
  subCategory: '水电维修',
  area: '江东片区',
  businessHours: '09:00-18:00',
  contactName: '王师傅',
  phone: '13900000000',
  location: '六库城区',
  content: '持照经营并提供家电维修服务。',
  submitterRole: 'merchant_owner',
  publicImages: [file('public', 'store')],
  evidenceFiles: evidence('business_license', 'storefront'),
  declarations,
}, openid, requestId)
assert.strictEqual(merchant.ok, true)
assert.strictEqual(merchant.data.publicImages.length, 1)
assert.strictEqual(merchant.data.evidenceFiles.length, 2)

const ownerRental = sanitizeSubmission({
  type: 'rental',
  title: '两室一厅出租',
  contactName: '张女士',
  phone: '13700000000',
  location: '六库城区',
  content: '房屋出租信息。',
  rent: '1800元/月',
  layout: '两室一厅',
  area: '82㎡',
  validUntil: '2026-12-31',
  submitterRole: 'property_owner',
  publicImages: [file('public', 'room')],
  evidenceFiles: evidence('ownership_proof'),
  declarations,
}, openid, requestId)
assert.strictEqual(ownerRental.ok, true)

const agentRental = sanitizeSubmission({
  type: 'rental',
  title: '备案中介出租房源',
  contactName: '李经理',
  phone: '13800000000',
  location: '六库城区',
  content: '经业主授权发布。',
  rent: '2200元/月',
  layout: '三室一厅',
  area: '100㎡',
  validUntil: '2026-12-31',
  submitterRole: 'registered_agent',
  publicImages: [file('public', 'room')],
  evidenceFiles: evidence('business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof'),
  declarations,
}, openid, requestId)
assert.strictEqual(agentRental.ok, true)

assert.strictEqual(sanitizeSubmission({ ...merchant.data, type: 'job' }, openid, requestId).ok, false)
assert.strictEqual(sanitizeSubmission({
  ...agentRental.data,
  evidenceFiles: evidence('business_license', 'owner_authorization', 'ownership_proof'),
}, openid, requestId).ok, false)
assert.strictEqual(sanitizeSubmission({
  ...ownerRental.data,
  publicImages: ['cloud://env.bucket/liuku/submissions/openid-user-b/x/public/room.jpg'],
}, openid, requestId).ok, false)
assert.strictEqual(sanitizeSubmission({
  ...ownerRental.data,
  evidenceFiles: [...evidence('ownership_proof'), ...evidence('storefront', 'business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof', 'storefront')],
}, openid, requestId).ok, false)
assert.strictEqual(sanitizeSubmission({
  ...ownerRental.data,
  declarations: { ...declarations, materialUseConsentConfirmed: false },
}, openid, requestId).ok, false)

const validFeedback = sanitizeFeedback({
  type: 'correction',
  entryType: 'merchant',
  entryId: 'merchant-001',
  content: '联系电话已经变更。',
})
assert.strictEqual(validFeedback.ok, true)

const validProfile = sanitizeProfile({
  nickname: '六库用户',
  avatarFileId: `cloud://env.bucket/liuku/users/${openid}/avatar/avatar.jpg`,
}, openid)
assert.strictEqual(validProfile.ok, true)
assert.strictEqual(validProfile.data.hasProfile, true)

const nicknameOnlyProfile = sanitizeProfile({ nickname: '六库用户', avatarFileId: '' }, openid)
assert.strictEqual(nicknameOnlyProfile.ok, true)
assert.strictEqual(nicknameOnlyProfile.data.hasProfile, false)

assert.strictEqual(sanitizeProfileAvatarFile(
  'cloud://env.bucket/liuku/users/openid-user-b/avatar/avatar.jpg',
  openid,
).ok, false)

const ownSubmission = stripSubmissionPrivateFields({
  _id: 'submission-001',
  ownerOpenid: openid,
  appid: 'secret-appid',
  adminNote: '内部审核记录',
  ...merchant.data,
  status: 'pending',
})
assert.strictEqual(ownSubmission.id, 'submission-001')
assert.strictEqual(ownSubmission.adminNote, '')
assert.strictEqual(ownSubmission.evidenceFiles.length, 0)
assert.strictEqual(Object.prototype.hasOwnProperty.call(ownSubmission, 'ownerOpenid'), false)
assert.strictEqual(Object.prototype.hasOwnProperty.call(ownSubmission, 'appid'), false)

const publicProfile = stripUserProfilePublic({
  id: stableUserId,
  ownerOpenid: openid,
  appid: officialAppId,
  publicId: 'LKTESTUSER',
  nickname: '六库用户',
  avatarFileId: `cloud://env.bucket/liuku/users/${openid}/avatar/avatar.jpg`,
  hasProfile: true,
})
assert.strictEqual(publicProfile.publicId, 'LKTESTUSER')
assert.strictEqual(Object.prototype.hasOwnProperty.call(publicProfile, 'ownerOpenid'), false)

const profileSnapshot = stripUserProfileSnapshot({
  publicId: 'LKTESTUSER',
  nickname: '六库用户',
  avatarFileId: `cloud://env.bucket/liuku/users/${openid}/avatar/avatar.jpg`,
  hasProfile: true,
})
assert.strictEqual(profileSnapshot.nickname, '六库用户')
assert.strictEqual(Object.prototype.hasOwnProperty.call(profileSnapshot, 'ownerOpenid'), false)

console.log('用户云数据工具测试通过：投稿白名单、角色材料、文件归属、声明及身份隔离。')
