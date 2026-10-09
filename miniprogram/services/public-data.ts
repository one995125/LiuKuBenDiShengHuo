import { CLOUD_BASE_CONFIG } from '../constants/cloud-base'
import type {
  CustomerServiceConfig,
  EntryType,
  HomeData,
  JobPost,
  LocalOffer,
  Merchant,
  MerchantBoard,
  RentalPost,
  SearchResult,
} from '../types/local-life'
import { callCloudApi } from './cloud-base'
import {
  getDetail,
  getOfferDetail,
  listHomeData,
  listMerchantBoard,
  listMerchants,
  listRentals,
  searchEntries,
} from './local-life'

export type PublicDataSource = 'cloud' | 'cache' | 'local'

export interface PublicDataResult<T> {
  data: T
  source: PublicDataSource
  stale: boolean
  error: string
}

export interface PublicPage<T> {
  items: T[]
  nextCursor: string
  hasMore: boolean
}

interface CloudPageData<T> extends PublicPage<T> {
  serverTime: number
}

interface CloudDetailData<T> {
  item: T | null
  serverTime: number
}

interface CloudHomeData extends HomeData {
  serverTime: number
}

interface CachedValue<T> {
  cachedAt: number
  data: T
}

const CACHE_PREFIX = 'liuku_public_cache_v1'
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 20

const LOCAL_CUSTOMER_SERVICE: CustomerServiceConfig = {
  id: 'customer_service',
  phone: '',
  wechat: '',
  description: '客服用于信息纠错、投诉反馈和商家合作。',
  updatedAt: '',
}

/**
 * 读取首页公开信息。
 *
 * 当前开关关闭时直接使用本地数据。正式启用后按“云端 -> 最近缓存 -> 本地 mock”
 * 回退，确保网络或云函数异常不会让首页空白。
 */
export function loadPublicHomeData(): Promise<PublicDataResult<HomeData>> {
  const localLoader = () => listHomeData()
  return loadCloudOrFallback(
    'home',
    () => callCloudApi<CloudHomeData>('publicApi', 'home'),
    (cloudData) => stripServerTime(cloudData),
    localLoader,
  ).then((result) => ({
    ...result,
    data: normalizeHomeData(result.data),
  }))
}

export function loadMerchantPage(options: {
  board?: MerchantBoard
  category?: string
  subCategory?: string
  keyword?: string
  cursor?: string
  pageSize?: number
} = {}): Promise<PublicDataResult<PublicPage<Merchant>>> {
  const board = options.board || ''
  const category = options.category || ''
  const subCategory = options.subCategory || ''
  const keyword = options.keyword || ''
  const cursor = normalizeCursor(options.cursor)
  const pageSize = normalizePageSize(options.pageSize)
  const cacheKey = `merchant:${board}:${category}:${subCategory}:${keyword}:${cursor}:${pageSize}`

  return loadCloudOrFallback(
    cacheKey,
    () => callCloudApi<CloudPageData<Merchant>>('publicApi', 'list', {
      type: 'merchant',
      board,
      category,
      subCategory,
      keyword,
      cursor: String(cursor),
      pageSize,
    }),
    stripServerTime,
    () => paginateLocal(
      board
        ? listMerchantBoard(board, category, subCategory, keyword)
        : listMerchants(category, keyword),
      cursor,
      pageSize,
    ),
  )
}

export function loadJobPage(_options: {
  keyword?: string
  cursor?: string
  pageSize?: number
} = {}): Promise<PublicDataResult<PublicPage<JobPost>>> {
  // 招聘频道未取得所需资质前保持硬关闭，禁止云失败后回退本地 mock。
  return Promise.resolve({
    data: { items: [], nextCursor: '', hasMore: false },
    source: 'local',
    stale: false,
    error: '招聘频道暂未开放',
  })
}

export function loadRentalPage(options: {
  keyword?: string
  cursor?: string
  pageSize?: number
} = {}): Promise<PublicDataResult<PublicPage<RentalPost>>> {
  const keyword = options.keyword || ''
  const cursor = normalizeCursor(options.cursor)
  const pageSize = normalizePageSize(options.pageSize)
  const cacheKey = `rental:${keyword}:${cursor}:${pageSize}`

  return loadCloudOrFallback(
    cacheKey,
    () => callCloudApi<CloudPageData<RentalPost>>('publicApi', 'list', {
      type: 'rental',
      keyword,
      cursor: String(cursor),
      pageSize,
    }),
    stripServerTime,
    () => paginateLocal(listRentals(keyword), cursor, pageSize),
  )
}

export async function loadRepairPage(
  filter = '全部',
  keyword = '',
): Promise<PublicDataResult<PublicPage<Merchant>>> {
  const result = await loadMerchantPage({
    board: 'service',
    keyword,
    pageSize: MAX_PAGE_SIZE,
  })
  const items = filter && filter !== '全部'
    ? result.data.items.filter((item) => (
        item.category.includes(filter)
        || item.description.includes(filter)
        || item.tags.some((tag) => tag.includes(filter))
      ))
    : result.data.items

  return {
    ...result,
    data: {
      items,
      nextCursor: '',
      hasMore: false,
    },
  }
}

