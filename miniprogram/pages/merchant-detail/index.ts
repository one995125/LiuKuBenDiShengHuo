import { loadPublicDetail } from '../../services/public-data'
import {
  isLocalFavorite,
  recordLocalHistory,
  toggleLocalFavorite,
} from '../../services/local-collections'
import type { Merchant } from '../../types/local-life'
import { callMerchantPhone, getMerchantPhones } from '../../utils/merchant-phone'

interface MerchantDetailData {
  merchant: Merchant | null
  phoneList: string[]
  loading: boolean
  loadError: string
  isFavorite: boolean
}

Page<MerchantDetailData, WechatMiniprogram.IAnyObject>({
  data: {
    merchant: null,
    phoneList: [],
    loading: true,
    loadError: '',
    isFavorite: false,
  },

  /** 根据列表传入的 id 读取商家详情；找不到时展示空状态。 */
  async onLoad(query: Record<string, string | undefined>) {
    if (!query.id) {
      this.setData({ loading: false })
      return
    }
    const result = await loadPublicDetail('merchant', query.id)
    const detail = result.data
    const merchant = detail && detail.type === 'merchant' ? detail : null
    if (merchant) recordLocalHistory(merchant)
    this.setData({
      merchant,
      phoneList: merchant ? getMerchantPhones(merchant) : [],
      loading: false,
      loadError: result.error,
      isFavorite: merchant ? isLocalFavorite('merchant', merchant.id) : false,
    })
  },

  /** 从“我的”页返回详情时同步最新收藏状态。 */
  onShow() {
    const merchant = this.data.merchant
    if (merchant) this.setData({ isFavorite: isLocalFavorite('merchant', merchant.id) })
  },

  toggleFavorite() {
    const merchant = this.data.merchant
    if (!merchant) return
    try {
      const isFavorite = toggleLocalFavorite(merchant)
      this.setData({ isFavorite })
      wx.showToast({ title: isFavorite ? '已收藏' : '已取消收藏', icon: 'success' })
    } catch (error) {
      console.error('保存商家收藏失败', error)
      wx.showToast({ title: '收藏保存失败，请稍后重试', icon: 'none' })
    }
  },

  callPhone() {
    const merchant = this.data.merchant
    if (!merchant) {
      return
    }
    callMerchantPhone(merchant)
  },

  copyWechat() {
    const merchant = this.data.merchant
    if (!merchant || !merchant.wechat) {
      wx.showToast({ title: '暂无微信号', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: merchant.wechat,
      success: () => {
        wx.showToast({ title: '已复制微信号', icon: 'success' })
      },
    })
  },

  reportIssue() {
    const merchant = this.data.merchant
    if (!merchant) return
    wx.navigateTo({
      url: `/pages/feedback/index?entryType=merchant&entryId=${merchant.id}&entryTitle=${encodeURIComponent(merchant.name)}`,
    })
  },

})
