import {
  CUSTOMER_SERVICE_TEXT,
  REVIEW_STATUS_LABELS,
  SERVICE_KEYWORDS,
  STORAGE_KEYS,
} from '../constants/local-life'
import { getMerchantBoard } from '../constants/merchant-taxonomy'
import type {
  AdminPatch,
  EntryType,
  FeedbackStatus,
  FeedbackSubmission,
  HomeCarouselItem,
  HomeData,
  HomeRecommendation,
  JobPost,
  LocalOffer,
  Merchant,
  PromotionFields,
  RentalPost,
  ReviewStatus,
  SearchResult,
  Submission,
  SubmitEntryInput,
  SubmitFeedbackInput,
} from '../types/local-life'

/**
 * 本服务是 MVP 的唯一数据访问入口。
 * 当前阶段使用 mock 数据与 wx storage；后续接云开发时优先替换本文件实现。
 */

const defaultPromotion: PromotionFields = {
  isTop: false,
  topUntil: '',
  isFeatured: false,
  featuredUntil: '',
  isPaid: false,
  paidType: '',
  chargeUntil: '',
  adminNote: '',
}

const mockMerchants: Merchant[] = [
  {
    ...defaultPromotion,
    id: 'merchant-001',
    type: 'merchant',
    status: 'published',
    name: '六库阿丽小吃',
    category: '餐饮美食',
    subCategory: '小吃快餐',
    area: '江西',
    phone: '13900001111',
    phones: ['13900001111'],
    wechat: 'liuku-food',
    address: '六库人民路便民市场旁',
    businessHours: '08:00-21:30',
    description: '本地家常小吃，支持电话预订，适合附近居民日常用餐。',
    images: [],
    tags: ['本地老店', '可预订', '堂食'],
    isTop: true,
    isFeatured: true,
    topUntil: '2026-06-30',
    featuredUntil: '2026-06-15',
    createdAt: '2026-05-01 09:00',
    updatedAt: '2026-05-20 16:30',
  },
  {
    ...defaultPromotion,
    id: 'merchant-002',
    type: 'merchant',
    status: 'published',
    name: '老张水电维修',
    category: '生活服务',
    subCategory: '水电维修',
    area: '城外',
    phone: '13800002222',
    phones: ['13800002222'],
    wechat: 'liuku-fix',
    address: '六库城区可上门',
    businessHours: '09:00-22:00',
    description: '提供水管、灯具、插座、热水器基础维修，建议提前电话确认上门时间。',
    images: [],
    tags: ['上门服务', '修水电', '便民'],
    isFeatured: true,
    featuredUntil: '2026-06-08',
    createdAt: '2026-05-03 10:00',
    updatedAt: '2026-05-21 11:20',
  },
  {
    ...defaultPromotion,
    id: 'merchant-003',
    type: 'merchant',
    status: 'published',
    name: '六库快捷洗车',
    category: '车辆服务',
    subCategory: '洗车美容',
    area: '江东',
    phone: '13700003333',
    phones: ['13700003333'],
    wechat: '',
    address: '六库桥头停车场内',
    businessHours: '08:30-19:00',
    description: '日常洗车、内饰清洁、简易打蜡，节假日前建议电话排队。',
    images: [],
    tags: ['洗车', '停车方便'],
    createdAt: '2026-05-07 12:00',
    updatedAt: '2026-05-19 14:10',
  },
  {
    ...defaultPromotion,
    id: 'merchant-004',
    type: 'merchant',
    status: 'published',
    name: '王师傅开锁换锁',
    category: '生活服务',
    subCategory: '开锁换锁',
    area: '城外',
    phone: '13976552210',
    phones: ['13976552210'],
    wechat: '',
    address: '六库城区可上门',
    businessHours: '24 小时电话联系',
    description: '提供开锁、换锁和锁具检查服务，上门前请准备有效身份证明。',
    images: [],
    tags: ['开锁', '24小时', '电话联系'],
    createdAt: '2026-05-08 09:00',
    updatedAt: '2026-06-02 08:30',
  },
  {
    ...defaultPromotion,
    id: 'merchant-005',
    type: 'merchant',
    status: 'published',
    name: '江东家政服务',
    category: '生活服务',
    subCategory: '家政保洁',
    area: '江东',
    phone: '18008863567',
    phones: ['18008863567'],
    wechat: '',
    address: '六库城区可预约',
    businessHours: '08:30-20:00',
    description: '提供日常保洁、搬家整理和家电基础清洁服务。',
    images: [],
    tags: ['家政', '可预约', '每周服务'],
    createdAt: '2026-05-09 09:00',
    updatedAt: '2026-06-01 11:00',
  },
  {
    ...defaultPromotion,
    id: 'merchant-006',
    type: 'merchant',
    status: 'published',
    name: '顺达疏通服务',
    category: '生活服务',
    subCategory: '水电维修',
    area: '城外',
    phone: '13987652210',
    phones: ['13987652210'],
    wechat: '',
    address: '六库城区可电话咨询',
    businessHours: '08:00-22:00',
    description: '提供下水道疏通、管道检查和基础维修。',
    images: [],
    tags: ['疏通', '可电话咨询', '上门服务'],
    createdAt: '2026-05-10 09:00',
    updatedAt: '2026-05-31 18:00',
  },
]

