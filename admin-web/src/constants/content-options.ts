export interface MerchantCategoryOption {
  label: string
  value: string
  children: string[]
}

export const MERCHANT_CATEGORY_OPTIONS: MerchantCategoryOption[] = [
  { label: '餐饮美食', value: '餐饮美食', children: ['小吃快餐', '正餐炒菜', '火锅烧烤', '饮品甜品', '早餐夜宵'] },
  { label: '购物零售', value: '购物零售', children: ['超市便利', '生鲜水果', '服饰鞋包', '母婴用品', '家居百货'] },
  { label: '生活服务', value: '生活服务', children: ['家政保洁', '水电维修', '开锁换锁', '搬家跑腿', '快递寄取'] },
  { label: '车辆服务', value: '车辆服务', children: ['汽修保养', '洗车美容', '轮胎电瓶', '摩托电动车', '停车服务'] },
  { label: '健康医药', value: '健康医药', children: ['药店', '诊所', '口腔护理', '康复理疗', '体检护理'] },
  { label: '住宿休闲', value: '住宿休闲', children: ['酒店住宿', '茶室棋牌', '休闲娱乐', '健身运动', '旅游服务'] },
  { label: '教育培训', value: '教育培训', children: ['艺术培训', '学科辅导', '职业技能', '托管早教', '兴趣课程'] },
  { label: '其他便民', value: '其他便民', children: ['便民服务', '政务代办', '公益互助', '临时服务', '其他'] },
]

export const MERCHANT_AREA_OPTIONS = ['江东', '江西', '小沙坝', '西岸', '新城区', '城外']

export const MERCHANT_TAG_OPTIONS = [
  '已核验',
  '平台推荐',
  '本地老店',
  '新店开业',
  '口碑较好',
  '价格实惠',
  '优惠中',
  '可预约',
  '可送货',
  '上门服务',
  '夜间营业',
  '停车方便',
  '支持微信',
]

export function getSubCategoryOptions(category: string): string[] {
  return MERCHANT_CATEGORY_OPTIONS.find((item) => item.value === category)?.children || []
}

export function isValidMerchantCategory(category: string, subCategory: string): boolean {
  return getSubCategoryOptions(category).includes(subCategory)
}
