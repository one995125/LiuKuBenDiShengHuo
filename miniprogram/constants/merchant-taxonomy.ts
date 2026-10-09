import type { MerchantBoard } from '../types/local-life'

export interface MerchantCategoryOption {
  label: string
  value: string
  children: readonly string[]
  board: MerchantBoard
}

export interface MerchantBoardShortcut {
  label: string
  category: string
  subCategory: string
}

export interface MerchantBoardConfig {
  board: MerchantBoard
  title: string
  subtitle: string
  badge: string
  searchPlaceholder: string
  resultTitle: string
  emptyText: string
  qualificationNote: string
  shortcuts: readonly MerchantBoardShortcut[]
}

/**
 * 商家分类的唯一前端来源，与运营后台保持一致。
 * board 由一级分类推导，用户请求不能自行指定并写入商家数据。
 */
export const MERCHANT_CATEGORY_OPTIONS: readonly MerchantCategoryOption[] = [
  { label: '餐饮美食', value: '餐饮美食', board: 'store', children: ['小吃快餐', '正餐炒菜', '火锅烧烤', '饮品甜品', '早餐夜宵'] },
  { label: '购物零售', value: '购物零售', board: 'shopping', children: ['超市便利', '生鲜水果', '服饰鞋包', '母婴用品', '家居百货'] },
  { label: '生活服务', value: '生活服务', board: 'service', children: ['家政保洁', '水电维修', '开锁换锁', '搬家跑腿', '快递寄取'] },
  { label: '车辆服务', value: '车辆服务', board: 'store', children: ['汽修保养', '洗车美容', '轮胎电瓶', '摩托电动车', '停车服务'] },
  { label: '健康医药', value: '健康医药', board: 'store', children: ['药店', '诊所', '口腔护理', '康复理疗', '体检护理'] },
  { label: '住宿休闲', value: '住宿休闲', board: 'store', children: ['酒店住宿', '茶室棋牌', '休闲娱乐', '健身运动', '旅游服务'] },
  { label: '教育培训', value: '教育培训', board: 'store', children: ['艺术培训', '学科辅导', '职业技能', '托管早教', '兴趣课程'] },
  { label: '其他便民', value: '其他便民', board: 'service', children: ['便民服务', '政务代办', '公益互助', '临时服务', '其他'] },
] as const

export const MERCHANT_CATEGORIES = MERCHANT_CATEGORY_OPTIONS.map((item) => item.value)

export const MERCHANT_BOARD_CONFIGS: Record<MerchantBoard, MerchantBoardConfig> = {
  store: {
    board: 'store',
    title: '到店商家',
    subtitle: '电话名 · 到店消费 · 真实清晰',
    badge: '已核验',
    searchPlaceholder: '搜索餐饮、医药、住宿、车辆、教育',
    resultTitle: '到店商家',
    emptyText: '暂无匹配的到店商家。',
    qualificationNote: '医药、教育、住宿等资质类服务，未核对服务类目和主体资质前不上架；页面仅展示联系方式。',
    shortcuts: [
      { label: '全部', category: '', subCategory: '' },
      { label: '餐饮', category: '餐饮美食', subCategory: '' },
      { label: '医药', category: '健康医药', subCategory: '' },
      { label: '住宿', category: '住宿休闲', subCategory: '' },
      { label: '车辆', category: '车辆服务', subCategory: '' },
      { label: '教育', category: '教育培训', subCategory: '' },
    ],
  },
  service: {
    board: 'service',
    title: '上门服务',
    subtitle: '家政维修 · 电话预约 · 平台不派单',
    badge: '已核验',
    searchPlaceholder: '搜索家政、维修、开锁、搬家、快递',
    resultTitle: '上门服务',
    emptyText: '暂无匹配的上门服务。',
    qualificationNote: '开锁、维修、家政等上门服务需线下核实经营主体和服务资质；平台仅展示联系方式，不参与交易、派单或履约。',
    shortcuts: [
      { label: '全部', category: '', subCategory: '' },
      { label: '家政', category: '生活服务', subCategory: '家政保洁' },
      { label: '维修', category: '生活服务', subCategory: '水电维修' },
      { label: '开锁', category: '生活服务', subCategory: '开锁换锁' },
      { label: '搬家', category: '生活服务', subCategory: '搬家跑腿' },
      { label: '快递', category: '生活服务', subCategory: '快递寄取' },
      { label: '其他', category: '其他便民', subCategory: '' },
    ],
  },
  shopping: {
    board: 'shopping',
    title: '购物零售',
    subtitle: '线下商店 · 电话地址 · 不做交易',
    badge: '已核验',
    searchPlaceholder: '搜索超市、生鲜、服饰、母婴、家居',
    resultTitle: '零售商家',
    emptyText: '暂无匹配的购物零售商家。',
    qualificationNote: '本板块仅展示线下商家电话和地址，不提供下单、配送或支付；食品、酒类、烟草、药品等须核验对应许可。',
    shortcuts: [
      { label: '全部', category: '购物零售', subCategory: '' },
      { label: '超市', category: '购物零售', subCategory: '超市便利' },
      { label: '生鲜', category: '购物零售', subCategory: '生鲜水果' },
      { label: '服饰', category: '购物零售', subCategory: '服饰鞋包' },
      { label: '母婴', category: '购物零售', subCategory: '母婴用品' },
      { label: '家居', category: '购物零售', subCategory: '家居百货' },
    ],
  },
}

export function getMerchantSubCategories(category: string): readonly string[] {
  return MERCHANT_CATEGORY_OPTIONS.find((item) => item.value === category)?.children || []
}

export function getMerchantBoard(category: string): MerchantBoard | '' {
  return MERCHANT_CATEGORY_OPTIONS.find((item) => item.value === category)?.board || ''
}