const mockJobs: JobPost[] = [
  {
    ...defaultPromotion,
    id: 'job-001',
    type: 'job',
    status: 'published',
    title: '餐饮店服务员',
    companyName: '六库阿丽小吃',
    category: '餐饮',
    salaryRange: '3000-3800 元/月',
    location: '人民路便民市场旁',
    workingTime: '两班倒，月休 3 天',
    headcount: '2 人',
    contact: '13900001111',
    requirement: '做事认真，能适应饭点忙碌节奏，有餐饮经验优先。',
    validUntil: '2026-06-30',
    isTop: true,
    topUntil: '2026-06-10',
    createdAt: '2026-05-20 09:30',
    updatedAt: '2026-05-21 09:30',
  },
  {
    ...defaultPromotion,
    id: 'job-002',
    type: 'job',
    status: 'published',
    title: '便利店夜班收银',
    companyName: '六库邻里便利',
    category: '零售',
    salaryRange: '面议',
    location: '六库城区',
    workingTime: '夜班，具体面谈',
    headcount: '1 人',
    contact: '13600004444',
    requirement: '会基础收银，责任心强，能长期稳定优先。',
    validUntil: '2026-06-20',
    createdAt: '2026-05-18 15:00',
    updatedAt: '2026-05-18 15:00',
  },
]

const mockRentals: RentalPost[] = [
  {
    ...defaultPromotion,
    id: 'rental-001',
    type: 'rental',
    status: 'published',
    title: '人民路附近两室一厅出租',
    rent: '1200 元/月',
    location: '人民路附近',
    layout: '两室一厅',
    area: '约 70 平方米',
    images: [],
    contact: '13500005555',
    description: '家具基本齐全，适合家庭或合租，具体房况请电话确认后实地查看。',
    validUntil: '2026-06-30',
    isTop: true,
    topUntil: '2026-06-05',
    createdAt: '2026-05-19 10:20',
    updatedAt: '2026-05-20 18:00',
  },
  {
    ...defaultPromotion,
    id: 'rental-002',
    type: 'rental',
    status: 'published',
    title: '六库城区单间出租',
    rent: '550 元/月',
    location: '六库城区',
    layout: '单间',
    area: '约 22 平方米',
    images: [],
    contact: '13400006666',
    description: '交通方便，适合单人居住，水电费用请与发布者确认。',
    validUntil: '2026-06-18',
    createdAt: '2026-05-17 11:10',
    updatedAt: '2026-05-17 11:10',
  },
]

const mockOffers: LocalOffer[] = [
  {
    ...defaultPromotion,
    id: 'offer-001',
    type: 'offer',
    status: 'published',
    title: '到店消费满 30 元赠饮品',
    merchantName: '六库阿丽小吃',
    merchantId: 'merchant-001',
    summary: '活动期间到店消费满 30 元，可获赠指定饮品一份。',
    description: '活动数量有限，具体赠品和使用条件请到店或电话咨询商家。平台仅作信息展示。',
    phone: '13900001111',
    wechat: 'liuku-food',
    images: [],
    validFrom: '2026-06-01',
    validUntil: '2026-12-31',
    displayOrder: 20,
    isFeatured: true,
    featuredUntil: '2026-12-31',
    createdAt: '2026-06-01 09:00',
    updatedAt: '2026-06-01 09:00',
  },
]

