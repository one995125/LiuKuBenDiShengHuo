/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    cloudState: {
      initialized: boolean
      environmentId: string
      error: string
    },
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  runCloudHealthCheck(): Promise<{
    ok: boolean
    publicApi: unknown
    userApi: unknown
    adminApi: unknown
    adminProtectionOk: boolean
  }>
}

/**
 * 当前项目锁定的 miniprogram-api-typings 版本早于隐私合同 API，
 * 在此补充运行时已支持的最小声明，后续升级官方类型包后可删除。
 */
declare namespace WechatMiniprogram {
  interface Wx {
    openPrivacyContract(options?: {
      success?: (result: GeneralCallbackResult) => void
      fail?: (error: GeneralCallbackResult) => void
      complete?: (result: GeneralCallbackResult) => void
    }): void
  }
}
