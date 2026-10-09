Component({
  properties: {
    title: { type: String, value: '六库生活圈' },
    subtitle: { type: String, value: '' },
    badge: { type: String, value: '' },
    back: { type: Boolean, value: false },
    // 业务页需要在当前页内切换步骤时，可接管返回事件，避免直接离开页面。
    interceptBack: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    navigationHeight: 44,
    navigationTopGap: 8,
    menuRightInset: 96,
  },

  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo()
      const menuButton = wx.getMenuButtonBoundingClientRect()
      const menuTopGap = Math.max(4, menuButton.top - windowInfo.statusBarHeight)
      const navigationTopGap = menuTopGap + 6
      const navigationHeight = Math.max(40, menuButton.height + 8)
      // 右侧徽标必须避开微信胶囊，不能使用固定 rpx，否则不同机型会发生重叠。
      const menuRightInset = Math.max(88, windowInfo.windowWidth - menuButton.left + 8)
      this.setData({
        statusBarHeight: windowInfo.statusBarHeight,
        navigationHeight,
        navigationTopGap,
        menuRightInset,
      })
    },
  },

  methods: {
    goBack() {
      if (this.data.interceptBack) {
        this.triggerEvent('back')
        return
      }

      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
        return
      }
      wx.reLaunch({ url: '/pages/index/index' })
    },
  },
})