function nowText(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  const hour = `${now.getHours()}`.padStart(2, '0')
  const minute = `${now.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function readSubmissions(): Submission[] {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.submissions)
    if (!Array.isArray(value)) {
      return []
    }
    return (value as Array<Submission & { images?: string[] }>).map((item) => ({
      ...item,
      images: Array.isArray(item.images) ? item.images : [],
    }))
  } catch (error) {
    console.warn('读取本地投稿失败', error)
    return []
  }
}

function readFeedbacks(): FeedbackSubmission[] {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.feedbacks)
    return Array.isArray(value) ? value as FeedbackSubmission[] : []
  } catch (error) {
    console.warn('读取本地纠错记录失败', error)
    return []
  }
}

function writeFeedbacks(items: FeedbackSubmission[]): void {
  try {
    wx.setStorageSync(STORAGE_KEYS.feedbacks, items)
  } catch (error) {
    // 写入失败必须抛给页面层，避免界面误提示“提交成功”。
    console.error('写入本地纠错记录失败', error)
    throw error
  }
}

function writeSubmissions(items: Submission[]): void {
  try {
    wx.setStorageSync(STORAGE_KEYS.submissions, items)
  } catch (error) {
    // 投稿是核心数据，持久化失败时不得继续返回成功结果。
    console.error('写入本地投稿失败', error)
    throw error
  }
}

function isPublicStatus(status: ReviewStatus): boolean {
  return status === 'published'
}

function rankByPromotion<T extends { isTop: boolean; updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((first, second) => {
    if (first.isTop !== second.isTop) {
      return first.isTop ? -1 : 1
    }
    return second.updatedAt.localeCompare(first.updatedAt)
  })
}

function matchKeyword(values: string[], keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return values.some((value) => value.toLowerCase().includes(normalized))
}

function submissionToMerchant(item: Submission): Merchant {
  return {
    ...defaultPromotion,
    id: item.id,
    type: 'merchant',
    status: item.status,
    name: item.title,
    category: item.type === 'service' ? '其他便民' : item.category || '其他便民',
    subCategory: '',
    area: '',
    phone: item.phone,
    phones: [item.phone],
    wechat: item.wechat,
    address: item.location || '六库本地',
    businessHours: '请电话咨询',
    description: item.content,
    images: item.images,
    tags: [item.category || '便民信息'],
    isTop: item.isTop,
    topUntil: item.topUntil,
    isFeatured: item.isFeatured,
    featuredUntil: item.featuredUntil,
    isPaid: item.isPaid,
    paidType: item.paidType,
    chargeUntil: item.chargeUntil,
    adminNote: item.adminNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function submissionToJob(item: Submission): JobPost {
  return {
    ...defaultPromotion,
    id: item.id,
    type: 'job',
    status: item.status,
    title: item.title,
    companyName: item.category || '本地商家',
    category: item.category || '其他',
    salaryRange: '请电话咨询',
    location: item.location || '六库本地',
    workingTime: '请电话咨询',
    headcount: '若干',
    contact: item.phone,
    requirement: item.content,
    validUntil: '',
    isTop: item.isTop,
    topUntil: item.topUntil,
    isFeatured: item.isFeatured,
    featuredUntil: item.featuredUntil,
    isPaid: item.isPaid,
    paidType: item.paidType,
    chargeUntil: item.chargeUntil,
    adminNote: item.adminNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function submissionToRental(item: Submission): RentalPost {
  return {
    ...defaultPromotion,
    id: item.id,
    type: 'rental',
    status: item.status,
    title: item.title,
    rent: item.category || '租金面议',
    location: item.location || '六库本地',
    layout: '请电话咨询',
    area: '',
    images: item.images,
    contact: item.phone,
    description: item.content,
    validUntil: '',
    isTop: item.isTop,
    topUntil: item.topUntil,
    isFeatured: item.isFeatured,
    featuredUntil: item.featuredUntil,
    isPaid: item.isPaid,
    paidType: item.paidType,
    chargeUntil: item.chargeUntil,
    adminNote: item.adminNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function submissionToOffer(item: Submission): LocalOffer {
  return {
    ...defaultPromotion,
    id: item.id,
    type: 'offer',
    status: item.status,
    title: item.title,
    merchantName: item.merchantName || item.contactName || '本地商家',
    merchantId: item.merchantId || '',
    summary: item.content.slice(0, 80),
    description: item.content,
    phone: item.phone,
    wechat: item.wechat,
    images: item.images,
    validFrom: item.validFrom || '',
    validUntil: item.validUntil || '',
    displayOrder: 100,
    isFeatured: item.isFeatured,
    featuredUntil: item.featuredUntil,
    isPaid: item.isPaid,
    paidType: item.paidType,
    chargeUntil: item.chargeUntil,
    adminNote: item.adminNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function listMerchants(category = '', keyword = ''): Merchant[] {
  const submitted = readSubmissions()
    .filter((item) => (item.type === 'merchant' || item.type === 'service') && isPublicStatus(item.status))
    .map(submissionToMerchant)
  const all = [...mockMerchants, ...submitted].filter((item) => item.status === 'published')
  const filtered = all.filter((item) => {
    const categoryMatched = !category || item.category === category || item.tags.includes(category)
    const keywordMatched = matchKeyword([
      item.name,
      item.category,
      item.subCategory,
      item.area,
      item.phone,
      ...item.phones,
      item.wechat,
      item.address,
      item.description,
      ...item.tags,
    ], keyword)
    return categoryMatched && keywordMatched
  })
  return rankByPromotion(filtered)
}

/**
 * 按首页板块读取商家。board 由一级分类推导，确保店、修、购不会互相串数据。
 */
export function listMerchantBoard(
  board: 'store' | 'service' | 'shopping',
  category = '',
  subCategory = '',
  keyword = '',
): Merchant[] {
  return listMerchants(category, keyword).filter((item) => (
    getMerchantBoard(item.category) === board
    && (!subCategory || item.subCategory === subCategory)
  ))
}

export function listJobs(keyword = ''): JobPost[] {
  const submitted = readSubmissions()
    .filter((item) => item.type === 'job' && isPublicStatus(item.status))
    .map(submissionToJob)
  const all = [...mockJobs, ...submitted].filter((item) => item.status === 'published')
  return rankByPromotion(all.filter((item) => matchKeyword([
    item.title,
    item.companyName,
    item.salaryRange,
    item.location,
    item.contact,
    item.requirement,
  ], keyword)))
}

export function listRentals(keyword = ''): RentalPost[] {
  const submitted = readSubmissions()
    .filter((item) => item.type === 'rental' && isPublicStatus(item.status))
    .map(submissionToRental)
  const all = [...mockRentals, ...submitted].filter((item) => item.status === 'published')
  return rankByPromotion(all.filter((item) => matchKeyword([
    item.title,
    item.rent,
    item.location,
    item.layout,
    item.contact,
    item.description,
  ], keyword)))
}

export function listOffers(keyword = ''): LocalOffer[] {
  const submitted = readSubmissions()
    .filter((item) => item.type === 'promotion' && isPublicStatus(item.status))
    .map(submissionToOffer)
  const now = Date.now()
  const all = [...mockOffers, ...submitted].filter((item) => {
    if (item.status !== 'published') return false
    const start = item.validFrom ? Date.parse(`${item.validFrom}T00:00:00+08:00`) : 0
    const end = item.validUntil ? Date.parse(`${item.validUntil}T23:59:59+08:00`) : 0
    return (!start || start <= now) && (!end || end >= now)
  })
  return all
    .filter((item) => matchKeyword([
      item.title,
      item.merchantName,
      item.summary,
      item.description,
      item.phone,
    ], keyword))
    .sort((first, second) => {
      if (first.displayOrder !== second.displayOrder) return first.displayOrder - second.displayOrder
      return second.updatedAt.localeCompare(first.updatedAt)
    })
}

function toCarouselItem(
  item: Merchant | JobPost | RentalPost | LocalOffer,
): HomeCarouselItem {
  if (item.type === 'merchant') {
    return {
      id: item.id,
      type: item.type,
      title: item.name,
      subtitle: `${item.category} · ${item.address}`,
      meta: item.phone,
      statusLabel: '商家',
      statusTone: 'green',
      image: item.images[0] || '',
    }
  }
  if (item.type === 'job') {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: `${item.companyName} · ${item.location}`,
      meta: item.salaryRange,
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
      subtitle: `${item.layout} · ${item.location}`,
      meta: item.rent,
      statusLabel: '出租',
      statusTone: 'olive',
      image: item.images[0] || '',
    }
  }
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: `${item.merchantName} · ${item.summary}`,
    meta: item.validUntil ? `有效至 ${item.validUntil}` : '活动时间请咨询商家',
    statusLabel: '优惠',
    statusTone: 'yellow',
    image: item.images[0] || '',
  }
}

export function listHomeData(): HomeData {
  const merchants = listMerchants()
  const jobs = listJobs()
  const rentals = listRentals()
  const offers = listOffers()
  const pendingCount = readSubmissions().filter((item) => item.status === 'pending').length
  const recommendations: HomeRecommendation[] = []
  const featuredMerchant = merchants.find((item) => item.isFeatured || item.isTop) || merchants[0]
  const latestJob = jobs[0]
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
  if (latestJob) {
    recommendations.push({
      id: latestJob.id,
      type: 'job',
      title: latestJob.title,
      subtitle: `${latestJob.companyName} · ${latestJob.location}`,
      meta: latestJob.salaryRange,
      statusLabel: '招聘',
      statusTone: 'orange',
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
    ...jobs.filter((item) => item.isFeatured || item.isTop).map(toCarouselItem),
    ...rentals.filter((item) => item.isFeatured || item.isTop).map(toCarouselItem),
    ...offers.map(toCarouselItem),
    ...recommendations.map((item): HomeCarouselItem => ({
      ...item,
      image: '',
    })),
  ].filter((item, index, items) => items.findIndex(
    (candidate) => candidate.type === item.type && candidate.id === item.id,
  ) === index).slice(0, 6)

  return {
    featuredMerchants: merchants.filter((item) => item.isFeatured || item.isTop).slice(0, 4),
    latestJobs: jobs.slice(0, 5),
    latestRentals: rentals.slice(0, 5),
    carouselItems,
    recommendations,
    serviceKeywords: SERVICE_KEYWORDS,
    pendingCount,
  }
}

export function searchEntries(keyword: string): SearchResult[] {
  const merchants = listMerchants('', keyword).map<SearchResult>((item) => ({
    id: item.id,
    type: 'merchant',
    title: item.name,
    subtitle: `${item.category} · ${item.address}`,
    phone: item.phone,
    tags: item.tags,
    board: getMerchantBoard(item.category) || 'store',
    boardLabel: ({ store: '店', service: '修', shopping: '购' } as const)[getMerchantBoard(item.category) || 'store'],
  }))
  const jobs = listJobs(keyword).map<SearchResult>((item) => ({
    id: item.id,
    type: 'job',
    title: item.title,
    subtitle: `${item.companyName} · ${item.salaryRange}`,
    phone: item.contact,
    tags: [item.location, item.headcount],
    board: 'store',
    boardLabel: '店',
  }))
  const rentals = listRentals(keyword).map<SearchResult>((item) => ({
    id: item.id,
    type: 'rental',
    title: item.title,
    subtitle: `${item.rent} · ${item.location}`,
    phone: item.contact,
    tags: [item.layout, item.area].filter(Boolean),
    board: 'rental',
    boardLabel: '房',
  }))
  const offers = listOffers(keyword).map<SearchResult>((item) => {
    const merchant = item.merchantId ? listMerchants().find((value) => value.id === item.merchantId) : null
    const board = merchant ? (getMerchantBoard(merchant.category) || 'store') : 'store'
    return {
      id: item.id,
      type: 'offer',
      title: item.title,
      subtitle: `${item.merchantName} · ${item.validUntil ? `有效至 ${item.validUntil}` : '优惠活动'}`,
      phone: item.phone,
      tags: ['优惠活动', item.merchantName].filter(Boolean),
      board,
      boardLabel: ({ store: '店', service: '修', shopping: '购' } as const)[board],
    }
  })
  return [...merchants, ...jobs, ...rentals, ...offers]
}

export function getDetail(type: EntryType, id: string): Merchant | JobPost | RentalPost | null {
  if (type === 'merchant') {
    return listMerchants().find((item) => item.id === id) || null
  }
  if (type === 'job') {
    return listJobs().find((item) => item.id === id) || null
  }
  return listRentals().find((item) => item.id === id) || null
}

export function getOfferDetail(id: string): LocalOffer | null {
  return listOffers().find((item) => item.id === id) || null
}

export function submitEntry(input: SubmitEntryInput): Submission {
  const createdAt = nowText()
  const item: Submission = {
    ...defaultPromotion,
    id: makeLocalId(input.type),
    type: input.type,
    title: input.title.trim(),
    category: input.category.trim(),
    contactName: input.contactName.trim(),
    phone: input.phone.trim(),
    wechat: input.wechat.trim(),
    location: input.location.trim(),
    content: input.content.trim(),
    images: input.images,
    merchantName: input.merchantName?.trim() || '',
    merchantId: input.merchantId?.trim() || '',
    validFrom: input.validFrom?.trim() || '',
    validUntil: input.validUntil?.trim() || '',
    status: 'pending',
    rejectReason: '',
    hasContacted: false,
    createdAt,
    updatedAt: createdAt,
  }
  const next = [item, ...readSubmissions()]
  writeSubmissions(next)
  return item
}

export function listRepairMerchants(filter = '全部', keyword = ''): Merchant[] {
  const repairKeywords = ['维修', '开锁', '家政', '疏通', '家电', '上门']
  const merchants = listMerchants('', keyword).filter((item) => matchKeyword([
    item.category,
    item.description,
    ...item.tags,
  ], '维修') || repairKeywords.some((repairKeyword) => matchKeyword([
    item.category,
    item.description,
    ...item.tags,
  ], repairKeyword)))

  if (!filter || filter === '全部') {
    return merchants
  }
  return merchants.filter((item) => matchKeyword([
    item.category,
    item.description,
    ...item.tags,
  ], filter))
}

export function submitFeedback(input: SubmitFeedbackInput): FeedbackSubmission {
  const createdAt = nowText()
  const item: FeedbackSubmission = {
    id: makeLocalId('feedback'),
    type: input.type,
    entryType: input.entryType,
    entryId: input.entryId,
    entryTitle: input.entryTitle.trim(),
    content: input.content.trim(),
    contact: input.contact.trim(),
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
  }
  writeFeedbacks([item, ...readFeedbacks()])
  return item
}

export function listFeedbacks(): FeedbackSubmission[] {
  return readFeedbacks().sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

export function adminUpdateFeedbackStatus(id: string, status: FeedbackStatus): FeedbackSubmission | null {
  const items = readFeedbacks()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) {
    return null
  }
  const updated: FeedbackSubmission = {
    ...items[index],
    status,
    updatedAt: nowText(),
  }
  items.splice(index, 1, updated)
  writeFeedbacks(items)
  return updated
}

export function listMySubmissions(): Submission[] {
  return readSubmissions().sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

export function listAdminSubmissions(): Submission[] {
  return listMySubmissions()
}

export function adminUpdateStatus(id: string, status: ReviewStatus, rejectReason = ''): Submission | null {
  return adminUpdateSubmission(id, { status, rejectReason })
}

export function adminUpdatePromotion(id: string, patch: AdminPatch): Submission | null {
  return adminUpdateSubmission(id, patch)
}

export function adminUpdateSubmission(id: string, patch: AdminPatch): Submission | null {
  const items = readSubmissions()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) {
    return null
  }
  const current = items[index]
  const updated: Submission = {
    ...current,
    ...patch,
    updatedAt: nowText(),
  }
  items.splice(index, 1, updated)
  writeSubmissions(items)
  return updated
}

export function getStatusLabel(status: ReviewStatus): string {
  return REVIEW_STATUS_LABELS[status]
}

export function getCustomerServiceText(): string {
  return CUSTOMER_SERVICE_TEXT
}
