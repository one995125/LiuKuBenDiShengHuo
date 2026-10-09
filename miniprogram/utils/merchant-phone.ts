import type { Merchant } from '../types/local-life'

/** 兼容旧数据：没有 phones 时使用原有主号码。 */
export function getMerchantPhones(merchant: Pick<Merchant, 'phone' | 'phones'>): string[] {
  const source = Array.isArray(merchant.phones) && merchant.phones.length
    ? merchant.phones
    : [merchant.phone]
  return source.reduce<string[]>((result, item) => {
    const phone = String(item || '').trim()
    if (phone && !result.includes(phone)) result.push(phone)
    return result
  }, []).slice(0, 3)
}

/** 一个号码直接拨打，多个号码先让用户选择。 */
export function callMerchantPhone(merchant: Pick<Merchant, 'phone' | 'phones'>): void {
  const phones = getMerchantPhones(merchant)
  if (!phones.length) {
    wx.showToast({ title: '暂无联系电话', icon: 'none' })
    return
  }
  if (phones.length === 1) {
    wx.makePhoneCall({ phoneNumber: phones[0] })
    return
  }
  wx.showActionSheet({
    itemList: phones,
    success: ({ tapIndex }) => {
      const phoneNumber = phones[tapIndex]
      if (phoneNumber) wx.makePhoneCall({ phoneNumber })
    },
  })
}
