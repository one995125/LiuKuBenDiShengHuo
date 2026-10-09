Page({
  data: {},

  /** 协议正文为静态内容，页面加载时无需请求用户数据或云端接口。 */
  onLoad() {},

  /** 隐私处理细节以公众平台配置并由微信展示的保护指引为准。 */
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
})
