import type { ApiResponse } from '../types/admin'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

/**
 * 兼容 CloudBase Web SDK 在不同网关模式下的云函数响应结构。
 *
 * 常见结构包括 response.result、response.data.response_data，
 * 以及网关额外包裹的一层 result。最多解包 6 层，避免异常循环引用。
 */
export function normalizeCloudFunctionResponse<T>(response: unknown): ApiResponse<T> | null {
  let current: unknown = parseJson(response)

  for (let depth = 0; depth < 6; depth += 1) {
    current = parseJson(current)
    if (!isRecord(current)) return null

    if (typeof current.ok === 'boolean') {
      return current as unknown as ApiResponse<T>
    }

    if ('result' in current) {
      current = current.result
      continue
    }

    if ('response_data' in current) {
      current = current.response_data
      continue
    }

    if (isRecord(current.data)) {
      current = current.data
      continue
    }

    return null
  }

  return null
}

export function getCloudFunctionTransportError(response: unknown): string {
  if (!isRecord(response)) return ''
  const code = typeof response.code === 'string' || typeof response.code === 'number'
    ? String(response.code)
    : ''
  const message = typeof response.message === 'string'
    ? response.message
    : typeof response.msg === 'string'
      ? response.msg
      : ''
  return [code, message].filter(Boolean).join('：')
}
