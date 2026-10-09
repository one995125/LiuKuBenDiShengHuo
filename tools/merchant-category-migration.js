const CATEGORY_OPTIONS = {
  '餐饮美食': ['小吃快餐', '正餐炒菜', '火锅烧烤', '饮品甜品', '早餐夜宵'],
  '购物零售': ['超市便利', '生鲜水果', '服饰鞋包', '母婴用品', '家居百货'],
  '生活服务': ['家政保洁', '水电维修', '开锁换锁', '搬家跑腿', '快递寄取'],
  '车辆服务': ['汽修保养', '洗车美容', '轮胎电瓶', '摩托电动车', '停车服务'],
  '健康医药': ['药店', '诊所', '口腔护理', '康复理疗', '体检护理'],
  '住宿休闲': ['酒店住宿', '茶室棋牌', '休闲娱乐', '健身运动', '旅游服务'],
  '教育培训': ['艺术培训', '学科辅导', '职业技能', '托管早教', '兴趣课程'],
  '其他便民': ['便民服务', '政务代办', '公益互助', '临时服务', '其他'],
}

const LEGACY_CATEGORY_MAP = {
  '超市便利': { category: '购物零售', defaultSubCategory: '超市便利' },
  '汽修洗车': { category: '车辆服务', defaultSubCategory: '汽修保养' },
  '家政维修': { category: '生活服务', defaultSubCategory: '水电维修' },
  '酒店住宿': { category: '住宿休闲', defaultSubCategory: '酒店住宿' },
  '医药诊所': { category: '健康医药', defaultSubCategory: '诊所' },
  '快递物流': { category: '生活服务', defaultSubCategory: '快递寄取' },
  '休闲娱乐': { category: '住宿休闲', defaultSubCategory: '休闲娱乐' },
}

/**
 * 纯函数迁移单条记录，不连接数据库。调用方必须先导出原集合备份，再写回 changes。
 * 无法可靠判断的标准分类记录会标记 reviewRequired，公开记录应转为 pending 后人工复核。
 */
function normalizeMerchantCategory(record) {
  const source = record && typeof record === 'object' ? record : {}
  const originalCategory = String(source.category || '').trim()
  const originalSubCategory = String(source.subCategory || '').trim()
  const legacy = LEGACY_CATEGORY_MAP[originalCategory]
  const category = legacy ? legacy.category : originalCategory
  const allowedSubCategories = CATEGORY_OPTIONS[category] || []
  const subCategory = allowedSubCategories.includes(originalSubCategory)
    ? originalSubCategory
    : legacy
      ? legacy.defaultSubCategory
      : originalSubCategory
  const valid = Boolean(category && allowedSubCategories.includes(subCategory))
  const changed = category !== originalCategory || subCategory !== originalSubCategory

  return {
    changed,
    reviewRequired: !valid,
    changes: {
      category,
      subCategory,
      ...(valid ? {} : {
        status: source.status === 'published' ? 'pending' : source.status,
        migrationReviewRequired: true,
      }),
    },
    original: { category: originalCategory, subCategory: originalSubCategory },
  }
}

function buildMerchantCategoryMigrationPlan(records) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    id: String(record.id || record._id || ''),
    ...normalizeMerchantCategory(record),
  })).filter((item) => item.id && (item.changed || item.reviewRequired))
}

module.exports = {
  CATEGORY_OPTIONS,
  LEGACY_CATEGORY_MAP,
  buildMerchantCategoryMigrationPlan,
  normalizeMerchantCategory,
}
