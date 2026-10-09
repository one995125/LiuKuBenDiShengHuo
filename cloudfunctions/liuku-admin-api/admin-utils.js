const crypto = require('crypto')
const { isValidMerchantCategory } = require('./merchant-taxonomy')

const ENTRY_TYPES = ['merchant', 'job', 'rental', 'offer']
const ENTRY_COLLECTIONS = {
  merchant: 'liuku_merchants',
  job: 'liuku_jobs',
  rental: 'liuku_rentals',
  offer: 'liuku_offers',
}
const STATUSES = ['draft', 'pending', 'published', 'rejected', 'expired', 'offline']
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

function sanitizeText(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeCursor(value) {
  const parsed = Number.parseInt(String(value || '0'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function normalizePageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)))
}

function normalizeStatus(value, allowEmpty = false) {
  const status = sanitizeText(value, 20)
  if (allowEmpty && !status) return ''
  return STATUSES.includes(status) ? status : ''
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function omitCloudInternalFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const { _id, ...rest } = value
  return rest
}

function createEntryDocument(type, input, base = {}) {
  if (!ENTRY_TYPES.includes(type)) throw new Error('信息类型不合法')
  const safeBase = omitCloudInternalFields(base)
  const shared = {
    ...safeBase,
    id: safeBase.id,
    type,
    status: normalizeStatus(safeBase.status || input.status) || 'draft',
    isTop: Boolean(input.isTop ?? safeBase.isTop),
    topUntil: sanitizeText(input.topUntil ?? safeBase.topUntil, 30),
    isFeatured: Boolean(input.isFeatured ?? safeBase.isFeatured),
    featuredUntil: sanitizeText(input.featuredUntil ?? safeBase.featuredUntil, 30),
    isPaid: Boolean(input.isPaid ?? safeBase.isPaid),
    paidType: sanitizeText(input.paidType ?? safeBase.paidType, 80),
    chargeUntil: sanitizeText(input.chargeUntil ?? safeBase.chargeUntil, 30),
    adminNote: sanitizeText(input.adminNote ?? safeBase.adminNote, 500),
    reviewDueAt: sanitizeText(input.reviewDueAt ?? safeBase.reviewDueAt, 30),
    sourceName: sanitizeText(input.sourceName ?? safeBase.sourceName, 120),
    consentConfirmed: Boolean(input.consentConfirmed ?? safeBase.consentConfirmed),
    checkedAt: sanitizeText(input.checkedAt ?? safeBase.checkedAt, 30),
    hidden: Boolean(input.hidden ?? safeBase.hidden),
    hiddenAt: sanitizeText(input.hiddenAt ?? safeBase.hiddenAt, 40),
    hiddenByUid: sanitizeText(input.hiddenByUid ?? safeBase.hiddenByUid, 128),
    deleted: Boolean(input.deleted ?? safeBase.deleted),
    deletedAt: sanitizeText(input.deletedAt ?? safeBase.deletedAt, 40),
    deletedByUid: sanitizeText(input.deletedByUid ?? safeBase.deletedByUid, 128),
    images: sanitizeStringArray(input.images ?? safeBase.images, 3, 500),
    submitterRole: sanitizeText(input.submitterRole ?? safeBase.submitterRole, 40),
    evidenceFiles: normalizeEvidenceFiles(input.evidenceFiles ?? safeBase.evidenceFiles),
    sourceSubmissionId: sanitizeText(input.sourceSubmissionId ?? safeBase.sourceSubmissionId, 120),
    verification: normalizeVerification(input.verification ?? safeBase.verification),
  }

  if (type === 'merchant') {
    const phones = normalizeMerchantPhones(input, safeBase)
    const category = required(input.category, '商家分类')
    const subCategory = sanitizeText(input.subCategory ?? safeBase.subCategory, 40)
    if (!isValidMerchantCategory(category, subCategory)) {
      throw new Error('商家一级分类和二级分类不匹配')
    }
    return {
      ...shared,
      name: required(input.name, '商家名称'),
      category,
      subCategory,
      area: sanitizeText(input.area ?? safeBase.area, 40),
      phone: phones[0],
      phones,
      phonesSearch: phones.join(' '),
      wechat: sanitizeText(input.wechat, 80),
      address: required(input.address, '地址', 160),
      businessHours: sanitizeText(input.businessHours, 80),
      description: required(input.description, '商家简介', 1200),
      tags: sanitizeStringArray(input.tags, 20, 30),
    }
  }
  if (type === 'job') {
    return {
      ...shared,
      title: required(input.title, '岗位名称'),
      companyName: required(input.companyName, '公司名称'),
      category: sanitizeText(input.category, 40),
      salaryRange: required(input.salaryRange, '薪资范围', 80),
      location: required(input.location, '工作地点', 160),
      workingTime: sanitizeText(input.workingTime, 100),
      headcount: sanitizeText(input.headcount, 40),
      contact: required(input.contact, '联系方式', 80),
      requirement: required(input.requirement, '岗位要求', 1200),
      validUntil: sanitizeText(input.validUntil, 30),
    }
  }
  if (type === 'rental') {
    return {
      ...shared,
      title: required(input.title, '房源标题'),
      rent: required(input.rent, '租金', 80),
      location: required(input.location, '位置', 160),
      layout: required(input.layout, '户型', 80),
      area: sanitizeText(input.area, 80),
      contact: required(input.contact, '联系方式', 80),
      description: required(input.description, '房源说明', 1200),
      validUntil: sanitizeText(input.validUntil, 30),
    }
  }
  const validFrom = requiredDate(input.validFrom, '活动开始日期')
  const validUntil = requiredDate(input.validUntil, '活动结束日期')
  if (validFrom > validUntil) throw new Error('活动结束日期不能早于开始日期')
  return {
    ...shared,
    title: required(input.title, '活动标题'),
    merchantName: required(input.merchantName, '商家名称'),
    merchantId: sanitizeText(input.merchantId, 120),
    summary: required(input.summary || input.description, '活动摘要', 200),
    description: required(input.description, '活动说明', 1200),
    phone: sanitizeText(input.phone, 30),
    wechat: sanitizeText(input.wechat, 80),
    validFrom,
    validUntil,
    displayOrder: normalizeDisplayOrder(input.displayOrder ?? safeBase.displayOrder),
  }
}

