import {
  clearLocalFavorites,
  clearLocalHistory,
  listLocalFavorites,
  listLocalHistory,
  removeLocalFavorite,
  type LocalCollectionItem,
} from '../../services/local-collections'
import {
  getMyUserProfile,
  isUserOperationQueuedError,
  listPendingFeedbackOperations,
  retryPendingUserOperation,
  type PendingFeedbackOperation,
} from '../../services/user-data'
import type { PublicContentType, UserProfile } from '../../types/local-life'
import { openCustomerService } from '../../utils/customer-service'

type CollectionTab = 'favorites' | 'history'
type CollectionFilter = 'all' | PublicContentType

interface PendingFeedbackView {
  id: string
  title: string
  typeLabel: string
  updatedAt: string
  attempts: number
  lastError: string
}

interface CollectionFilterOption {
  value: CollectionFilter
  label: string
}

interface LocalCollectionView extends LocalCollectionItem {
  typeLabel: string
  symbol: string
  timeLabel: string
}

interface MinePageData {
  profile: UserProfile
  profileLoading: boolean
  profileError: string
  profileEditorVisible: boolean
  activeCollection: CollectionTab
  selectedType: CollectionFilter
  collectionFilters: CollectionFilterOption[]
  favoriteCount: number
  historyCount: number
  visibleItems: LocalCollectionView[]
  pendingFeedbacks: PendingFeedbackView[]
  pendingLoading: boolean
  pendingError: string
  retryingId: string
}

const EMPTY_PROFILE: UserProfile = {
  publicId: '',
  nickname: '',
  avatarFileId: '',
  avatarUrl: '',
  hasProfile: false,
  updatedAt: '',
}

const COLLECTION_FILTERS: CollectionFilterOption[] = [
  { value: 'all', label: '全部' },
  { value: 'merchant', label: '商家' },
  { value: 'rental', label: '租房' },
  { value: 'offer', label: '优惠' },
]

const TYPE_META: Partial<Record<PublicContentType, { label: string; symbol: string; route: string }>> = {
  merchant: { label: '商家', symbol: '店', route: '/pages/merchant-detail/index' },
  rental: { label: '租房', symbol: '房', route: '/pages/rental-detail/index' },
  offer: { label: '优惠', symbol: '惠', route: '/pages/offer-detail/index' },
}

function toPendingFeedbackView(item: PendingFeedbackOperation): PendingFeedbackView {
  return {
    id: item.id,
    title: item.input.entryTitle || '未关联具体信息',
    typeLabel: item.input.type === 'complaint' ? '投诉举报' : '信息纠错',
    updatedAt: item.updatedAt,
    attempts: item.attempts,
    lastError: item.lastError,
  }
}

function toCollectionView(item: LocalCollectionItem): LocalCollectionView {
  const meta = TYPE_META[item.type]
  if (!meta) throw new Error('当前频道未开放')
  return {
    ...item,
    typeLabel: meta.label,
    symbol: meta.symbol,
    timeLabel: formatLocalTime(item.savedAt),
  }
}

function formatLocalTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page<MinePageData, WechatMiniprogram.IAnyObject>({
  data: {
    profile: EMPTY_PROFILE,
    profileLoading: false,
    profileError: '',
    profileEditorVisible: false,
    activeCollection: 'favorites',
    selectedType: 'all',
    collectionFilters: COLLECTION_FILTERS,
    favoriteCount: 0,
    historyCount: 0,
    visibleItems: [],
    pendingFeedbacks: [],
    pendingLoading: false,
    pendingError: '',
    retryingId: '',
  },

  /** 每次进入“我的”页同步本机收藏、足迹以及当前账号的私密反馈草稿。 */
  onShow() {
    this.refreshLocalCollections()
    void this.loadProfile()
    void this.loadPendingFeedbacks()
  },

  /**
   * 头像昵称只从用户云函数读取；读取失败时保留当前页面已有资料并允许重试，
   * 不把网络错误误判成未完善，也不会自动创建空用户记录。
   */
  async loadProfile() {
    this.setData({ profileLoading: true, profileError: '' })
    try {
      const result = await getMyUserProfile()
      this.setData({
        profile: result.profile,
        profileLoading: false,
        profileError: result.error,
      })
    } catch (error) {
      this.setData({
        profileLoading: false,
        profileError: error instanceof Error ? error.message : '用户资料读取失败',
      })
    }
  },

  openProfileEditor() {
    if (this.data.profileLoading) return
    this.setData({ profileEditorVisible: true })
  },

  closeProfileEditor() {
    this.setData({ profileEditorVisible: false })
  },

  onProfileSaved(event: WechatMiniprogram.CustomEvent<{ profile: UserProfile }>) {
    this.setData({
      profile: event.detail.profile,
      profileError: '',
      profileEditorVisible: false,
    })
  },

  refreshLocalCollections() {
    // 旧版本可能留下招聘收藏与足迹；频道关闭后不再计数或展示。
    const favorites = listLocalFavorites().filter((item) => Boolean(TYPE_META[item.type]))
    const history = listLocalHistory().filter((item) => Boolean(TYPE_META[item.type]))
    const source = this.data.activeCollection === 'favorites' ? favorites : history
    const visibleItems = source
      .filter((item) => Boolean(TYPE_META[item.type]))
      .filter((item) => this.data.selectedType === 'all' || item.type === this.data.selectedType)
      .map(toCollectionView)
    this.setData({
      favoriteCount: favorites.length,
      historyCount: history.length,
      visibleItems,
    })
  },

  switchCollection(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value || '') as CollectionTab
    if (value !== 'favorites' && value !== 'history') return
    this.setData({ activeCollection: value }, () => this.refreshLocalCollections())
  },

  selectCollectionType(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value || 'all') as CollectionFilter
    if (!COLLECTION_FILTERS.some((item) => item.value === value)) return
    this.setData({ selectedType: value }, () => this.refreshLocalCollections())
  },

  openCollectionItem(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { type: PublicContentType; id: string }
    const meta = TYPE_META[dataset.type]
    if (!meta || !dataset.id) return
    wx.navigateTo({ url: `${meta.route}?id=${encodeURIComponent(dataset.id)}` })
  },

  removeFavorite(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { type: PublicContentType; id: string }
    try {
      removeLocalFavorite(dataset.type, dataset.id)
      this.refreshLocalCollections()
      wx.showToast({ title: '已移除收藏', icon: 'success' })
    } catch (error) {
      console.error('移除本机收藏失败', error)
      wx.showToast({ title: '移除失败，请稍后重试', icon: 'none' })
    }
  },

  clearCurrentCollection() {
    const isFavorites = this.data.activeCollection === 'favorites'
    const count = isFavorites ? this.data.favoriteCount : this.data.historyCount
    if (count === 0) return
    wx.showModal({
      title: isFavorites ? '清空全部收藏？' : '清空浏览足迹？',
      content: isFavorites
        ? '清空后无法恢复，但不会影响公开信息。'
        : '足迹只保存在当前设备，清空后无法恢复。',
      confirmText: '确认清空',
      confirmColor: '#b45f33',
      success: (result) => {
        if (!result.confirm) return
        try {
          if (isFavorites) clearLocalFavorites()
          else clearLocalHistory()
          this.refreshLocalCollections()
          wx.showToast({ title: '已清空', icon: 'success' })
        } catch (error) {
          console.error('清空本机记录失败', error)
          wx.showToast({ title: '清空失败，请稍后重试', icon: 'none' })
        }
      },
    })
  },

  async loadPendingFeedbacks() {
    this.setData({ pendingLoading: true, pendingError: '' })
    const result = await listPendingFeedbackOperations()
    this.setData({
      pendingFeedbacks: result.items.map(toPendingFeedbackView),
      pendingLoading: false,
      pendingError: result.error,
    })
  },

  async retryPendingFeedback(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id || this.data.retryingId) return

    this.setData({ retryingId: id })
    try {
      const result = await retryPendingUserOperation(id)
      if (result.kind !== 'feedback') throw new Error('该草稿不是纠错或投诉反馈')
      wx.showToast({ title: '反馈已重新提交', icon: 'success' })
      await this.loadPendingFeedbacks()
    } catch (error) {
      const message = isUserOperationQueuedError(error)
        ? '仍未提交成功，反馈草稿已保留'
        : error instanceof Error ? error.message : '重试失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ retryingId: '' })
    }
  },

  contactService() {
    openCustomerService()
  },

  openFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' })
  },

  openMySubmissions() {
    wx.navigateTo({ url: '/pages/my-submissions/index' })
  },

  openUserAgreement() {
    wx.navigateTo({ url: '/pages/user-agreement/index' })
  },

  openPrivacyPolicy() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前微信版本暂不支持查看', icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail: (error) => {
        console.warn('打开用户隐私保护指引失败', error)
        wx.showToast({ title: '隐私指引暂时无法打开', icon: 'none' })
      },
    })
  },

  onHeaderBack() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  /** 隐藏入口仅供运营者调试；公开信息发布统一在独立运营后台完成。 */
  openAdminByLongPress() {
    wx.navigateTo({ url: '/pages/admin/index' })
  },
})
