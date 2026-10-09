const assert = require('assert')
const {
  buildMerchantCategoryMigrationPlan,
  normalizeMerchantCategory,
} = require('./merchant-category-migration')
const {
  normalizeMerchantFilters,
} = require('../cloudfunctions/liuku-public-api/merchant-taxonomy')

assert.deepStrictEqual(
  normalizeMerchantCategory({ category: '超市便利', subCategory: '' }).changes,
  { category: '购物零售', subCategory: '超市便利' },
)
assert.deepStrictEqual(
  normalizeMerchantCategory({ category: '汽修洗车', subCategory: '洗车美容' }).changes,
  { category: '车辆服务', subCategory: '洗车美容' },
)
assert.strictEqual(
  normalizeMerchantCategory({ category: '未知分类', status: 'published' }).reviewRequired,
  true,
)
assert.strictEqual(
  normalizeMerchantCategory({ category: '未知分类', status: 'published' }).changes.status,
  'pending',
)
assert.strictEqual(buildMerchantCategoryMigrationPlan([
  { _id: 'merchant-1', category: '超市便利', subCategory: '' },
  { _id: 'merchant-2', category: '购物零售', subCategory: '超市便利' },
]).length, 1)

assert.deepStrictEqual(normalizeMerchantFilters({ board: 'shopping' }).categories, ['购物零售'])
assert.deepStrictEqual(
  normalizeMerchantFilters({ category: '超市便利' }),
  { board: '', categories: ['购物零售'], subCategory: '超市便利' },
)
assert.deepStrictEqual(
  normalizeMerchantFilters({ category: '家政维修' }),
  { board: '', categories: ['生活服务'], subCategory: '' },
)
assert.deepStrictEqual(
  normalizeMerchantFilters({ board: 'store' }).categories,
  ['餐饮美食', '车辆服务', '健康医药', '住宿休闲', '教育培训'],
)
assert.throws(
  () => normalizeMerchantFilters({ board: 'shopping', category: '餐饮美食' }),
  (error) => error && error.code === 'INVALID_FILTER',
)
assert.throws(
  () => normalizeMerchantFilters({ board: 'service', category: '生活服务', subCategory: '超市便利' }),
  (error) => error && error.code === 'INVALID_FILTER',
)

console.log('商家四板块与分类迁移测试通过')
