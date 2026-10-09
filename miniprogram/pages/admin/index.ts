Page({
  data: {},

  /** 隐藏页只说明运营边界，不读取或展示历史用户投稿、资料和评论。 */
  onLoad() {},

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },
})
