const crypto = require('crypto')
const { isValidMerchantCategory } = require('./merchant-taxonomy')

const ALLOWED_SUBMISSION_TYPES = ['merchant', 'rental']
const ALLOWED_SUBMITTER_ROLES = ['merchant_owner', 'property_owner', 'registered_agent']
const ALLOWED_EVIDENCE_TYPES = [
  'business_license',
  'storefront',
  'ownership_proof',
  'brokerage_filing',
  'owner_authorization',
]
const ALLOWED_FEEDBACK_TYPES = ['correction', 'complaint']
const ALLOWED_ENTRY_TYPES = ['merchant', 'job', 'rental', 'offer']
const MAX_IMAGES = 3
const MAX_EVIDENCE_FILES = 6

function sanitizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function sanitizeClientRequestId(value) {
  const requestId = sanitizeText(value, 80)
  return /^[A-Za-z0-9_-]{8,80}$/.test(requestId) ? requestId : ''
}

function makeDocumentId(prefix, openid, requestId) {
  const hash = crypto
    .createHash('sha256')
    .update(`${openid}:${requestId}`)
    .digest('hex')
    .slice(0, 32)
  return `${prefix}_${hash}`
}

function makeUserDocumentId(openid, appid) {
  const hash = crypto
    .createHash('sha256')
    .update(`${appid}:${openid}`)
    .digest('hex')
    .slice(0, 32)
  return `user_${hash}`
}

