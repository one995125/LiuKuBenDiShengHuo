import { loadOfferDetail } from '../../services/public-data'
import {
  isLocalFavorite,
  recordLocalHistory,
  toggleLocalFavorite,
} from '../../services/local-collections'
import type { LocalOffer } from '../../types/local-life'

interface OfferDetailData {
  offer: LocalOffer | null
  loading: boolean
  loadError: string
  isFavorite: boolean
}

Page<OfferDetailData, WechatMiniprogram.IAnyObject>({
  data: {
    offer: null,
    loading: true,
    loadError: '',
    isFavorite: false,
  },

  /** 优惠活动只做信息展示，所有使用条件以用户联系商家核实为准。 */
  async onLoad(query: Record<string, string | undefined>) {
    if (!query.id) {
      this.setData({ loading: false })
      return
    }
    const result = await loadOfferDetail(query.id)
    const offer = result.data
    if (offer) recordLocalHistory(offer)
    this.setData({
      offer,
      loading: false,
      loadError: result.error,
      isFavorite: offer ? isLocalFavorite('offer', offer.id) : false,
    })
  },

  onShow() {
    const offer = this.data.offer
    if (offer) this.setData({ isFavorite: isLocalFavorite('offer', offer.id) })
  },

  toggleFavorite() {
    const offer = this.data.offer
    if (!offer) return
    try {
      const isFavorite = toggleLocalFavorite(offer)
      this.setData({ isFavorite })
      wx.showToast({ title: isFavorite ? '已收藏' : '已取消收藏', icon: 'success' })
    } catch (error) {
      console.error('保存优惠收藏失败', error)
      wx.showToast({ title: '收藏保存失败，请稍后重试', icon: 'none' })
    }
  },

  callPhone() {
    const phone = this.data.offer?.phone
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  copyWechat() {
    const wechat = this.data.offer?.wechat
    if (!wechat) {
      wx.showToast({ title: '暂无微信号', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: wechat,
      success: () => wx.showToast({ title: '已复制微信号', icon: 'success' }),
    })
  },

  openMerchant() {
    const merchantId = this.data.offer?.merchantId
    if (!merchantId) {
      wx.showToast({ title: '该活动暂未关联商家详情', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/merchant-detail/index?id=${merchantId}` })
  },

  reportIssue() {
    const offer = this.data.offer
    if (!offer) return
    wx.navigateTo({
      url: `/pages/feedback/index?entryType=offer&entryId=${offer.id}&entryTitle=${encodeURIComponent(offer.title)}`,
    })
  },
})