export function loadPublicDetail(
  type: EntryType,
  id: string,
): Promise<PublicDataResult<Merchant | JobPost | RentalPost | null>> {
  if (type === 'job') {
    return Promise.resolve({ data: null, source: 'local', stale: false, error: '招聘频道暂未开放' })
  }
  return loadCloudOrFallback(
    `detail:${type}:${id}`,
    () => callCloudApi<CloudDetailData<Merchant | JobPost | RentalPost>>('publicApi', 'detail', {
      type,
      id,
    }),
    (cloudData) => cloudData.item,
    () => getDetail(type, id),
  )
}

export function loadOfferDetail(
  id: string,
): Promise<PublicDataResult<LocalOffer | null>> {
  return loadCloudOrFallback(
    `detail:offer:${id}`,
    () => callCloudApi<CloudDetailData<LocalOffer>>('publicApi', 'detail', {
      type: 'offer',
      id,
    }),
    (cloudData) => cloudData.item,
    () => getOfferDetail(id),
  )
}

export function loadPublicSearch(
  keyword: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<PublicDataResult<SearchResult[]>> {
  const normalizedKeyword = keyword.trim()
  const normalizedPageSize = normalizePageSize(pageSize)
  return loadCloudOrFallback(
    `search:${normalizedKeyword}:${normalizedPageSize}`,
    () => callCloudApi<{ items: SearchResult[]; serverTime: number }>('publicApi', 'search', {
      keyword: normalizedKeyword,
      pageSize: normalizedPageSize,
    }),
    (cloudData) => cloudData.items,
    () => searchEntries(normalizedKeyword).slice(0, normalizedPageSize * 3),
  ).then((result) => ({
    ...result,
    data: result.data.filter((item) => item.type !== 'job'),
  }))
}

/**
 * 读取客服配置。
 *
 * 云数据开关关闭或调用失败时返回本地空配置，避免未配置号码时触发无效拨号。
 */
export function loadCustomerServiceConfig(): Promise<PublicDataResult<CustomerServiceConfig>> {
  return loadCloudOrFallback(
    'config:customer_service',
    () => callCloudApi<{
      item: CustomerServiceConfig
      serverTime: string
    }>('publicApi', 'config', { id: 'customer_service' }),
    (cloudData) => cloudData.item,
    () => LOCAL_CUSTOMER_SERVICE,
  )
}

async function loadCloudOrFallback<TCloud, TResult>(
  cacheKey: string,
  cloudLoader: () => Promise<{ ok: boolean; message: string; data?: TCloud }>,
  mapCloudData: (data: TCloud) => TResult,
  localLoader: () => TResult,
): Promise<PublicDataResult<TResult>> {
  if (!CLOUD_BASE_CONFIG.features.publicData) {
    return {
      data: localLoader(),
      source: 'local',
      stale: false,
      error: '',
    }
  }

  try {
    const response = await cloudLoader()
    if (!response.ok || typeof response.data === 'undefined') {
      throw new Error(response.message || '云端公开数据读取失败')
    }
    const data = mapCloudData(response.data)
    writeCache(cacheKey, data)
    return {
      data,
      source: 'cloud',
      stale: false,
      error: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '云端公开数据读取失败'
    const cached = readCache<TResult>(cacheKey)
    if (cached) {
      return {
        data: cached.data,
        source: 'cache',
        stale: true,
        error: message,
      }
    }
    return {
      data: localLoader(),
      source: 'local',
      stale: true,
      error: message,
    }
  }
}

function paginateLocal<T>(items: T[], cursor: number, pageSize: number): PublicPage<T> {
  const pageItems = items.slice(cursor, cursor + pageSize)
  const nextOffset = cursor + pageItems.length
  return {
    items: pageItems,
    nextCursor: nextOffset < items.length ? String(nextOffset) : '',
    hasMore: nextOffset < items.length,
  }
}

function normalizeCursor(cursor: string | undefined): number {
  const value = Number.parseInt(cursor || '0', 10)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize)) {
    return DEFAULT_PAGE_SIZE
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize as number)))
}

function stripServerTime<T extends { serverTime: number }>(data: T): Omit<T, 'serverTime'> {
  const { serverTime: _serverTime, ...value } = data
  return value
}

/**
 * 兼容旧版首页缓存。旧缓存只有 recommendations 时，在读取阶段转换为轮播数据，
 * 避免升级后要求用户手动清理小程序 storage。
 */
function normalizeHomeData(data: HomeData): HomeData {
  const carouselItems = Array.isArray(data.carouselItems) && data.carouselItems.length > 0
    ? data.carouselItems.filter((item) => item.type !== 'job')
    : (Array.isArray(data.recommendations) ? data.recommendations : []).map((item) => ({
        ...item,
        image: '',
      }))
  return {
    ...data,
    carouselItems: carouselItems.slice(0, 6),
    recommendations: Array.isArray(data.recommendations)
      ? data.recommendations.filter((item) => item.type !== 'job')
      : [],
    latestJobs: [],
  }
}

function readCache<T>(key: string): CachedValue<T> | null {
  try {
    const value = wx.getStorageSync(`${CACHE_PREFIX}:${key}`) as CachedValue<T> | undefined
    if (!value || typeof value.cachedAt !== 'number' || typeof value.data === 'undefined') {
      return null
    }
    return value
  } catch (error) {
    console.warn('读取公开数据缓存失败', error)
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    wx.setStorageSync(`${CACHE_PREFIX}:${key}`, {
      cachedAt: Date.now(),
      data,
    } satisfies CachedValue<T>)
  } catch (error) {
    // 缓存写入失败不影响本次云端数据展示。
    console.warn('写入公开数据缓存失败', error)
  }
}
