import {
  initCloudBase,
  runCloudStage2HealthCheck,
  type CloudHealthSummary,
} from './services/cloud-base'

/**
 * 小程序入口。
 * 阶段 2 只初始化 CloudBase 基础设施，不切换任何页面的数据来源。
 */
App<IAppOption>({
  globalData: {
    cloudState: {
      initialized: false,
      environmentId: '',
      error: '',
    },
  },

  onLaunch() {
    this.globalData.cloudState = initCloudBase()
    console.log('六库生活圈本地 MVP 启动，CloudBase 基础设施已配置')
  },

  /**
   * 阶段 2 手动验收入口。
   * 调用方式：微信开发者工具 Console 执行 getApp().runCloudHealthCheck()。
   * 注意：不会在每次启动时自动调用，避免产生无意义的云函数调用次数。
   */
  runCloudHealthCheck(): Promise<CloudHealthSummary> {
    return runCloudStage2HealthCheck().then((summary) => {
      console.info('CloudBase 阶段 2 健康检查结果', summary)
      return summary
    })
  },
})
