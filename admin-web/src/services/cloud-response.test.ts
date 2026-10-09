import { describe, expect, it } from 'vitest'
import { normalizeCloudFunctionResponse } from './cloud-response'

const success = {
  ok: true,
  code: 'OK',
  message: '调用成功',
  data: { admin: { uid: 'u1' } },
  requestId: 'req-1',
}

describe('normalizeCloudFunctionResponse', () => {
  it('兼容 Web SDK 和网关的常见响应包装', () => {
    expect(normalizeCloudFunctionResponse({ result: success })).toEqual(success)
    expect(normalizeCloudFunctionResponse({ result: JSON.stringify(success) })).toEqual(success)
    expect(normalizeCloudFunctionResponse({ data: { response_data: success } })).toEqual(success)
    expect(normalizeCloudFunctionResponse({ result: { result: success } })).toEqual(success)
    expect(normalizeCloudFunctionResponse(success)).toEqual(success)
  })
})
