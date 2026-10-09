const cloud = require('wx-server-sdk')
const {
  escapeRegExp,
  getEntryConfig,
  normalizeCursor,
  normalizePageSize,
  sanitizePublicDocument,
  sanitizeText,
  serializeValue,
  toSearchResult,
} = require('./query-utils')
const { BOARD_LABELS, getMerchantBoard, normalizeMerchantFilters } = require('./merchant-taxonomy')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const SERVICE_NAME = 'liuku-public-api'
const SERVICE_VERSION = '1.3.0'
const APP_ID_ENV_NAME = 'LIUKU_ALLOWED_APP_ID'
const CHANNEL_POLICY_CONFIG_ID = 'channel_policy'
const DEFAULT_PUBLIC_CHANNELS = { merchant: true, rental: true, job: false, offer: true }
const SERVICE_KEYWORDS = ['开锁', '修水电', '搬家', '快递', '家政', '疏通', '维修', '跑腿']

/**
 * 公开信息云函数入口。
 *
 * 支持阶段 2 健康检查和阶段 3 公开信息读取。
 * 身份只从 cloud.getWXContext() 获取，不接受前端传入 openid。
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

  if (action === 'health') {
    return success({
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      authenticated: true,
      identity: maskIdentity(openid),
      serverTime: Date.now(),
    })
  }

  try {
    if ((action === 'list' || action === 'detail') && !(await isPublicChannelEnabled(payload.type))) {
      return failure('CHANNEL_DISABLED', payload.type === 'job' ? '招聘频道暂未开放' : '该频道暂时停止服务')
    }
    if (action === 'list') {
      return success(await listEntries(payload))
    }
    if (action === 'detail') {
      return success(await getEntryDetail(payload))
    }
    if (action === 'search') {
      return success(await searchPublicEntries(payload))
    }
    if (action === 'home') {
      return success(await loadHomeData())
    }
    if (action === 'config') {
      return success(await loadPublicConfig(payload))
    }
    if (action === 'listComments') {
      return failure('COMMENTS_DISABLED', '公开评论功能已停用')
    }
    return failure('UNSUPPORTED_ACTION', '不支持该公开数据操作')
  } catch (error) {
    console.error('公开数据查询失败', {
      action,
      code: error && (error.errCode || error.code) ? error.errCode || error.code : 'UNKNOWN',
    })
    if (error && (error.code === 'INVALID_FILTER' || error.code === 'INVALID_ARGUMENT')) {
      return failure(error.code, error.message || '公开查询参数不合法')
    }
    return failure(
      'PUBLIC_QUERY_FAILED',
      '公开信息读取失败，请稍后重试',
      `请在云开发控制台查看 ${SERVICE_NAME} 日志和数据库索引状态`,
    )
  }
}

async function loadPublicConfig(payload) {
  const id = sanitizeText(payload.id, 80) || 'customer_service'
  try {
    const result = await db.collection('liuku_configs').doc(id).get()
    const document = result && result.data ? result.data : {}
    return {
      item: {
        id,
        phone: sanitizeText(document.phone, 30),
        wechat: sanitizeText(document.wechat, 80),
        description: sanitizeText(document.description, 300),
        updatedAt: serializeValue(document.updatedAt || ''),
      },
      serverTime: new Date().toISOString(),
    }
  } catch (error) {
    if (!isDocumentNotFound(error)) throw error
    return {
      item: {
        id,
        phone: '',
        wechat: '',
        description: '客服用于信息纠错、投诉反馈和商家合作。',
        updatedAt: '',
      },
      serverTime: new Date().toISOString(),
    }
  }
}

async function listEntries(payload) {
  const type = sanitizeText(payload.type, 20)
  const config = getEntryConfig(type)
  if (!config) {
    throw createInputError('信息类型不合法')
  }

  const keyword = sanitizeText(payload.keyword, 60)
  const board = sanitizeText(payload.board, 20)
  const category = sanitizeText(payload.category, 40)
  const subCategory = sanitizeText(payload.subCategory, 40)
  const merchantFilters = type === 'merchant'
    ? normalizeMerchantFilters({ board, category, subCategory })
    : { categories: [], subCategory: '' }
  const cursor = normalizeCursor(payload.cursor)
  const pageSize = normalizePageSize(payload.pageSize)
  const items = await queryPublishedEntries({
    type,
    keyword,
    categories: merchantFilters.categories,
    subCategory: merchantFilters.subCategory,
    offset: cursor,
    limit: pageSize + 1,
  })
  const hasMore = items.length > pageSize
  const visibleItems = hasMore ? items.slice(0, pageSize) : items
  const nextOffset = cursor + visibleItems.length

  return {
    items: visibleItems,
    nextCursor: hasMore ? String(nextOffset) : '',
    hasMore,
    serverTime: Date.now(),
  }
}

/** 云端频道策略读取失败时使用安全默认值，其中招聘始终关闭。 */
async function isPublicChannelEnabled(type) {
  if (type === 'job') return false
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_PUBLIC_CHANNELS, type)) return true
  try {
    const result = await db.collection('liuku_configs').doc(CHANNEL_POLICY_CONFIG_ID).get()
    const channel = result && result.data && result.data.channels && result.data.channels[type]
    return channel && typeof channel.publicVisible === 'boolean'
      ? channel.publicVisible
      : DEFAULT_PUBLIC_CHANNELS[type]
  } catch (error) {
    return DEFAULT_PUBLIC_CHANNELS[type]
  }
}

