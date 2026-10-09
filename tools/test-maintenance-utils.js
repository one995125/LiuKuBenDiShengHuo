const assert = require('assert')
const {
  buildMaintenancePatch,
  toTimestamp,
} = require('../cloudfunctions/liuku-maintenance/maintenance-utils')

const now = Date.parse('2026-06-10T12:00:00+08:00')
const patch = buildMaintenancePatch({
  status: 'published',
  validUntil: '2026-06-09',
  isTop: true,
  topUntil: '2026-06-09',
  isFeatured: true,
  featuredUntil: '2026-06-11',
}, now)

assert.deepStrictEqual(patch, {
  status: 'expired',
  isTop: false,
})
assert(toTimestamp('2026-06-10') > 0)
assert.strictEqual(toTimestamp('not-a-date'), 0)
assert.deepStrictEqual(
  buildMaintenancePatch({
    status: 'published',
    validUntil: '2026-06-30',
    isTop: false,
    isFeatured: false,
  }, now),
  {},
)

assert.deepStrictEqual(
  buildMaintenancePatch({
    type: 'offer',
    status: 'published',
    validUntil: '2026-06-09',
    isFeatured: true,
    featuredUntil: '2026-06-30',
  }, now),
  {
    status: 'expired',
  },
)

console.log('维护云函数测试通过：内容过期、置顶到期和无变更场景。')