function mapSubmissionToEntry(submission) {
  const common = {
    status: 'published',
    images: Array.isArray(submission.publicImages) ? submission.publicImages : (Array.isArray(submission.images) ? submission.images : []),
    isTop: Boolean(submission.isTop),
    topUntil: submission.topUntil || '',
    isFeatured: Boolean(submission.isFeatured),
    featuredUntil: submission.featuredUntil || '',
    isPaid: Boolean(submission.isPaid),
    paidType: submission.paidType || '',
    chargeUntil: submission.chargeUntil || '',
    adminNote: submission.adminNote || '',
    submitterRole: submission.submitterRole || '',
    evidenceFiles: Array.isArray(submission.evidenceFiles) ? submission.evidenceFiles : [],
    sourceSubmissionId: submission.id || submission._id || '',
  }
  if (submission.type === 'merchant' || submission.type === 'service') {
    return {
      ...common,
      name: submission.title || '',
      category: submission.category || (submission.type === 'service' ? '生活服务' : '其他便民'),
      subCategory: submission.subCategory || (submission.type === 'service' ? '水电维修' : '便民服务'),
      area: submission.area || '',
      phone: submission.phone || '',
      phones: submission.phone ? [submission.phone] : [],
      phonesSearch: submission.phone || '',
      wechat: submission.wechat || '',
      address: submission.location || '六库城区',
      businessHours: submission.businessHours || '电话联系',
      description: submission.content || '',
      tags: [],
    }
  }
  if (submission.type === 'job') {
    return {
      ...common,
      title: submission.title || '',
      companyName: submission.category || submission.contactName || '',
      category: submission.category || '',
      salaryRange: '面议',
      location: submission.location || '六库城区',
      workingTime: '',
      headcount: '',
      contact: submission.phone || '',
      requirement: submission.content || '',
      validUntil: '',
    }
  }
  if (submission.type === 'rental') {
    return {
      ...common,
      title: submission.title || '',
      rent: submission.rent || '面议',
      location: submission.location || '六库城区',
      layout: submission.layout || '请咨询发布者',
      area: submission.area || '',
      contact: submission.phone || '',
      description: submission.content || '',
      validUntil: submission.validUntil || '',
    }
  }
  return {
    ...common,
    title: submission.title || '',
    merchantName: submission.merchantName || submission.contactName || '本地商家',
    merchantId: submission.merchantId || '',
    summary: sanitizeText(submission.content, 200),
    description: submission.content || '',
    phone: submission.phone || '',
    wechat: submission.wechat || '',
    images: Array.isArray(submission.images) ? submission.images : [],
    validFrom: submission.validFrom || '',
    validUntil: submission.validUntil || '',
    displayOrder: 100,
    isFeatured: true,
  }
}

function normalizeEvidenceFiles(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 6).map((item) => ({
    type: sanitizeText(item && item.type, 40),
    fileId: sanitizeText(item && item.fileId, 500),
  })).filter((item) => item.type && item.fileId && item.fileId.startsWith('cloud://'))
}

function normalizeVerification(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawChecks = source.checks && typeof source.checks === 'object' && !Array.isArray(source.checks)
    ? source.checks
    : {}
  const checks = Object.keys(rawChecks).slice(0, 20).reduce((result, key) => {
    result[sanitizeText(key, 50)] = rawChecks[key] === true
    return result
  }, {})
  return {
    status: ['pending', 'verified', 'rejected'].includes(source.status) ? source.status : 'pending',
    checks,
    verifiedByUid: sanitizeText(source.verifiedByUid, 128),
    verifiedAt: sanitizeText(source.verifiedAt, 40),
    note: sanitizeText(source.note, 500),
  }
}

