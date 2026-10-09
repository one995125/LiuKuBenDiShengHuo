import { loadPublicDetail } from '../../services/public-data'
import {
  isLocalFavorite,
  recordLocalHistory,
  toggleLocalFavorite,
} from '../../services/local-collections'
import type { JobPost } from '../../types/local-life'

interface JobDetailData {
  job: JobPost | null
  loading: boolean
  loadError: string
  isFavorite: boolean
}

Page<JobDetailData, WechatMiniprogram.IAnyObject>({
  data: {
    job: null,
    loading: true,
    loadError: '',
    isFavorite: false,
  },

  /** 根据 id 读取招聘详情；首版只展示联系方式，不提供简历投递。 */
  async onLoad(query: Record<string, string | undefined>) {
    if (!query.id) {
      this.setData({ loading: false })
      return
    }
    const result = await loadPublicDetail('job', query.id)
    const detail = result.data
    const job = detail && detail.type === 'job' ? detail : null
    if (job) recordLocalHistory(job)
    this.setData({
      job,
      loading: false,
      loadError: result.error,
      isFavorite: job ? isLocalFavorite('job', job.id) : false,
    })
  },

  onShow() {
    const job = this.data.job
    if (job) this.setData({ isFavorite: isLocalFavorite('job', job.id) })
  },

  toggleFavorite() {
    const job = this.data.job
    if (!job) return
    try {
      const isFavorite = toggleLocalFavorite(job)
      this.setData({ isFavorite })
      wx.showToast({ title: isFavorite ? '已收藏' : '已取消收藏', icon: 'success' })
    } catch (error) {
      console.error('保存招聘收藏失败', error)
      wx.showToast({ title: '收藏保存失败，请稍后重试', icon: 'none' })
    }
  },

  callPhone() {
    const job = this.data.job
    if (!job) return
    wx.makePhoneCall({ phoneNumber: job.contact })
  },

  copyContact() {
    const job = this.data.job
    if (!job) return
    wx.setClipboardData({
      data: job.contact,
      success: () => wx.showToast({ title: '已复制联系方式', icon: 'success' }),
    })
  },

  reportIssue() {
    const job = this.data.job
    if (!job) return
    wx.navigateTo({
      url: `/pages/feedback/index?entryType=job&entryId=${job.id}&entryTitle=${encodeURIComponent(job.title)}`,
    })
  },
})
