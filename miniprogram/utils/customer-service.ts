import { CUSTOMER_SERVICE } from '../constants/local-life'
import { loadCustomerServiceConfig } from '../services/public-data'

/**
 * 打开统一客服操作菜单。
 * 正式配置电话号码或微信号后，所有页面和公共导航会自动获得相同能力。
 */
export async function openCustomerService(): Promise<void> {
  const result = await loadCustomerServiceConfig()
  const config = result.data || CUSTOMER_SERVICE
  const actions: Array<'phone' | 'wechat'> = []
  const itemList: string[] = []

  if (config.phone) {
    actions.push('phone')
    itemList.push('拨打客服电话')
  }
  if (config.wechat) {
    actions.push('wechat')
    itemList.push('复制客服微信')
  }

  if (itemList.length === 0) {
    wx.showModal({
      title: '联系客服',
      content: `${config.description}\n\n当前尚未配置客服电话和微信号。`,
      showCancel: false,
    })
    return
  }

  wx.showActionSheet({
    itemList,
    success: ({ tapIndex }) => {
      const action = actions[tapIndex]
      if (action === 'phone') {
        wx.makePhoneCall({ phoneNumber: config.phone })
      }
      if (action === 'wechat') {
        wx.setClipboardData({
          data: config.wechat,
          success: () => wx.showToast({ title: '已复制客服微信', icon: 'success' }),
        })
      }
    },
  })
}
