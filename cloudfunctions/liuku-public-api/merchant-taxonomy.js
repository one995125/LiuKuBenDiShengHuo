const CATEGORY_OPTIONS = {
  '餐饮美食': { board: 'store', children: ['小吃快餐', '正餐炒菜', '火锅烧烤', '饮品甜品', '早餐夜宵'] },
  '购物零售': { board: 'shopping', children: ['超市便利', '生鲜水果', '服饰鞋包', '母婴用品', '家居百货'] },
  '生活服务': { board: 'service', children: ['家政保洁', '水电维修', '开锁换锁', '搬家跑腿', '快递寄取'] },
  '车辆服务': { board: 'store', children: ['汽修保养', '洗车美容', '轮胎电瓶', '摩托电动车', '停车服务'] },
  '健康医药': { board: 'store', children: ['药店', '诊所', '口腔护理', '康复理疗', '体检护理'] },
  '住宿休闲': { board: 'store', children: ['酒店住宿', '茶室棋牌', '休闲娱乐', '健身运动', '旅游服务'] },
  '教育培训': { board: 'store', children: ['艺术培训', '学科辅导', '职业技能', '托管早教', '兴趣课程'] },
  '其他便民': { board: 'service', children: ['便民服务', '政务代办', '公益互助', '临时服务', '其他'] },
}

const BOARD_CATEGORIES = Object.keys(CATEGORY_OPTIONS).reduce((result, category) => {
  const board = CATEGORY_OPTIONS[category].board
  result[board].push(category)
  return result
}, { store: [], service: [], shopping: [] })

const BOARD_LABELS = { store: '店', service: '修', shopping: '购' }

// 旧客户端只传一级旧分类时继续可用；映射只影响查询，不把旧值重新写入数据库。
const LEGACY_FILTERS = {
  '超市便利': { category: '购物零售', subCategory: '超市便利' },
  '汽修洗车': { category: '车辆服务', subCategory: '' },
  '家政维修': { category: '生活服务', subCategory: '' },
  '酒店住宿': { category: '住宿休闲', subCategory: '酒店住宿' },
  '医药诊所': { category: '健康医药', subCategory: '' },
  '快递物流': { category: '生活服务', subCategory: '快递寄取' },
  '休闲娱乐': { category: '住宿休闲', subCategory: '休闲娱乐' },
}

function getMerchantBoard(category) {
  return CATEGORY_OPTIONS[category] ? CATEGORY_OPTIONS[category].board : ''
}

/**
 * 校验公开筛选组合。未传 board 时保留旧客户端的 category 精确查询兼容。
 */
function normalizeMerchantFilters({ board = '', category = '', subCategory = '' }) {
  if (!board) {
    const legacy = LEGACY_FILTERS[category]
    const normalizedCategory = legacy ? legacy.category : category
    const normalizedSubCategory = subCategory || (legacy ? legacy.subCategory : '')
    if (
      normalizedSubCategory
      && (!CATEGORY_OPTIONS[normalizedCategory]
        || !CATEGORY_OPTIONS[normalizedCategory].children.includes(normalizedSubCategory))
    ) {
      throw invalidFilter('二级分类不属于当前一级分类')
    }
    return {
      board: '',
      categories: normalizedCategory ? [normalizedCategory] : [],
      subCategory: normalizedSubCategory,
    }
  }
  if (!Object.prototype.hasOwnProperty.call(BOARD_CATEGORIES, board)) {
    throw invalidFilter('商家板块不合法')
  }
  if (category && getMerchantBoard(category) !== board) {
    throw invalidFilter('分类不属于当前板块')
  }
  if (subCategory) {
    if (!category || !CATEGORY_OPTIONS[category] || !CATEGORY_OPTIONS[category].children.includes(subCategory)) {
      throw invalidFilter('二级分类不属于当前一级分类')
    }
  }
  return {
    board,
    categories: category ? [category] : BOARD_CATEGORIES[board],
    subCategory,
  }
}

function invalidFilter(message) {
  const error = new Error(message)
  error.code = 'INVALID_FILTER'
  return error
}

module.exports = {
  BOARD_CATEGORIES,
  BOARD_LABELS,
  CATEGORY_OPTIONS,
  getMerchantBoard,
  normalizeMerchantFilters,
}
