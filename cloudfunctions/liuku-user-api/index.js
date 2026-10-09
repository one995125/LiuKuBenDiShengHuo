const cloud = require('wx-server-sdk')
const {
  makeDocumentId,
  makeUserDocumentId,
  makeUserPublicId,
  sanitizeClientRequestId,
  sanitizeComment,
  sanitizeFeedback,
  sanitizeProfile,
  sanitizeSubmission,
  stripSubmissionPrivateFields,
  stripUserProfilePublic,
  stripUserProfileSnapshot,
} = require('./user-utils')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const SERVICE_NAME = 'liuku-user-api'
const SERVICE_VERSION = '1.3.0'
const APP_ID_ENV_NAME = 'LIUKU_ALLOWED_APP_ID'
const SUBMISSION_COLLECTION = 'liuku_submissions'
const FEEDBACK_COLLECTION = 'liuku_feedbacks'
const USER_COLLECTION = 'liuku_users'
const COMMENT_COLLECTION = 'liuku_comments'
const MERCHANT_COLLECTION = 'liuku_merchants'
const CONFIG_COLLECTION = 'liuku_configs'
const COMMENT_POLICY_CONFIG_ID = 'comment_policy'
const CHANNEL_POLICY_CONFIG_ID = 'channel_policy'
const DEFAULT_CHANNEL_POLICY = {
  merchant: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
  rental: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
  job: { publicVisible: false, submissionEnabled: false, adminPublishingEnabled: false },
}
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * 用户数据云函数入口。
 *
 * 私密反馈、头像昵称资料与历史用户数据兼容入口。
 * 普通用户发布和公开评论继续停用；所有用户数据仍使用
 * 当前调用上下文的 OPENID + APPID 隔离，禁止客户端伪造身份。
 */
