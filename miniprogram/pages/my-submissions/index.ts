import {
  isUserOperationQueuedError,
  listUserSubmissions,
  retryPendingUserOperation,
  type PendingSubmissionOperation,
  type UserDataSource,
} from '../../services/user-data'
import type { Submission } from '../../types/local-life'

interface SubmissionView {
  id: string
  type: 'merchant' | 'rental'
  typeLabel: string
  title: string
  status: string
  statusLabel: string
  rejectReason: string
  updatedAt: string
  publishedEntryId: string
}

interface PendingView {
  id: string
  typeLabel: string
  title: string
  updatedAt: string
  attempts: number
  lastError: string
}

interface MySubmissionsData {
  items: SubmissionView[]
  pending: PendingView[]
  loading: boolean
  error: string
  source: UserDataSource
  retryingId: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待人工审核',
  published: '已通过并公示',
  rejected: '已拒绝',
  offline: '已下架',
  expired: '已过期',
  draft: '草稿',
}

function toView(item: Submission): SubmissionView | null {
  if (item.type !== 'merchant' && item.type !== 'rental') return null
  return {
    id: item.id,
    type: item.type,
    typeLabel: item.type === 'merchant' ? '商家' : '房源',
    title: item.title,
    status: item.status,
    statusLabel: STATUS_LABELS[item.status] || item.status,
    rejectReason: item.rejectReason || '',
    updatedAt: item.updatedAt,
    publishedEntryId: item.publishedEntryId || '',
  }
}

Page<MySubmissionsData, WechatMiniprogram.IAnyObject>({
  data: {
    items: [], pending: [], loading: false, error: '', source: 'unavailable', retryingId: '',
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    const result = await listUserSubmissions()
    const pending = result.pendingOperations
      .filter((item): item is PendingSubmissionOperation => item.kind === 'submission')
      .filter((item) => item.input.type === 'merchant' || item.input.type === 'rental')
      .map((item) => ({
        id: item.id,
        typeLabel: item.input.type === 'merchant' ? '商家' : '房源',
        title: item.input.title,
        updatedAt: item.updatedAt,
        attempts: item.attempts,
        lastError: item.lastError,
      }))
    this.setData({
      items: result.items.map(toView).filter((item): item is SubmissionView => Boolean(item)),
      pending,
      loading: false,
      error: result.error,
      source: result.source,
    })
  },

  async retry(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id || this.data.retryingId) return
    this.setData({ retryingId: id })
    try {
      await retryPendingUserOperation(id)
      wx.showToast({ title: '投稿已重新提交', icon: 'success' })
      await this.load()
    } catch (error) {
      const message = isUserOperationQueuedError(error)
        ? '仍未提交成功，草稿已保留'
        : error instanceof Error ? error.message : '重试失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ retryingId: '' })
    }
  },

  openPublished(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { type: string; id: string }
    if (!dataset.id) return
    const route = dataset.type === 'merchant' ? '/pages/merchant-detail/index' : '/pages/rental-detail/index'
    wx.navigateTo({ url: `${route}?id=${encodeURIComponent(dataset.id)}` })
  },
})
