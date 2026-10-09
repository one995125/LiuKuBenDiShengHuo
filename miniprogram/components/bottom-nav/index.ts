import { openCustomerService } from '../../utils/customer-service'

const ROUTES: Record<string, string> = {
  home: '/pages/index/index',
  merchant: '/pages/merchant-list/index',
  mine: '/pages/mine/index',
}

Component({
  properties: {
    active: { type: String, value: '' },
  },

  methods: {
    onItemTap(event: WechatMiniprogram.BaseEvent) {
      const key = String(event.currentTarget.dataset.key || '')
      if (key === 'service') {
        openCustomerService()
        return
      }
      const route = ROUTES[key]
      if (route) {
        wx.reLaunch({ url: route })
      }
    },
  },
})
