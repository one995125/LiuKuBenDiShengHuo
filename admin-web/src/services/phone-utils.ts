export const MAX_MERCHANT_PHONES = 3

const PHONE_PATTERN = /^[0-9+\-() ]+$/

export interface MerchantPhoneResult {
  phones: string[]
  error: string
}

/** 统一处理后台表单和 Excel 中的商家联系电话。 */
export function normalizeMerchantPhones(value: unknown): MerchantPhoneResult {
  const source = Array.isArray(value) ? value : String(value || '').split('|')
  if (source.some((item) => !String(item || '').trim())) {
    return { phones: [], error: '联系电话之间不能包含空号码' }
  }

  const phones: string[] = []
  for (const item of source) {
    const phone = String(item).trim()
    if (!PHONE_PATTERN.test(phone)) {
      return { phones: [], error: '联系电话只能包含数字、空格及 + - ( )' }
    }
    if (!phones.includes(phone)) phones.push(phone)
  }

  if (!phones.length) return { phones: [], error: '联系电话不能为空' }
  if (phones.length > MAX_MERCHANT_PHONES) {
    return { phones: [], error: `商家联系电话最多填写 ${MAX_MERCHANT_PHONES} 个` }
  }
  return { phones, error: '' }
}

export function merchantPhonesFromRecord(record: { phone?: string; phones?: string[] }): string[] {
  const result = normalizeMerchantPhones(
    Array.isArray(record.phones) && record.phones.length ? record.phones : [record.phone || ''],
  )
  return result.error ? [record.phone || ''].filter(Boolean) : result.phones
}