exports.main = async (event = {}) => {
  const action = typeof event.action === 'string' ? event.action : 'health'
  const payload = isPlainObject(event.payload) ? event.payload : {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const appid = wxContext.APPID || ''
  const allowedAppId = getAllowedAppId()

  if (!openid) {
    return failure('UNAUTHENTICATED', '未识别到微信用户身份', '请从当前小程序调用云函数')
  }

  if (!allowedAppId) {
    return failure('APP_ID_NOT_CONFIGURED', '云函数未配置来源 AppID', `请在云函数环境变量 ${APP_ID_ENV_NAME} 中配置正式 AppID`)
  }

  if (appid !== allowedAppId) {
    return failure('APP_NOT_ALLOWED', '当前小程序无权调用该云函数')
  }

  try {
    if (action === 'health' || action === 'identity') {
      return success(createIdentityData(action, openid, appid))
    }
    if (action === 'getMyProfile') {
      return await getMyProfile(openid, appid)
    }
    if (action === 'saveMyProfile') {
      return await saveMyProfile(payload, openid, appid)
    }
    if (action === 'submitEntry') {
      return await submitEntry(payload, openid, appid)
    }
    if (action === 'listMySubmissions') {
      return await listMySubmissions(payload, openid, appid)
    }
    if (action === 'submitFeedback') {
      return await submitFeedback(payload, openid, appid)
    }
    if (action === 'submitComment') {
      return failure('COMMENT_DISABLED', '公开评论功能已停用')
    }
    return failure('UNSUPPORTED_ACTION', '不支持该用户数据操作')
  } catch (error) {
    console.error('用户数据操作失败', {
      action,
      code: error && (error.errCode || error.code) ? error.errCode || error.code : 'UNKNOWN',
    })
    return failure(
      'USER_OPERATION_FAILED',
      '操作失败，请稍后重试',
      `请在云开发控制台查看 ${SERVICE_NAME} 日志`,
    )
  }
}

function createIdentityData(action, openid, appid) {
  const identityData = {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    authenticated: true,
    identity: maskIdentity(openid),
    serverTime: Date.now(),
  }
  if (action === 'identity') {
    identityData.openid = openid
    identityData.appid = appid
  }
  return identityData
}

async function submitEntry(payload, openid, appid) {
  const requestedType = payload && payload.input && typeof payload.input.type === 'string'
    ? payload.input.type
    : ''
  const channelPolicy = await loadChannelPolicy()
  if (!channelPolicy[requestedType] || channelPolicy[requestedType].submissionEnabled !== true) {
    return failure('CHANNEL_DISABLED', '该频道暂未开放投稿')
  }
  const requestId = sanitizeClientRequestId(payload.clientRequestId)
  const sanitized = sanitizeSubmission(payload.input, openid, requestId)
  if (!requestId) {
    return failure('INVALID_REQUEST_ID', '投稿请求标识不合法')
  }
  if (!sanitized.ok) {
    return failure('INVALID_SUBMISSION', sanitized.message)
  }
  const fileValidation = await validateSubmissionFileContents([
    ...sanitized.data.publicImages,
    ...sanitized.data.evidenceFiles.map((item) => item.fileId),
  ])
  if (!fileValidation.ok) {
    return failure('INVALID_SUBMISSION_FILE', fileValidation.message)
  }

  const documentId = makeDocumentId('submission', openid, requestId)
  const oldDocument = await getDocumentIfExists(SUBMISSION_COLLECTION, documentId)
  if (oldDocument) {
    if (oldDocument.ownerOpenid !== openid || oldDocument.appid !== appid) {
      return failure('REQUEST_ID_CONFLICT', '投稿请求标识已被占用')
    }
    return success({
      item: stripSubmissionPrivateFields(oldDocument),
      serverTime: Date.now(),
    })
  }

  const now = new Date().toISOString()
  // 头像昵称是可选资料，不作为商家或房源资质。可信身份始终来自 OPENID + APPID。
  const userProfileSnapshot = await loadUserProfileSnapshot(openid, appid)
  const document = {
    id: documentId,
    ownerOpenid: openid,
    appid,
    clientRequestId: requestId,
    userProfileSnapshot,
    ...sanitized.data,
    status: 'pending',
    rejectReason: '',
    hasContacted: false,
    isTop: false,
    topUntil: '',
    isFeatured: false,
    featuredUntil: '',
    isPaid: false,
    paidType: '',
    chargeUntil: '',
    adminNote: '',
    publishedEntryType: '',
    publishedEntryId: '',
    reviewedByUid: '',
    reviewedAt: '',
    verification: {
      status: 'pending',
      checks: {},
      verifiedByUid: '',
      verifiedAt: '',
      note: '',
    },
    evidenceRetainUntil: '',
    evidencePurgedAt: '',
    version: 1,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  await createDocument(SUBMISSION_COLLECTION, documentId, document)

  return success({
      item: stripSubmissionPrivateFields({
        ...document,
        createdAt: now,
        updatedAt: now,
      }),
    serverTime: Date.now(),
  })
}

/**
 * 云端重新下载文件并校验真实体积与文件头，避免客户端篡改扩展名或绕过 5MB 限制。
 * 单次最多 9 张，顺序校验以控制云函数瞬时内存占用。
 */
async function validateSubmissionFileContents(fileIds) {
  if (typeof cloud.downloadFile !== 'function') return { ok: true }
  for (const fileID of fileIds) {
    try {
      const result = await cloud.downloadFile({ fileID })
      const content = result && result.fileContent
      if (!content || content.length === 0 || content.length > 5 * 1024 * 1024) {
        return { ok: false, message: '单张图片必须小于等于5MB' }
      }
      const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
      const isPng = content.length >= 8 && content[0] === 0x89 && content[1] === 0x50 &&
        content[2] === 0x4e && content[3] === 0x47 && content[4] === 0x0d &&
        content[5] === 0x0a && content[6] === 0x1a && content[7] === 0x0a
      if (!isJpeg && !isPng) return { ok: false, message: '核验材料仅支持 JPG/PNG 图片' }
    } catch (error) {
      return { ok: false, message: '投稿图片读取失败，请重新选择后提交' }
    }
  }
  return { ok: true }
}

async function getMyProfile(openid, appid) {
  const profile = await ensureUserProfile(openid, appid)
  return success({
    profile,
    serverTime: Date.now(),
  })
}

async function saveMyProfile(payload, openid, appid) {
  const sanitized = sanitizeProfile(payload.input, openid)
  if (!sanitized.ok) {
    return failure('INVALID_PROFILE', sanitized.message)
  }

  const documentId = makeUserDocumentId(openid, appid)
  const oldDocument = await getDocumentIfExists(USER_COLLECTION, documentId)
  if (oldDocument && (oldDocument.ownerOpenid !== openid || oldDocument.appid !== appid)) {
    return failure('PROFILE_ID_CONFLICT', '用户资料标识已被占用')
  }

  const now = new Date().toISOString()
  const document = {
    id: documentId,
    ownerOpenid: openid,
    appid,
    publicId: oldDocument?.publicId || makeUserPublicId(openid, appid),
    ...sanitized.data,
    version: Number.isInteger(oldDocument?.version) ? oldDocument.version + 1 : 1,
    createdAt: oldDocument?.createdAt || db.serverDate(),
    updatedAt: db.serverDate(),
    lastSeenAt: db.serverDate(),
  }

  if (oldDocument) {
    await db.collection(USER_COLLECTION).doc(documentId).update({
      data: document,
    })
  } else {
    await createDocument(USER_COLLECTION, documentId, document)
  }

  return success({
    profile: stripUserProfilePublic({
      ...document,
      updatedAt: now,
    }),
    serverTime: Date.now(),
  })
}

async function ensureUserProfile(openid, appid) {
  const documentId = makeUserDocumentId(openid, appid)
  const oldDocument = await getDocumentIfExists(USER_COLLECTION, documentId)
  if (oldDocument) {
    return stripUserProfilePublic(oldDocument)
  }

  // 读取资料不得产生空用户文档。新用户仅返回稳定的脱敏标识和未完善状态，
  // 只有用户主动保存头像昵称时，saveMyProfile 才会创建 liuku_users 记录。
  return stripUserProfilePublic({
    publicId: makeUserPublicId(openid, appid),
    nickname: '',
    avatarFileId: '',
    avatarUrl: '',
    hasProfile: false,
    updatedAt: '',
  })
}

async function loadUserProfileSnapshot(openid, appid) {
  const documentId = makeUserDocumentId(openid, appid)
  const profile = await getDocumentIfExists(USER_COLLECTION, documentId)
  return stripUserProfileSnapshot(profile)
}

async function listMySubmissions(payload, openid, appid) {
  const pageSize = normalizePageSize(payload.pageSize)
  const cursor = normalizeCursor(payload.cursor)
  const result = await db.collection(SUBMISSION_COLLECTION)
    .where({ ownerOpenid: openid, appid })
    .orderBy('updatedAt', 'desc')
    .skip(cursor)
    .limit(pageSize + 1)
    .get()
  const items = Array.isArray(result.data)
    ? result.data
      .filter((item) => item && (item.type === 'merchant' || item.type === 'rental'))
      .map(stripSubmissionPrivateFields)
      .filter(Boolean)
    : []
  const hasMore = items.length > pageSize
  const visibleItems = hasMore ? items.slice(0, pageSize) : items

  return success({
    items: visibleItems,
    nextCursor: hasMore ? String(cursor + visibleItems.length) : '',
    hasMore,
    serverTime: Date.now(),
  })
}

async function loadChannelPolicy() {
  try {
    const result = await db.collection(CONFIG_COLLECTION).doc(CHANNEL_POLICY_CONFIG_ID).get()
    const channels = result && result.data && isPlainObject(result.data.channels)
      ? result.data.channels
      : {}
    return Object.keys(DEFAULT_CHANNEL_POLICY).reduce((policy, type) => {
      policy[type] = {
        ...DEFAULT_CHANNEL_POLICY[type],
        ...(isPlainObject(channels[type]) ? channels[type] : {}),
      }
      // 招聘必须保持关闭；未来取得资质后再通过受控版本移除此硬锁。
      if (type === 'job') {
        policy[type] = { publicVisible: false, submissionEnabled: false, adminPublishingEnabled: false }
      }
      return policy
    }, {})
  } catch (error) {
    return DEFAULT_CHANNEL_POLICY
  }
}

async function submitFeedback(payload, openid, appid) {
  const requestId = sanitizeClientRequestId(payload.clientRequestId)
  const sanitized = sanitizeFeedback(payload.input)
  if (!requestId) {
    return failure('INVALID_REQUEST_ID', '反馈请求标识不合法')
  }
  if (!sanitized.ok) {
    return failure('INVALID_FEEDBACK', sanitized.message)
  }

  const documentId = makeDocumentId('feedback', openid, requestId)
  const oldDocument = await getDocumentIfExists(FEEDBACK_COLLECTION, documentId)
  if (oldDocument) {
    if (oldDocument.ownerOpenid !== openid || oldDocument.appid !== appid) {
      return failure('REQUEST_ID_CONFLICT', '反馈请求标识已被占用')
    }
    return success({
      id: String(oldDocument.id || oldDocument._id || documentId),
      status: oldDocument.status || 'pending',
      createdAt: oldDocument.createdAt || '',
      serverTime: Date.now(),
    })
  }

  const now = new Date().toISOString()
  const document = {
    id: documentId,
    ownerOpenid: openid,
    appid,
    clientRequestId: requestId,
    ...sanitized.data,
    status: 'pending',
    resolution: '',
    handledByUid: '',
    handledAt: '',
    version: 1,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  await createDocument(FEEDBACK_COLLECTION, documentId, document)

  return success({
    id: documentId,
    status: 'pending',
    createdAt: now,
    serverTime: Date.now(),
  })
}

async function submitComment(payload, openid, appid) {
  const requestId = sanitizeClientRequestId(payload.clientRequestId)
  const sanitized = sanitizeComment(payload.input)
  if (!requestId) {
    return failure('INVALID_REQUEST_ID', '评论请求标识不合法')
  }
  if (!sanitized.ok) {
    return failure('INVALID_COMMENT', sanitized.message)
  }

  const merchant = await getDocumentIfExists(MERCHANT_COLLECTION, sanitized.data.entryId)
  if (
    !merchant ||
    merchant.status !== 'published' ||
    merchant.hidden === true ||
    merchant.deleted === true
  ) {
    return failure('MERCHANT_NOT_FOUND', '商家不存在或暂不可评论')
  }

  const policy = await loadCommentPolicy()
  const blockedHit = findMatchedWords(sanitized.data.content, policy.blockedWords)[0]
  if (blockedHit) {
    return failure('COMMENT_BLOCKED', '评论包含不适宜内容，请修改后再提交')
  }

  const documentId = makeDocumentId('comment', openid, requestId)
  const oldDocument = await getDocumentIfExists(COMMENT_COLLECTION, documentId)
  if (oldDocument) {
    if (oldDocument.ownerOpenid !== openid || oldDocument.appid !== appid) {
      return failure('REQUEST_ID_CONFLICT', '评论请求标识已被占用')
    }
    return success({
      item: stripCommentPrivateFields(oldDocument),
      serverTime: Date.now(),
    })
  }

  const now = new Date().toISOString()
  const reviewHits = findMatchedWords(sanitized.data.content, policy.reviewWords)
  const userProfileSnapshot = await loadUserProfileSnapshot(openid, appid)
  const document = {
    id: documentId,
    ownerOpenid: openid,
    appid,
    clientRequestId: requestId,
    entryType: 'merchant',
    entryId: sanitized.data.entryId,
    entryTitle: sanitizeText(merchant.name, 120),
    rating: sanitized.data.rating,
    content: sanitized.data.content,
    status: 'pending',
    moderationReason: reviewHits.length ? `疑似敏感词：${reviewHits.join('、')}` : '',
    userProfileSnapshot,
    hidden: false,
    hiddenAt: '',
    hiddenByUid: '',
    deleted: false,
    deletedAt: '',
    deletedByUid: '',
    version: 1,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  await createDocument(COMMENT_COLLECTION, documentId, document)

  return success({
    item: stripCommentPrivateFields({
      ...document,
      createdAt: now,
      updatedAt: now,
    }),
    serverTime: Date.now(),
  })
}

async function loadCommentPolicy() {
  const document = await getDocumentIfExists(CONFIG_COLLECTION, COMMENT_POLICY_CONFIG_ID)
  return {
    blockedWords: sanitizeWordList(document && document.blockedWords),
    reviewWords: sanitizeWordList(document && document.reviewWords),
  }
}

function sanitizeWordList(value) {
  const source = Array.isArray(value)
    ? value
    : sanitizeText(value, 2000).split(/[\n,，|]/)
  return source
    .map((item) => sanitizeText(item, 40))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 200)
}

function findMatchedWords(content, words) {
  const normalized = sanitizeText(content, 500).toLowerCase()
  if (!normalized) return []
  return words.filter((word) => normalized.includes(word.toLowerCase()))
}

function stripCommentPrivateFields(document) {
  if (!document || typeof document !== 'object') {
    return null
  }
  return {
    id: String(document.id || document._id || ''),
    entryType: 'merchant',
    entryId: document.entryId || '',
    entryTitle: document.entryTitle || '',
    rating: Number(document.rating) || 5,
    content: document.content || '',
    status: document.status || 'pending',
    moderationReason: document.moderationReason || '',
    hidden: Boolean(document.hidden),
    version: Number.isInteger(document.version) ? document.version : 0,
    createdAt: document.createdAt || '',
    updatedAt: document.updatedAt || '',
  }
}

function success(data) {
  return {
    ok: true,
    code: 'OK',
    message: '调用成功',
    data,
    requestId: createRequestId(),
  }
}

function failure(code, message, debug = '') {
  return {
    ok: false,
    code,
    message,
    data: null,
    requestId: createRequestId(),
    debug,
  }
}

function createRequestId() {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getAllowedAppId() {
  return String(process.env[APP_ID_ENV_NAME] || '').trim()
}

function maskIdentity(openid) {
  if (openid.length <= 8) {
    return '***'
  }
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`
}

function normalizePageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)))
}

function normalizeCursor(value) {
  const parsed = Number.parseInt(String(value || '0'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sanitizeText(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isDocumentNotFound(error) {
  const message = error && error.message ? String(error.message) : ''
  return Boolean(error && (error.errCode === -502005 || error.code === 'DATABASE_DOCUMENT_NOT_FOUND')) ||
    /does not exist|not found/i.test(message)
}

async function getDocumentIfExists(collectionName, documentId) {
  try {
    const result = await db.collection(collectionName).doc(documentId).get()
    return result && result.data ? result.data : null
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return null
    }
    throw error
  }
}

/**
 * 创建带稳定 _id 的新文档。
 *
 * 当前 CloudBase Node SDK 在目标文档不存在时调用 doc(id).set() 会返回
 * -502005，因此首次写入必须走 collection.add()；调用方已先按确定性 ID
 * 查询旧记录，重复请求仍由既有幂等分支返回，不会重复创建业务数据。
 */
async function createDocument(collectionName, documentId, document) {
  return db.collection(collectionName).add({
    data: {
      _id: documentId,
      ...document,
    },
  })
}