function sanitizeImportRows(type, rawRows) {
  if (!Array.isArray(rawRows)) {
    return { rows: [], errors: [{ row: 0, message: '导入内容不是数组' }] }
  }
  if (rawRows.length > 100) {
    return { rows: [], errors: [{ row: 0, message: '单次最多导入 100 条' }] }
  }

  const rows = []
  const errors = []
  const sourceCodes = new Set()
  rawRows.forEach((raw, index) => {
    const sourceCode = sanitizeText(raw && raw.sourceCode, 30).toUpperCase()
    if (!/^[MJR][A-Z0-9_-]{3,29}$/.test(sourceCode)) {
      errors.push({ row: index + 2, field: 'sourceCode', message: '编号格式不正确' })
      return
    }
    if (sourceCodes.has(sourceCode)) {
      errors.push({ row: index + 2, field: 'sourceCode', message: '编号在本次导入中重复' })
      return
    }
    sourceCodes.add(sourceCode)
    try {
      rows.push({
        ...createEntryDocument(type, normalizeImportRow(raw), {
          id: `preview_${sourceCode}`,
          status: normalizeStatus(raw.status) || 'draft',
        }),
        sourceCode,
      })
    } catch (error) {
      errors.push({ row: index + 2, message: error.message || '数据不完整' })
    }
  })
  return { rows, errors }
}

function normalizeImportRow(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    ...value,
    tags: Array.isArray(value.tags)
      ? value.tags
      : sanitizeText(value.tags, 300).split('|').map((item) => item.trim()).filter(Boolean),
    images: Array.isArray(value.images)
      ? value.images
      : sanitizeText(value.images, 1500).split('|').map((item) => item.trim()).filter(Boolean),
    consentConfirmed: value.consentConfirmed === true ||
      ['是', 'yes', 'true', '1'].includes(sanitizeText(value.consentConfirmed, 10).toLowerCase()),
  }
}

function normalizeMerchantPhones(input, base = {}) {
  const source = Array.isArray(input.phones)
    ? input.phones
    : typeof input.phone === 'string' && input.phone.includes('|')
      ? input.phone.split('|')
      : input.phone
        ? [input.phone]
        : Array.isArray(base.phones) && base.phones.length
          ? base.phones
          : base.phone
            ? [base.phone]
            : []

  if (source.some((item) => !sanitizeText(item, 30))) {
    throw new Error('联系电话之间不能包含空号码')
  }

  const phones = []
  source.forEach((item) => {
    const phone = sanitizeText(item, 30)
    if (!/^[0-9+\-() ]+$/.test(phone)) {
      throw new Error('联系电话只能包含数字、空格及 + - ( )')
    }
    if (!phones.includes(phone)) phones.push(phone)
  })

  if (!phones.length) throw new Error('联系电话不能为空')
  if (phones.length > 3) throw new Error('商家联系电话最多填写 3 个')
  return phones
}

function serializeValue(value) {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).reduce((result, key) => {
    result[key] = serializeValue(value[key])
    return result
  }, {})
}

function calculateEvidenceRetainUntil(value = Date.now()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('材料保留期起算时间不合法')
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString()
}

function getRequiredEvidenceTypes(type, submitterRole) {
  if (type === 'merchant') return ['business_license', 'storefront']
  if (type === 'rental' && submitterRole === 'registered_agent') {
    return ['business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof']
  }
  if (type === 'rental' && submitterRole === 'property_owner') return ['ownership_proof']
  return []
}

function getRequiredVerificationKeys(type, submitterRole) {
  if (type === 'merchant') return ['licenseSubject', 'premise', 'phoneCallback', 'displayConsent']
  if (type === 'rental' && submitterRole === 'registered_agent') {
    return ['agencySubject', 'brokerageFiling', 'ownerAuthorization', 'rentalRight', 'phoneCallback']
  }
  if (type === 'rental' && submitterRole === 'property_owner') {
    return ['identityRelation', 'rentalRight', 'listingMatch', 'phoneCallback', 'displayConsent']
  }
  return []
}

function sanitizeStringArray(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : []
}

function required(value, label, maxLength = 100) {
  const text = sanitizeText(value, maxLength)
  if (!text) throw new Error(`${label}不能为空`)
  return text
}

function requiredDate(value, label) {
  const date = sanitizeText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label}格式不正确`)
  return date
}

function normalizeDisplayOrder(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(0, Math.min(9999, Math.floor(parsed)))
}

module.exports = {
  ENTRY_COLLECTIONS,
  ENTRY_TYPES,
  createEntryDocument,
  createId,
  calculateEvidenceRetainUntil,
  getRequiredEvidenceTypes,
  getRequiredVerificationKeys,
  mapSubmissionToEntry,
  normalizeCursor,
  normalizePageSize,
  normalizeStatus,
  normalizeMerchantPhones,
  sanitizeImportRows,
  sanitizeText,
  serializeValue,
}
