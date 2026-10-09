const assert = require('assert')
const {
  calculateEvidenceRetainUntil,
  getRequiredEvidenceTypes,
  getRequiredVerificationKeys,
  createEntryDocument,
  mapSubmissionToEntry,
  normalizePageSize,
  sanitizeImportRows,
  serializeValue,
} = require('../cloudfunctions/liuku-admin-api/admin-utils')

assert.strictEqual(
  calculateEvidenceRetainUntil('2026-07-22T12:00:00.000Z'),
  '2027-07-22T12:00:00.000Z',
)
assert.deepStrictEqual(getRequiredEvidenceTypes('merchant', 'merchant_owner'), ['business_license', 'storefront'])
assert.deepStrictEqual(getRequiredEvidenceTypes('rental', 'property_owner'), ['ownership_proof'])
assert.deepStrictEqual(
  getRequiredEvidenceTypes('rental', 'registered_agent'),
  ['business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof'],
)
assert.strictEqual(getRequiredVerificationKeys('rental', 'registered_agent').length, 5)

const merchant = createEntryDocument('merchant', {
  name: '江边家电维修',
  category: '生活服务',
  subCategory: '水电维修',
  phone: '0876-3621288',
  address: '六库江东片区',
  description: '提供家电维修和上门检查。',
  tags: ['上门服务', '维修'],
  images: ['cloud://demo/1.jpg'],
  status: 'published',
})
assert.strictEqual(merchant.status, 'published')
assert.deepStrictEqual(merchant.tags, ['上门服务', '维修'])
assert.deepStrictEqual(merchant.phones, ['0876-3621288'])
assert.strictEqual(merchant.phonesSearch, '0876-3621288')

const editedMerchant = createEntryDocument('merchant', {
  name: 'Edited Merchant',
  category: '生活服务',
  subCategory: '水电维修',
  phones: ['13800000000'],
  address: 'Liuku',
  description: 'Edited description.',
}, {
  _id: 'merchant_existing_cloud_id',
  id: 'merchant_existing_cloud_id',
  status: 'published',
  version: 3,
  createdAt: '2026-06-10T00:00:00.000Z',
})
assert.strictEqual(Object.prototype.hasOwnProperty.call(editedMerchant, '_id'), false)
assert.strictEqual(editedMerchant.id, 'merchant_existing_cloud_id')
assert.strictEqual(editedMerchant.status, 'published')
assert.strictEqual(editedMerchant.version, 3)

const multiPhoneMerchant = createEntryDocument('merchant', {
  name: '多号码商家',
  category: '生活服务',
  subCategory: '水电维修',
  phone: '13800000000|0876-1234567|13800000000',
  address: '六库城区',
  description: '测试多个联系电话。',
})
assert.deepStrictEqual(multiPhoneMerchant.phones, ['13800000000', '0876-1234567'])
assert.strictEqual(multiPhoneMerchant.phone, '13800000000')

assert.throws(
  () => createEntryDocument('merchant', {
    name: '错误号码商家',
    category: '生活服务',
    subCategory: '水电维修',
    phones: ['13800000000', '老板电话'],
    address: '六库城区',
    description: '测试非法联系电话。',
  }),
  /只能包含数字/,
)

assert.throws(
  () => createEntryDocument('job', {
    title: '服务员',
    companyName: '示例餐馆',
  }),
  /薪资范围不能为空/,
)

const serviceEntry = mapSubmissionToEntry({
  type: 'service',
  title: '王师傅开锁换锁',
  category: '',
  phone: '13900001111',
  wechat: '',
  location: '六库城区',
  content: '24 小时电话联系。',
  images: [],
})
assert.strictEqual(serviceEntry.category, '生活服务')
assert.deepStrictEqual(serviceEntry.tags, [])
assert.strictEqual(serviceEntry.subCategory, '水电维修')
assert.strictEqual(serviceEntry.area, '')

const offer = createEntryDocument('offer', {
  title: '周末到店九折',
  merchantName: '六库示例商家',
  merchantId: 'merchant_demo_1',
  summary: '周末到店消费享受九折优惠。',
  description: '活动期间到店消费可享受九折优惠。',
  phone: '13800000000',
  wechat: 'liuku-offer',
  validFrom: '2026-06-01',
  validUntil: '2026-06-30',
  displayOrder: 80,
  status: 'published',
})
assert.strictEqual(offer.status, 'published')
assert.strictEqual(offer.type, 'offer')
assert.strictEqual(offer.displayOrder, 80)

assert.throws(
  () => createEntryDocument('offer', {
    title: '日期错误的活动',
    merchantName: '六库示例商家',
    summary: '日期错误。',
    description: '用于验证日期错误。',
    validFrom: '2026-07-01',
    validUntil: '2026-06-30',
  }),
  /结束日期不能早于开始日期/,
)

const offerFromSubmission = mapSubmissionToEntry({
  type: 'promotion',
  title: '用户投稿优惠',
  merchantName: '投稿商家',
  merchantId: '',
  contactName: '王女士',
  phone: '13900001111',
  wechat: 'liuku-promotion',
  content: '活动期间指定商品八折。',
  validFrom: '2026-06-10',
  validUntil: '2026-06-20',
  images: ['cloud://demo/offer.jpg'],
})
assert.strictEqual(offerFromSubmission.merchantName, '投稿商家')
assert.strictEqual(offerFromSubmission.validUntil, '2026-06-20')
assert.strictEqual(offerFromSubmission.displayOrder, 100)

const imported = sanitizeImportRows('rental', [
  {
    sourceCode: 'R0001',
    title: '江东两室一厅出租',
    rent: '1600元/月',
    location: '六库江东片区',
    layout: '两室一厅',
    contact: '13987652210',
    description: '采光良好。',
    status: 'published',
  },
  {
    sourceCode: 'R0001',
    title: '重复编号',
  },
])
assert.strictEqual(imported.rows.length, 1)
assert.strictEqual(imported.errors.length, 1)
assert.match(imported.errors[0].message, /重复/)

assert.strictEqual(normalizePageSize(999), 50)
assert.deepStrictEqual(
  serializeValue({ createdAt: new Date('2026-06-10T00:00:00.000Z') }),
  { createdAt: '2026-06-10T00:00:00.000Z' },
)

console.log('管理员云函数工具测试通过：内容校验、投稿转换、批量导入和时间序列化。')
