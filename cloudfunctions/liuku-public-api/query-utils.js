const ENTRY_CONFIG = {
  merchant: {
    collection: 'liuku_merchants',
    keywordFields: [
      'name', 'category', 'subCategory', 'area', 'phone', 'phonesSearch',
      'wechat', 'address', 'description', 'tags',
    ],
    publicFields: [
      'type', 'status', 'name', 'category', 'subCategory', 'area', 'phone',
      'phones', 'wechat', 'address', 'businessHours', 'description', 'images',
      'tags', 'isTop', 'topUntil', 'isFeatured', 'featuredUntil', 'createdAt',
      'updatedAt',
    ],
  },
  job: {
    collection: 'liuku_jobs',
    keywordFields: [
      'title', 'companyName', 'category', 'salaryRange', 'location',
      'workingTime', 'headcount', 'contact', 'requirement',
    ],
    publicFields: [
      'type', 'status', 'title', 'companyName', 'category', 'salaryRange',
      'location', 'workingTime', 'headcount', 'contact', 'requirement',
      'validUntil', 'isTop', 'topUntil', 'isFeatured', 'featuredUntil',
      'createdAt', 'updatedAt',
    ],
  },
  rental: {
    collection: 'liuku_rentals',
    keywordFields: ['title', 'rent', 'location', 'layout', 'area', 'contact', 'description'],
    publicFields: [
      'type', 'status', 'title', 'rent', 'location', 'layout', 'area',
      'images', 'contact', 'description', 'validUntil', 'isTop', 'topUntil',
      'isFeatured', 'featuredUntil', 'createdAt', 'updatedAt',
    ],
  },
  offer: {
    collection: 'liuku_offers',
    keywordFields: ['title', 'merchantName', 'summary', 'description', 'phone'],
    publicFields: [
      'type', 'status', 'title', 'merchantName', 'merchantId', 'summary',
      'description', 'phone', 'wechat', 'images', 'validFrom', 'validUntil',
      'displayOrder', 'isFeatured', 'featuredUntil', 'createdAt', 'updatedAt',
    ],
  },
}

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 20
const { BOARD_LABELS, getMerchantBoard } = require('./merchant-taxonomy')

function getEntryConfig(type) {
  return ENTRY_CONFIG[type] || null
}

function normalizePageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)))
}

function normalizeCursor(value) {
  const parsed = Number.parseInt(String(value || '0'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function sanitizeText(value, maxLength = 80) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sanitizePublicDocument(type, document) {
  const config = getEntryConfig(type)
  if (!config || !document || typeof document !== 'object') {
    return null
  }

  const result = {
    id: typeof document.id === 'string' && document.id
      ? document.id
      : String(document._id || ''),
  }

  for (const field of config.publicFields) {
    if (typeof document[field] !== 'undefined') {
      result[field] = serializeValue(document[field])
    }
  }

  if (type === 'merchant') {
    result.phones = normalizeMerchantPhones(result.phone, result.phones)
    result.phone = result.phones[0] || ''
  }

  result.type = type
  return result.id ? result : null
}

function normalizeMerchantPhones(phone, phones) {
  const source = Array.isArray(phones) && phones.length ? phones : [phone]
  return source.reduce((result, item) => {
    const value = sanitizeText(item, 30)
    if (value && !result.includes(value)) result.push(value)
    return result
  }, []).slice(0, 3)
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

function toSearchResult(type, item) {
  if (!item) {
    return null
  }

  if (type === 'merchant') {
    const board = getMerchantBoard(item.category) || 'store'
    return {
      id: item.id,
      type,
      title: item.name || '',
      subtitle: `${item.category || ''} · ${item.address || ''}`,
      phone: item.phone || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      board,
      boardLabel: BOARD_LABELS[board],
    }
  }

  if (type === 'job') {
    return {
      id: item.id,
      type,
      title: item.title || '',
      subtitle: `${item.companyName || ''} · ${item.salaryRange || ''}`,
      phone: item.contact || '',
      tags: [item.location || '', item.headcount || ''].filter(Boolean),
      board: 'store',
      boardLabel: '店',
    }
  }

  if (type === 'rental') {
    return {
      id: item.id,
      type,
      title: item.title || '',
      subtitle: `${item.rent || ''} · ${item.location || ''}`,
      phone: item.contact || '',
      tags: [item.layout || '', item.area || ''].filter(Boolean),
      board: 'rental',
      boardLabel: '房',
    }
  }

  return {
    id: item.id,
    type,
    title: item.title || '',
    subtitle: `${item.merchantName || ''} · ${item.validUntil ? `有效至 ${item.validUntil}` : '优惠活动'}`,
    phone: item.phone || '',
    tags: ['优惠活动', item.merchantName || ''].filter(Boolean),
    board: 'store',
    boardLabel: '店',
  }
}

module.exports = {
  ENTRY_CONFIG,
  escapeRegExp,
  getEntryConfig,
  normalizeCursor,
  normalizePageSize,
  normalizeMerchantPhones,
  sanitizePublicDocument,
  sanitizeText,
  serializeValue,
  toSearchResult,
}