async function getEntryDetail(payload) {
  const type = sanitizeText(payload.type, 20)
  const id = sanitizeText(payload.id, 100)
  const config = getEntryConfig(type)
  if (!config || !id) {
    throw createInputError('详情参数不完整')
  }

  try {
    const result = await db.collection(config.collection).doc(id).get()
    const document = result && result.data ? result.data : null
    if (
      !document ||
      document.status !== 'published' ||
      document.hidden === true ||
      document.deleted === true ||
      (type === 'offer' && !isOfferActive(document))
    ) {
      return {
        item: null,
        serverTime: Date.now(),
      }
    }
    return {
      item: sanitizePublicDocument(type, document),
      serverTime: Date.now(),
    }
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return {
        item: null,
        serverTime: Date.now(),
      }
    }
    throw error
  }
}

async function searchPublicEntries(payload) {
  const keyword = sanitizeText(payload.keyword, 60)
  const pageSize = normalizePageSize(payload.pageSize)
  if (!keyword) {
    return {
      items: [],
      serverTime: Date.now(),
    }
  }

  const resultGroups = await Promise.all(
    ['merchant', 'rental', 'offer'].map(async (type) => {
      const items = await queryPublishedEntries({
        type,
        keyword,
        categories: [],
        subCategory: '',
        offset: 0,
        limit: pageSize,
      })
      const searchItems = await Promise.all(items.map(async (item) => {
        const result = toSearchResult(type, item)
        if (type !== 'offer' || !result) return result
        return inheritOfferBoard(result, item)
      }))
      return searchItems.filter(Boolean)
    }),
  )

  return {
    items: resultGroups.flat(),
    serverTime: Date.now(),
  }
}

/**
 * 优惠活动不单独形成板块；搜索结果继承其关联商家的店/修/购归属。
 * 关联商家失效时安全回退到“店”，且不会把商家私密字段带入公开结果。
 */
async function inheritOfferBoard(result, offer) {
  const merchantId = sanitizeText(offer.merchantId, 100)
  if (!merchantId) return result
  try {
    const response = await db.collection('liuku_merchants').doc(merchantId).get()
    const merchant = response && response.data ? response.data : null
    if (!merchant || merchant.status !== 'published' || merchant.hidden === true || merchant.deleted === true) {
      return result
    }
    const board = getMerchantBoard(sanitizeText(merchant.category, 40)) || 'store'
    return { ...result, board, boardLabel: BOARD_LABELS[board] }
  } catch (error) {
    if (isDocumentNotFound(error)) return result
    throw error
  }
}

async function loadHomeData() {
  const [merchants, rentals, offers] = await Promise.all([
    queryPublishedEntries({
      type: 'merchant',
      keyword: '',
      categories: [],
      subCategory: '',
      offset: 0,
      limit: 5,
    }),
    queryPublishedEntries({
      type: 'rental',
      keyword: '',
      categories: [],
      subCategory: '',
      offset: 0,
      limit: 5,
    }),
    queryPublishedEntries({
      type: 'offer',
      keyword: '',
      categories: [],
      subCategory: '',
      offset: 0,
      limit: 6,
    }),
  ])

  const recommendations = []
  const featuredMerchant = merchants.find((item) => item.isFeatured || item.isTop) || merchants[0]
  const latestRental = rentals[0]

  if (featuredMerchant) {
    recommendations.push({
      id: featuredMerchant.id,
      type: 'merchant',
      title: featuredMerchant.name,
      subtitle: `${featuredMerchant.category} · ${featuredMerchant.businessHours}`,
      meta: featuredMerchant.phone,
      statusLabel: '营业中',
      statusTone: 'green',
    })
  }
  if (latestRental) {
    recommendations.push({
      id: latestRental.id,
      type: 'rental',
      title: latestRental.title,
      subtitle: `${latestRental.layout} · ${latestRental.location}`,
      meta: latestRental.rent,
      statusLabel: '出租',
      statusTone: 'olive',
    })
  }

  const carouselItems = [
    ...offers.filter((item) => item.isFeatured).map(toCarouselItem),
    ...merchants.filter((item) => item.isFeatured || item.isTop).map(toCarouselItem),
    ...rentals.filter((item) => item.isFeatured || item.isTop).map(toCarouselItem),
    ...offers.map(toCarouselItem),
    ...recommendations.map((item) => ({ ...item, image: '' })),
  ].filter((item, index, items) => items.findIndex(
    (candidate) => candidate.type === item.type && candidate.id === item.id,
  ) === index).slice(0, 6)

  return {
    featuredMerchants: merchants.filter((item) => item.isFeatured || item.isTop).slice(0, 4),
    latestJobs: [],
    latestRentals: rentals,
    carouselItems,
    recommendations,
    serviceKeywords: SERVICE_KEYWORDS,
    pendingCount: 0,
    serverTime: Date.now(),
  }
}

