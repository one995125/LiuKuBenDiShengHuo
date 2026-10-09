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

function isValidMerchantCategory(category, subCategory) {
  return Boolean(CATEGORY_OPTIONS[category] && CATEGORY_OPTIONS[category].includes(subCategory))
}

module.exports = { CATEGORY_OPTIONS, isValidMerchantCategory }
