import { CLOUD_BASE_CONFIG } from '../constants/cloud-base'

export interface CloudInitState {
  initialized: boolean
  environmentId: string
  error: string
}

export interface CloudApiResponse<T = Record<string, unknown>> {
  ok: boolean
  code: string
  message: string
  data?: T
  debug?: string
}

export interface CloudHealthData {
  service: string
  version: string
  authenticated: boolean
  identity: string
  serverTime: number
}

export interface CloudIdentityData extends CloudHealthData {
  /** 仅返回当前调用者自己的 openid，供阶段 2 身份和管理员白名单验收。 */
  openid: string
  appid: string
}

export interface CloudHealthSummary {
  ok: boolean
  publicApi: CloudApiResponse<CloudHealthData>
  userApi: CloudApiResponse<CloudIdentityData>
  adminApi: CloudApiResponse<CloudHealthData>
  adminProtectionOk: boolean
}

type CloudFunctionKey = keyof typeof CLOUD_BASE_CONFIG.functionNames

/**
 * 初始化微信云开发环境。
 *
 * 调用时机：App.onLaunch 最先执行。
 * 失败策略：只记录状态，不中断现有本地 mock、storage、投稿和审核功能。
 */
export function initCloudBase(): CloudInitState {
  if (!wx.cloud) {
    const error = '当前基础库不支持 wx.cloud'
    console.warn(error)
    return {
      initialized: false,
      environmentId: CLOUD_BASE_CONFIG.environmentId,
      error,
    }
  }

  try {
    wx.cloud.init({
      env: CLOUD_BASE_CONFIG.environmentId,
      traceUser: CLOUD_BASE_CONFIG.traceUser,
    })
    return {
      initialized: true,
      environmentId: CLOUD_BASE_CONFIG.environmentId,
      error: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CloudBase 初始化失败'
    console.warn('CloudBase 初始化失败，继续使用本地模式', error)
    return {
      initialized: false,
      environmentId: CLOUD_BASE_CONFIG.environmentId,
      error: message,
    }
  }
}

/**
 * 调用阶段 2 的统一云函数入口。
 *
 * 参数：
 * - functionKey：配置中的 publicApi、userApi 或 adminApi。
 * - action：云函数动作，阶段 2 只开放健康检查和身份检查。
 * - payload：预留业务参数，当前不会用于写数据库。
 */
export async function callCloudApi<T>(
  functionKey: CloudFunctionKey,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<CloudApiResponse<T>> {
  if (!wx.cloud) {
    throw new Error('当前环境不支持 wx.cloud')
  }

  const result = await wx.cloud.callFunction({
    name: CLOUD_BASE_CONFIG.functionNames[functionKey],
    data: {
      action,
      payload,
    },
    config: {
      env: CLOUD_BASE_CONFIG.environmentId,
    },
  })

  if (!result.result || typeof result.result !== 'object') {
    throw new Error(`${CLOUD_BASE_CONFIG.functionNames[functionKey]} 返回格式无效`)
  }

  return result.result as unknown as CloudApiResponse<T>
}

/**
 * 手动执行阶段 2 健康检查。
 *
 * 验收内容：
 * - public/user/admin 三个函数均已部署且可调用。
 * - user 函数能够从可信微信上下文识别当前用户。
 * - adminHealth 对未加入 liuku_admins 的用户必须拒绝。
 */
export async function runCloudStage2HealthCheck(): Promise<CloudHealthSummary> {
  const [publicApi, userApi, adminApi, adminAccess] = await Promise.all([
    callCloudApi<CloudHealthData>('publicApi', 'health'),
    callCloudApi<CloudIdentityData>('userApi', 'identity'),
    callCloudApi<CloudHealthData>('adminApi', 'health'),
    callCloudApi<CloudHealthData>('adminApi', 'adminHealth'),
  ])

  const adminProtectionOk = adminAccess.ok || adminAccess.code === 'ADMIN_FORBIDDEN'

  return {
    ok: publicApi.ok && userApi.ok && adminApi.ok && adminProtectionOk,
    publicApi,
    userApi,
    adminApi,
    adminProtectionOk,
  }
}
