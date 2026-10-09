import type { PublishType, ReviewStatus } from '../types/local-life'
export { MERCHANT_CATEGORIES } from './merchant-taxonomy'

/**
 * 本地生活业务常量。
 * 页面只读取这些稳定配置，避免在 WXML/页面脚本里散落魔法字符串。
 */

export const STORAGE_KEYS = {
  submissions: 'liuku_local_life_submissions',
  feedbacks: 'liuku_life_circle_feedbacks',
  /** 用户云操作失败草稿；当前版本只展示反馈草稿，遗留投稿草稿会被清理。 */
  userOperationDrafts: 'liuku_cloud_user_operation_drafts_v1',
  /** 历史“我的发布”兼容缓存；新客户端不再读取或展示。 */
  userSubmissionCache: 'liuku_cloud_user_submission_cache_v1',
  /** 历史用户资料兼容缓存；资料保存已停用。 */
  userProfileCache: 'liuku_cloud_user_profile_cache_v1',
} as const

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  published: '已通过',
  rejected: '已拒绝',
  expired: '已过期',
  offline: '已下架',
}

export const REVIEW_STATUS_TONES: Record<ReviewStatus, string> = {
  draft: 'muted',
  pending: 'warning',
  published: 'success',
  rejected: 'danger',
  expired: 'muted',
  offline: 'muted',
}

export const PUBLISH_TYPE_LABELS: Record<PublishType, string> = {
  merchant: '发布商家信息',
  job: '发布招聘',
  rental: '发布房屋出租',
  service: '发布便民服务',
  promotion: '发布优惠活动',
}

export const APP_BRAND = {
  name: '六库生活圈',
  slogan: '沿着生活线索，快速找到本地信息',
} as const

/**
 * 正式上线前在此处统一配置运营者电话和微信号。
 * 空字符串表示尚未配置，界面会给出明确提示，不会发起无效调用。
 */
export const CUSTOMER_SERVICE = {
  phone: '',
  wechat: '',
  description: '客服用于信息纠错、投诉反馈和商家合作。',
} as const

export const SERVICE_KEYWORDS = ['开锁', '修水电', '搬家', '快递', '家政', '疏通', '维修', '跑腿']

export const CUSTOMER_SERVICE_TEXT = `${CUSTOMER_SERVICE.description} 当前原型尚未配置真实联系方式。`
