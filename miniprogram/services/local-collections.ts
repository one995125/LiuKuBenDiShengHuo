import type {
  JobPost,
  LocalOffer,
  Merchant,
  PublicContentType,
  RentalPost,
} from '../types/local-life'

/**
 * 收藏与浏览足迹只保存在当前设备，不上传云端，也不关联 openid。
 * 使用独立版本号，后续字段升级时可以安全兼容旧缓存。
 */
const FAVORITES_STORAGE_KEY = 'liuku_public_favorites_v1'
const HISTORY_STORAGE_KEY = 'liuku_public_history_v1'
const MAX_HISTORY_COUNT = 50

export type CollectablePublicEntry = Merchant | JobPost | RentalPost | LocalOffer

export interface LocalCollectionItem {
  key: string
  type: PublicContentType
  id: string
  title: string
  subtitle: string
  image: string
  contentUpdatedAt: string
  savedAt: number
}

/** 读取收藏，异常或旧格式损坏时返回空数组，避免阻断公开信息浏览。 */
export function listLocalFavorites(): LocalCollectionItem[] {
  return readItems(FAVORITES_STORAGE_KEY)
}

/** 读取最近浏览记录，顺序为最近浏览优先。 */
export function listLocalHistory(): LocalCollectionItem[] {
  return readItems(HISTORY_STORAGE_KEY).slice(0, MAX_HISTORY_COUNT)
}

export function isLocalFavorite(type: PublicContentType, id: string): boolean {
  const key = createItemKey(type, id)
  return listLocalFavorites().some((item) => item.key === key)
}

/**
 * 切换收藏状态。
 * @returns true 表示切换后已收藏，false 表示切换后未收藏。
 * @throws 本地存储空间不足等错误交给页面提示用户。
 */
export function toggleLocalFavorite(entry: CollectablePublicEntry): boolean {
  const item = createCollectionItem(entry)
  const current = listLocalFavorites()
  const exists = current.some((saved) => saved.key === item.key)
  const next = exists
    ? current.filter((saved) => saved.key !== item.key)
    : [item, ...current.filter((saved) => saved.key !== item.key)]
  wx.setStorageSync(FAVORITES_STORAGE_KEY, next)
  return !exists
}

export function removeLocalFavorite(type: PublicContentType, id: string): void {
  const key = createItemKey(type, id)
  const next = listLocalFavorites().filter((item) => item.key !== key)
  wx.setStorageSync(FAVORITES_STORAGE_KEY, next)
}

export function clearLocalFavorites(): void {
  wx.removeStorageSync(FAVORITES_STORAGE_KEY)
}

/**
 * 有效详情加载完成后记录足迹；同一内容按 type + id 去重，最多保留 50 条。
 * 写入失败只记录日志，不影响用户继续查看详情。
 */
export function recordLocalHistory(entry: CollectablePublicEntry): void {
  try {
    const item = createCollectionItem(entry)
    const next = [
      item,
      ...listLocalHistory().filter((saved) => saved.key !== item.key),
    ].slice(0, MAX_HISTORY_COUNT)
    wx.setStorageSync(HISTORY_STORAGE_KEY, next)
  } catch (error) {
    console.warn('记录本机浏览足迹失败', error)
  }
}

export function clearLocalHistory(): void {
  wx.removeStorageSync(HISTORY_STORAGE_KEY)
}

function createCollectionItem(entry: CollectablePublicEntry): LocalCollectionItem {
  const view = getEntryView(entry)
  return {
    key: createItemKey(entry.type, entry.id),
    type: entry.type,
    id: entry.id,
    title: view.title,
    subtitle: view.subtitle,
    image: view.image,
    contentUpdatedAt: entry.updatedAt || '',
    savedAt: Date.now(),
  }
}

function getEntryView(entry: CollectablePublicEntry): {
  title: string
  subtitle: string
  image: string
} {
  if (entry.type === 'merchant') {
    return {
      title: entry.name,
      subtitle: [entry.category, entry.area].filter(Boolean).join(' · '),
      image: entry.images[0] || '',
    }
  }
  if (entry.type === 'job') {
    return {
      title: entry.title,
      subtitle: [entry.companyName, entry.salaryRange].filter(Boolean).join(' · '),
      image: '',
    }
  }
  if (entry.type === 'rental') {
    return {
      title: entry.title,
      subtitle: [entry.rent, entry.location].filter(Boolean).join(' · '),
      image: entry.images[0] || '',
    }
  }
  return {
    title: entry.title,
    subtitle: [entry.merchantName, entry.summary].filter(Boolean).join(' · '),
    image: entry.images[0] || '',
  }
}

function createItemKey(type: PublicContentType, id: string): string {
  return `${type}:${id}`
}

function readItems(storageKey: string): LocalCollectionItem[] {
  try {
    const value = wx.getStorageSync(storageKey) as unknown
    if (!Array.isArray(value)) return []
    return value.filter(isCollectionItem)
  } catch (error) {
    console.warn(`读取本机收藏数据失败：${storageKey}`, error)
    return []
  }
}

function isCollectionItem(value: unknown): value is LocalCollectionItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LocalCollectionItem>
  return (
    typeof item.key === 'string'
    && isPublicContentType(item.type)
    && typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.subtitle === 'string'
    && typeof item.image === 'string'
    && typeof item.contentUpdatedAt === 'string'
    && typeof item.savedAt === 'number'
  )
}

function isPublicContentType(value: unknown): value is PublicContentType {
  return value === 'merchant' || value === 'job' || value === 'rental' || value === 'offer'
}
