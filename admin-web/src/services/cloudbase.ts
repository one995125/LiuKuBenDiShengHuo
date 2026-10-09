import cloudbase from '@cloudbase/js-sdk'
import type { ApiResponse } from '../types/admin'
import {
  getCloudFunctionTransportError,
  normalizeCloudFunctionResponse,
} from './cloud-response'
import { mockAdminApi } from './mock-admin'

const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-d6glqc7e7244211f2'
const clientId = import.meta.env.VITE_CLOUDBASE_CLIENT_ID || undefined
const mockMode = import.meta.env.VITE_USE_MOCK_API === 'true'
let mockSignedIn = true

export const cloudbaseApp = cloudbase.init({
  env: environmentId,
  ...(clientId ? { clientId } : {}),
})

export const cloudbaseAuth = cloudbaseApp.auth()

export async function signIn(username: string, password: string) {
  if (mockMode) {
    if (!username.trim() || !password) throw new Error('请输入用户名和密码')
    mockSignedIn = true
    return { user: { uid: 'mock-super-admin' } }
  }
  const result = await cloudbaseAuth.signInWithPassword({ username, password })
  if (result.error) {
    throw new Error(result.error.message || '登录失败')
  }
  return result.data
}

export async function signOut() {
  if (mockMode) {
    mockSignedIn = false
    return
  }
  await cloudbaseAuth.signOut()
}

export async function hasSession(): Promise<boolean> {
  if (mockMode) return mockSignedIn
  const result = await cloudbaseAuth.getSession()
  return !result.error && Boolean(result.data.session)
}

export async function callAdminApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (mockMode) return mockAdminApi<T>(action, payload)
  const requestId = `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const response = await cloudbaseApp.callFunction({
    name: 'liuku-admin-api',
    data: { action, payload, requestId },
    parse: true,
  })
  const apiResult = normalizeCloudFunctionResponse<T>(response)
  if (!apiResult || apiResult.ok !== true) {
    const transportError = getCloudFunctionTransportError(response)
    const error = new Error(
      apiResult?.message
      || (transportError ? `云函数调用失败（${transportError}）` : '云函数响应格式异常，请刷新后重试'),
    )
    const code = apiResult?.code || 'CALL_FUNCTION_FAILED'
    Object.assign(error, {
      code,
      requestId: apiResult?.requestId || response.requestId || requestId,
    })
    if (code === 'UNAUTHENTICATED' || code === 'ADMIN_FORBIDDEN') {
      await cloudbaseAuth.signOut().catch(() => undefined)
      window.dispatchEvent(new CustomEvent('liuku-auth-invalid', {
        detail: { code, message: error.message },
      }))
    }
    throw error
  }
  return apiResult.data
}

export async function uploadImportImage(cloudPath: string, file: Blob): Promise<string> {
  if (mockMode) {
    return `cloud://mock-environment/${cloudPath}?size=${file.size}`
  }
  const result = await cloudbaseApp.uploadFile({
    cloudPath,
    fileContent: file,
  })
  if (!result.fileID) throw new Error('图片上传失败')
  return result.fileID
}

/** 核验材料使用临时 HTTPS 地址预览，原始 cloud fileID 不写入页面日志。 */
export async function getPrivateFileUrls(fileIds: string[]): Promise<Record<string, string>> {
  if (fileIds.length === 0) return {}
  if (mockMode) return Object.fromEntries(fileIds.map((fileId) => [fileId, fileId]))
  const result = await cloudbaseApp.getTempFileURL({ fileList: fileIds })
  return (result.fileList || []).reduce<Record<string, string>>((urls, item) => {
    if (item.fileID && item.tempFileURL) urls[item.fileID] = item.tempFileURL
    return urls
  }, {})
}

export const cloudbaseEnvironmentId = environmentId
export const isMockMode = mockMode
