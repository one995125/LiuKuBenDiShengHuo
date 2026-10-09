const assert = require('assert')
const {
  escapeRegExp,
  getEntryConfig,
  normalizeCursor,
  normalizePageSize,
  sanitizePublicDocument,
  sanitizeText,
  toSearchResult,
} = require('../cloudfunctions/liuku-public-api/query-utils')

assert.strictEqual(normalizeCursor('-1'), 0)
assert.strictEqual(normalizeCursor('12'), 12)
assert.strictEqual(normalizePageSize(0), 1)
assert.strictEqual(normalizePageSize(100), 20)
assert.strictEqual(sanitizeText('  六库生活圈  ', 4), '六库生活')
assert.strictEqual(escapeRegExp('a+b?'), 'a\\+b\\?')
assert.ok(getEntryConfig('merchant'))
assert.strictEqual(getEntryConfig('offer').collection, 'liuku_offers')
assert.strictEqual(getEntryConfig('unknown'), null)

const publicMerchant = sanitizePublicDocument('merchant', {
  _id: 'merchant-test',
  status: 'published',
  name: '测试商家',
  category: '餐饮美食',
  phone: '13000000000',
  phones: ['13000000000', '0876-1234567'],
  phonesSearch: '13000000000 0876-1234567',
  ownerOpenid: 'must-not-leak',
  appid: 'must-not-leak',
  sourceSubmissionId: 'must-not-leak',
  evidenceFiles: [{ type: 'business_license', fileId: 'must-not-leak' }],
  verification: { status: 'verified', checks: { licenseSubject: true } },
  adminNote: 'must-not-leak',
})

assert.strictEqual(publicMerchant.id, 'merchant-test')
assert.strictEqual(publicMerchant.ownerOpenid, undefined)
assert.strictEqual(publicMerchant.appid, undefined)
assert.strictEqual(publicMerchant.sourceSubmissionId, undefined)
assert.strictEqual(publicMerchant.evidenceFiles, undefined)
assert.strictEqual(publicMerchant.verification, undefined)
assert.strictEqual(publicMerchant.adminNote, undefined)
assert.deepStrictEqual(publicMerchant.phones, ['13000000000', '0876-1234567'])
assert.strictEqual(publicMerchant.phonesSearch, undefined)

const legacyMerchant = sanitizePublicDocument('merchant', {
  _id: 'merchant-legacy',
  phone: '13900000000',
})
assert.deepStrictEqual(legacyMerchant.phones, ['13900000000'])

const searchResult = toSearchResult('merchant', publicMerchant)
assert.strictEqual(searchResult.id, 'merchant-test')
assert.strictEqual(searchResult.type, 'merchant')

const publicOffer = sanitizePublicDocument('offer', {
  _id: 'offer-test',
  status: 'published',
  title: '周末到店九折',
  merchantName: '六库示例商家',
  merchantId: 'merchant-test',
  summary: '周末到店消费享受九折优惠。',
  description: '活动期间到店消费可享受九折优惠，具体以商家说明为准。',
  phone: '13800000000',
  wechat: 'liuku-offer',
  images: ['cloud://demo/offer.jpg'],
  validFrom: '2026-06-01',
  validUntil: '2026-06-30',
  displayOrder: 90,
  ownerOpenid: 'must-not-leak',
  adminNote: 'must-not-leak',
})
assert.strictEqual(publicOffer.id, 'offer-test')
assert.strictEqual(publicOffer.type, 'offer')
assert.strictEqual(publicOffer.merchantName, '六库示例商家')
assert.strictEqual(publicOffer.ownerOpenid, undefined)
assert.strictEqual(publicOffer.adminNote, undefined)

const offerSearchResult = toSearchResult('offer', publicOffer)
assert.strictEqual(offerSearchResult.type, 'offer')
assert.strictEqual(offerSearchResult.title, '周末到店九折')
assert.strictEqual(offerSearchResult.phone, '13800000000')

console.log('公开数据查询工具测试通过')
