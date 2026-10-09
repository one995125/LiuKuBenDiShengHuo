import { loadPublicDetail } from '../../services/public-data'
import {
  isLocalFavorite,
  recordLocalHistory,
  toggleLocalFavorite,
} from '../../services/local-collections'
import type { RentalPost } from '../../types/local-life'

interface RentalDetailData {
  rental: RentalPost | null
  loading: boolean
  loadError: string
  isFavorite: boolean
}

Page<RentalDetailData, WechatMiniprogram.IAnyObject>({
  data: {
    rental: null,
    loading: true,
    loadError: '',
    isFavorite: false,
  },

  /** 根据 id 读取房源详情；首版不提供预约和中介撮合。 */
  async onLoad(query: Record<string, string | undefined>) {
    if (!query.id) {
      this.setData({ loading: false })
      return
    }
    const result = await loadPublicDetail('rental', query.id)
    const detail = result.data
    const rental = detail && detail.type === 'rental' ? detail : null
    if (rental) recordLocalHistory(rental)
    this.setData({
      rental,
      loading: false,
      loadError: result.error,
      isFavorite: rental ? isLocalFavorite('rental', rental.id) : false,
    })
  },

  onShow() {
    const rental = this.data.rental
    if (rental) this.setData({ isFavorite: isLocalFavorite('rental', rental.id) })
  },

  toggleFavorite() {
    const rental = this.data.rental
    if (!rental) return
    try {
      const isFavorite = toggleLocalFavorite(rental)
      this.setData({ isFavorite })
      wx.showToast({ title: isFavorite ? '已收藏' : '已取消收藏', icon: 'success' })
    } catch (error) {
      console.error('保存租房收藏失败', error)
      wx.showToast({ title: '收藏保存失败，请稍后重试', icon: 'none' })
    }
  },

  callPhone() {
    const rental = this.data.rental
    if (!rental) return
    wx.makePhoneCall({ phoneNumber: rental.contact })
  },

  copyContact() {
    const rental = this.data.rental
    if (!rental) return
    wx.setClipboardData({
      data: rental.contact,
      success: () => wx.showToast({ title: '已复制联系方式', icon: 'success' }),
    })
  },

  reportIssue() {
    const rental = this.data.rental
    if (!rental) return
    wx.navigateTo({
      url: `/pages/feedback/index?entryType=rental&entryId=${rental.id}&entryTitle=${encodeURIComponent(rental.title)}`,
    })
  },
})