async function queryPublishedEntries({ type, keyword, categories = [], subCategory = '', offset, limit }) {
  if (!(await isPublicChannelEnabled(type))) return []
  const config = getEntryConfig(type)
  if (!config) {
    throw createInputError('信息类型不合法')
  }

  const conditions = [
    { status: 'published' },
    { hidden: command.neq(true) },
    { deleted: command.neq(true) },
  ]
  if (type === 'merchant' && categories.length === 1) {
    conditions.push({ category: categories[0] })
  } else if (type === 'merchant' && categories.length > 1) {
    conditions.push({ category: command.in(categories) })
  }
  if (type === 'merchant' && subCategory) {
    conditions.push({ subCategory })
  }
  if (type === 'offer') {
    const today = formatDate(new Date())
    conditions.push({ validFrom: command.lte(today) })
    conditions.push({ validUntil: command.gte(today) })
  }
  if (keyword) {
    const keywordRegExp = db.RegExp({
      regexp: escapeRegExp(keyword),
      options: 'i',
    })
    conditions.push(command.or(
      config.keywordFields.map((field) => ({
        [field]: keywordRegExp,
      })),
    ))
  }

  const whereCondition = conditions.length === 1
    ? conditions[0]
    : command.and(conditions)
  let query = db.collection(config.collection).where(whereCondition)
  query = type === 'offer'
    ? query.orderBy('displayOrder', 'asc').orderBy('updatedAt', 'desc')
    : query.orderBy('isTop', 'desc').orderBy('updatedAt', 'desc')
  const result = await query.skip(offset).limit(limit).get()

  return Array.isArray(result.data)
    ? result.data.map((item) => sanitizePublicDocument(type, item)).filter(Boolean)
    : []
}

function toCarouselItem(item) {
  if (item.type === 'merchant') {
    return {
      id: item.id,
      type: item.type,
      title: item.name,
      subtitle: `${item.category || ''} · ${item.address || ''}`,
      meta: item.phone || '',
      statusLabel: '商家',
      statusTone: 'green',
      image: Array.isArray(item.images) ? item.images[0] || '' : '',
    }
  }
  if (item.type === 'job') {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: `${item.companyName || ''} · ${item.location || ''}`,
      meta: item.salaryRange || '',
      statusLabel: '招聘',
      statusTone: 'orange',
      image: '',
    }
  }
  if (item.type === 'rental') {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: `${item.layout || ''} · ${item.location || ''}`,
      meta: item.rent || '',
      statusLabel: '出租',
      statusTone: 'olive',
      image: Array.isArray(item.images) ? item.images[0] || '' : '',
    }
  }
  return {
    id: item.id,
    type: 'offer',
    title: item.title,
    subtitle: `${item.merchantName || ''} · ${item.summary || ''}`,
    meta: item.validUntil ? `有效至 ${item.validUntil}` : '活动时间请咨询商家',
    statusLabel: '优惠',
    statusTone: 'yellow',
    image: Array.isArray(item.images) ? item.images[0] || '' : '',
  }
}

function isOfferActive(document) {
  const today = formatDate(new Date())
  return (!document.validFrom || document.validFrom <= today) &&
    (!document.validUntil || document.validUntil >= today)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeRating(value) {
  const rating = Number(value)
  if (!Number.isFinite(rating)) return 5
  return Math.max(1, Math.min(5, Math.round(rating)))
}

function success(data) {
  return {
    ok: true,
    code: 'OK',
    message: '调用成功',
    data: serializeValue(data),
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
  return `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function createInputError(message) {
  const error = new Error(message)
  error.code = 'INVALID_ARGUMENT'
  return error
}

function isDocumentNotFound(error) {
  const message = error && error.message ? String(error.message) : ''
  return Boolean(error && (error.errCode === -502005 || error.code === 'DATABASE_DOCUMENT_NOT_FOUND')) ||
    /does not exist|not found/i.test(message)
}