function makeUserPublicId(openid, appid) {
  const hash = crypto
    .createHash('sha256')
    .update(`public:${appid}:${openid}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase()
  return `LK${hash}`
}

function sanitizeProfile(rawInput, openid) {
  if (!isPlainObject(rawInput)) {
    return invalid('用户资料格式不正确')
  }

  const nickname = sanitizeText(rawInput.nickname, 24)
  const avatarFile = sanitizeProfileAvatarFile(rawInput.avatarFileId, openid)

  if (!nickname) return invalid('昵称不能为空')
  if (!avatarFile.ok) return avatarFile

  const avatarFileId = avatarFile.data
  return {
    ok: true,
    data: {
      nickname,
      avatarFileId,
      avatarUrl: avatarFileId,
      hasProfile: Boolean(nickname && avatarFileId),
    },
  }
}

function sanitizeSubmission(rawInput, openid, requestId) {
  if (!isPlainObject(rawInput)) {
    return invalid('投稿内容格式不正确')
  }

  const type = ALLOWED_SUBMISSION_TYPES.includes(rawInput.type) ? rawInput.type : ''
  const title = sanitizeText(rawInput.title, 80)
  const content = sanitizeText(rawInput.content, 1000)
  const contactName = sanitizeText(rawInput.contactName, 40)
  const phone = sanitizeText(rawInput.phone, 30)
  const category = sanitizeText(rawInput.category, 40)
  const subCategory = sanitizeText(rawInput.subCategory, 40)
  const area = sanitizeText(rawInput.area, 80)
  const location = sanitizeText(rawInput.location, 120)
  const businessHours = sanitizeText(rawInput.businessHours, 80)
  const rent = sanitizeText(rawInput.rent, 80)
  const layout = sanitizeText(rawInput.layout, 80)
  const publicImages = sanitizeSubmissionFiles(rawInput.publicImages || rawInput.images, openid, requestId, 'public', MAX_IMAGES)
  const evidenceFiles = sanitizeEvidenceFiles(rawInput.evidenceFiles, openid, requestId)
  const submitterRole = ALLOWED_SUBMITTER_ROLES.includes(rawInput.submitterRole)
    ? rawInput.submitterRole
    : ''
  const declarations = sanitizeDeclarations(rawInput.declarations)
  const merchantName = sanitizeText(rawInput.merchantName, 100)
  const validFrom = sanitizeDate(rawInput.validFrom)
  const validUntil = sanitizeDate(rawInput.validUntil)

  if (!type) return invalid('投稿类型未开放')
  if (!title) return invalid('投稿标题不能为空')
  if (!content) return invalid('投稿内容不能为空')
  if (!contactName) return invalid('联系人不能为空')
  if (!phone) return invalid('联系电话不能为空')
  if (!publicImages.ok) return publicImages
  if (!evidenceFiles.ok) return evidenceFiles
  if (!submitterRole) return invalid('提交主体类型不合法')
  if (!declarations.ok) return declarations
  if (type === 'merchant' && submitterRole !== 'merchant_owner') {
    return invalid('商家资料只能由持照商家主体提交')
  }
  if (type === 'merchant' && (!category || !area || !location || !businessHours)) {
    return invalid('商家分类、区域、地址和营业时间均为必填项')
  }
  if (type === 'merchant' && !isValidMerchantCategory(category, subCategory)) {
    return invalid('商家一级分类和二级分类不匹配')
  }
  if (type === 'rental' && (!rent || !location || !layout || !area || !validUntil)) {
    return invalid('房源租金、位置、户型、面积和有效期均为必填项')
  }
  if (type === 'rental' && !['property_owner', 'registered_agent'].includes(submitterRole)) {
    return invalid('房源仅支持业主本人或备案中介提交')
  }
  const evidenceTypes = new Set(evidenceFiles.data.map((item) => item.type))
  const requiredEvidence = type === 'merchant'
    ? ['business_license', 'storefront']
    : submitterRole === 'property_owner'
      ? ['ownership_proof']
      : ['business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof']
  const missingEvidence = requiredEvidence.find((item) => !evidenceTypes.has(item))
  if (missingEvidence) return invalid('核验材料不完整，请按页面提示补齐')
  if (type === 'rental' && publicImages.data.length === 0) {
    return invalid('房源至少需要一张公开展示图片')
  }

  return {
    ok: true,
    data: {
      type,
      title,
      category,
      contactName,
      phone,
      wechat: sanitizeText(rawInput.wechat, 60),
      location,
      content,
      images: publicImages.data,
      publicImages: publicImages.data,
      evidenceFiles: evidenceFiles.data,
      submitterRole,
      declarations: declarations.data,
      businessHours,
      subCategory,
      area,
      rent: type === 'rental' ? rent : '',
      layout: type === 'rental' ? layout : '',
      merchantName: '',
      merchantId: '',
      validFrom: '',
      validUntil: type === 'rental' ? validUntil : '',
    },
  }
}

function sanitizeDeclarations(rawValue) {
  const value = isPlainObject(rawValue) ? rawValue : {}
  const data = {
    truthConfirmed: value.truthConfirmed === true,
    displayConsentConfirmed: value.displayConsentConfirmed === true,
    materialUseConsentConfirmed: value.materialUseConsentConfirmed === true,
  }
  if (!Object.values(data).every(Boolean)) {
    return invalid('请确认资料真实性、公开展示授权和核验材料处理说明')
  }
  return { ok: true, data }
}

function sanitizeEvidenceFiles(rawFiles, openid, requestId) {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return invalid('请上传核验材料')
  }
  if (rawFiles.length > MAX_EVIDENCE_FILES) {
    return invalid(`核验材料不能超过 ${MAX_EVIDENCE_FILES} 张`)
  }
  const files = []
  for (const item of rawFiles) {
    if (!isPlainObject(item) || !ALLOWED_EVIDENCE_TYPES.includes(item.type)) {
      return invalid('核验材料类型不合法')
    }
    const file = sanitizeSubmissionFiles([item.fileId], openid, requestId, 'evidence', 1)
    if (!file.ok) return file
    files.push({ type: item.type, fileId: file.data[0] })
  }
  return { ok: true, data: files }
}

function sanitizeSubmissionFiles(rawFiles, openid, requestId, folder, maxFiles) {
  if (!Array.isArray(rawFiles)) return invalid('图片格式不正确')
  if (rawFiles.length > maxFiles) return invalid(`图片不能超过 ${maxFiles} 张`)
  const expectedPath = `/liuku/submissions/${openid}/${requestId}/`
  const expectedFolder = `/${folder}/`
  const files = rawFiles.map((item) => sanitizeText(item, 500)).filter(Boolean)
  if (files.some((fileId) => {
    const lower = fileId.toLowerCase().split('?')[0]
    return !fileId.startsWith('cloud://') ||
      !fileId.includes(expectedPath) ||
      !fileId.includes(expectedFolder) ||
      !/\.(jpg|jpeg|png)$/.test(lower)
  })) {
    return invalid('图片不属于当前投稿目录或格式不支持')
  }
  return { ok: true, data: files }
}

function sanitizeFeedback(rawInput) {
  if (!isPlainObject(rawInput)) {
    return invalid('反馈内容格式不正确')
  }

  const type = ALLOWED_FEEDBACK_TYPES.includes(rawInput.type) ? rawInput.type : ''
  const entryType = ALLOWED_ENTRY_TYPES.includes(rawInput.entryType) ? rawInput.entryType : ''
  const content = sanitizeText(rawInput.content, 1000)

  if (!type) return invalid('反馈类型不合法')
  if (!content) return invalid('反馈说明不能为空')

  return {
    ok: true,
    data: {
      type,
      entryType,
      entryId: sanitizeText(rawInput.entryId, 100),
      entryTitle: sanitizeText(rawInput.entryTitle, 100),
      content,
      contact: sanitizeText(rawInput.contact, 80),
    },
  }
}

function sanitizeComment(rawInput) {
  if (!isPlainObject(rawInput)) {
    return invalid('评论内容格式不正确')
  }

  const entryId = sanitizeText(rawInput.entryId, 120)
  const rating = Number(rawInput.rating)
  const content = sanitizeText(rawInput.content, 500)

  if (!entryId) return invalid('商家 ID 不能为空')
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return invalid('评分必须是 1-5 星')
  }
  if (content.length < 2) return invalid('评论内容至少 2 个字')
  if (content.length > 500) return invalid('评论内容不能超过 500 字')

  return {
    ok: true,
    data: {
      entryType: 'merchant',
      entryId,
      rating: Math.round(rating),
      content,
    },
  }
}

function sanitizeCloudFiles(rawImages, openid, folder) {
  if (!Array.isArray(rawImages)) {
    return {
      ok: true,
      data: [],
    }
  }
  if (rawImages.length > MAX_IMAGES) {
    return invalid(`图片不能超过 ${MAX_IMAGES} 张`)
  }

  const expectedPath = `/liuku/${folder}/${openid}/`
  const images = rawImages
    .map((item) => sanitizeText(item, 500))
    .filter(Boolean)

  if (images.some((fileId) => !fileId.startsWith('cloud://') || !fileId.includes(expectedPath))) {
    return invalid('图片不属于当前用户的云存储目录')
  }

  return {
    ok: true,
    data: images,
  }
}

function sanitizeProfileAvatarFile(value, openid) {
  const fileId = sanitizeText(value, 500)
  if (!fileId) {
    return {
      ok: true,
      data: '',
    }
  }

  const expectedPath = `/liuku/users/${openid}/avatar/`
  if (!fileId.startsWith('cloud://') || !fileId.includes(expectedPath)) {
    return invalid('头像不属于当前用户的云存储目录')
  }

  return {
    ok: true,
    data: fileId,
  }
}

function stripSubmissionPrivateFields(document) {
  if (!document || typeof document !== 'object') {
    return null
  }
  return {
    id: String(document.id || document._id || ''),
    type: document.type,
    title: document.title || '',
    category: document.category || '',
    contactName: document.contactName || '',
    phone: document.phone || '',
    wechat: document.wechat || '',
    location: document.location || '',
    content: document.content || '',
    images: Array.isArray(document.publicImages) ? document.publicImages : (Array.isArray(document.images) ? document.images : []),
    publicImages: Array.isArray(document.publicImages) ? document.publicImages : (Array.isArray(document.images) ? document.images : []),
    // 核验材料上传完成后仅管理员可访问；用户端列表也不回传原始 fileID。
    evidenceFiles: [],
    submitterRole: document.submitterRole || '',
    declarations: isPlainObject(document.declarations) ? document.declarations : {},
    businessHours: document.businessHours || '',
    subCategory: document.subCategory || '',
    area: document.area || '',
    rent: document.rent || '',
    layout: document.layout || '',
    merchantName: document.merchantName || '',
    merchantId: document.merchantId || '',
    validFrom: document.validFrom || '',
    validUntil: document.validUntil || '',
    status: document.status || 'pending',
    rejectReason: document.rejectReason || '',
    hasContacted: Boolean(document.hasContacted),
    isTop: Boolean(document.isTop),
    topUntil: document.topUntil || '',
    isFeatured: Boolean(document.isFeatured),
    featuredUntil: document.featuredUntil || '',
    isPaid: Boolean(document.isPaid),
    paidType: document.paidType || '',
    chargeUntil: document.chargeUntil || '',
    adminNote: '',
    version: Number.isInteger(document.version) ? document.version : 0,
    publishedEntryType: document.publishedEntryType || '',
    publishedEntryId: document.publishedEntryId || '',
    createdAt: serializeDate(document.createdAt),
    updatedAt: serializeDate(document.updatedAt),
    evidenceRetainUntil: serializeDate(document.evidenceRetainUntil),
    evidencePurgedAt: serializeDate(document.evidencePurgedAt),
  }
}

function stripUserProfilePublic(document) {
  if (!document || typeof document !== 'object') {
    return {
      publicId: '',
      nickname: '',
      avatarFileId: '',
      avatarUrl: '',
      hasProfile: false,
      updatedAt: '',
    }
  }
  const nickname = document.nickname || ''
  const avatarFileId = document.avatarFileId || ''
  return {
    publicId: document.publicId || '',
    nickname,
    avatarFileId,
    avatarUrl: document.avatarUrl || avatarFileId,
    hasProfile: Boolean(document.hasProfile) && Boolean(nickname && avatarFileId),
    updatedAt: serializeDate(document.updatedAt),
  }
}

function stripUserProfileSnapshot(document) {
  const profile = stripUserProfilePublic(document)
  return {
    publicId: profile.publicId,
    nickname: profile.nickname,
    avatarFileId: profile.avatarFileId,
    avatarUrl: profile.avatarUrl,
    hasProfile: profile.hasProfile,
  }
}

function serializeDate(value) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : ''
}

function sanitizeDate(value) {
  const date = sanitizeText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function invalid(message) {
  return {
    ok: false,
    message,
  }
}

module.exports = {
  ALLOWED_SUBMISSION_TYPES,
  makeDocumentId,
  makeUserDocumentId,
  makeUserPublicId,
  sanitizeClientRequestId,
  sanitizeComment,
  sanitizeFeedback,
  sanitizeProfile,
  sanitizeProfileAvatarFile,
  sanitizeSubmission,
  stripSubmissionPrivateFields,
  stripUserProfilePublic,
  stripUserProfileSnapshot,
}
