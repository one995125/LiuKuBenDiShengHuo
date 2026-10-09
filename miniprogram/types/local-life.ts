/**
 * 本文件集中定义六库生活圈 MVP 的业务类型。
 * 注意：当前阶段使用本地 mock 与 storage，字段设计保留后续迁移云开发的空间。
 */

export type ReviewStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'expired' | 'offline'

export type EntryType = 'merchant' | 'job' | 'rental'

export type PublicContentType = EntryType | 'offer'

export type PublishType = EntryType | 'service' | 'promotion'

export type SubmissionType = 'merchant' | 'rental'

export type MerchantBoard = 'store' | 'service' | 'shopping'

export type SubmitterRole = 'merchant_owner' | 'property_owner' | 'registered_agent'

export type EvidenceFileType =
  | 'business_license'
  | 'storefront'
  | 'ownership_proof'
  | 'brokerage_filing'
  | 'owner_authorization'

export interface EvidenceFileInput {
  type: EvidenceFileType
  /** 提交前为本机临时路径，上传成功后为当前用户私有目录的 cloud fileID。 */
  fileId: string
}

export interface SubmissionDeclarations {
  truthConfirmed: boolean
  displayConsentConfirmed: boolean
  materialUseConsentConfirmed: boolean
}

export interface SubmissionVerification {
  status: 'pending' | 'verified' | 'rejected'
  checks: Record<string, boolean>
  verifiedByUid: string
  verifiedAt: string
  note: string
}

export type FeedbackType = 'correction' | 'complaint'

export type FeedbackStatus = 'pending' | 'resolved'

export type CommentStatus = 'pending' | 'approved' | 'rejected'

export interface PromotionFields {
  /** 是否在列表中置顶展示，原型阶段由隐藏管理页手动切换。 */
  isTop: boolean
  /** 置顶到期时间，空字符串表示暂未设置。 */
  topUntil: string
  /** 是否进入首页推荐位，原型阶段由隐藏管理页手动切换。 */
  isFeatured: boolean
  /** 推荐到期时间，空字符串表示暂未设置。 */
  featuredUntil: string
  /** 是否已经线下收费，首版只做人工记录，不接微信支付。 */
  isPaid: boolean
  /** 收费类型，例如商家置顶、首页推荐、招聘置顶。 */
  paidType: string
  /** 收费或服务到期时间，空字符串表示暂未设置。 */
  chargeUntil: string
  /** 管理员内部备注，用于记录沟通、收费和纠错情况。 */
  adminNote: string
}

export interface BasePublishedEntry extends PromotionFields {
  id: string
  type: EntryType
  status: ReviewStatus
  hidden?: boolean
  deleted?: boolean
  version?: number
  createdAt: string
  updatedAt: string
}

export interface Merchant extends BasePublishedEntry {
  type: 'merchant'
  name: string
  category: string
  subCategory: string
  area: string
  phone: string
  phones: string[]
  wechat: string
  address: string
  businessHours: string
  description: string
  images: string[]
  tags: string[]
}

export interface JobPost extends BasePublishedEntry {
  type: 'job'
  title: string
  companyName: string
  category: string
  salaryRange: string
  location: string
  workingTime: string
  headcount: string
  contact: string
  requirement: string
  validUntil: string
}

export interface RentalPost extends BasePublishedEntry {
  type: 'rental'
  title: string
  rent: string
  location: string
  layout: string
  area: string
  images: string[]
  contact: string
  description: string
  validUntil: string
}

export interface LocalOffer extends PromotionFields {
  id: string
  type: 'offer'
  status: ReviewStatus
  version?: number
  title: string
  merchantName: string
  merchantId: string
  summary: string
  description: string
  phone: string
  wechat: string
  images: string[]
  validFrom: string
  validUntil: string
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface Submission extends PromotionFields {
  id: string
  type: PublishType
  title: string
  category: string
  contactName: string
  phone: string
  wechat: string
  location: string
  content: string
  images: string[]
  publicImages?: string[]
  /** 核验材料仅可由提交人本人和管理员云函数读取，绝不能进入公开接口。 */
  evidenceFiles?: EvidenceFileInput[]
  submitterRole?: SubmitterRole
  declarations?: SubmissionDeclarations
  businessHours?: string
  subCategory?: string
  area?: string
  rent?: string
  layout?: string
  merchantName?: string
  merchantId?: string
  validFrom?: string
  validUntil?: string
  status: ReviewStatus
  version?: number
  publishedEntryType?: PublicContentType | ''
  publishedEntryId?: string
  rejectReason: string
  hasContacted: boolean
  createdAt: string
  updatedAt: string
  evidenceRetainUntil?: string
  evidencePurgedAt?: string
}

export interface CustomerServiceConfig {
  id: string
  phone: string
  wechat: string
  description: string
  updatedAt: string
}

export interface HomeData {
  featuredMerchants: Merchant[]
  latestJobs: JobPost[]
  latestRentals: RentalPost[]
  carouselItems: HomeCarouselItem[]
  recommendations: HomeRecommendation[]
  serviceKeywords: string[]
  pendingCount: number
}

export interface HomeRecommendation {
  id: string
  type: EntryType
  title: string
  subtitle: string
  meta: string
  statusLabel: string
  statusTone: 'green' | 'orange' | 'olive'
}

export interface HomeCarouselItem {
  id: string
  type: PublicContentType
  title: string
  subtitle: string
  meta: string
  statusLabel: string
  statusTone: 'green' | 'orange' | 'olive' | 'yellow'
  image: string
}

export interface SearchResult {
  id: string
  type: PublicContentType
  title: string
  subtitle: string
  phone: string
  tags: string[]
  board: MerchantBoard | 'rental'
  boardLabel: '店' | '房' | '修' | '购'
}

export interface SubmitEntryInput {
  type: SubmissionType
  title: string
  category: string
  contactName: string
  phone: string
  wechat: string
  location: string
  content: string
  images: string[]
  publicImages: string[]
  evidenceFiles: EvidenceFileInput[]
  submitterRole: SubmitterRole
  declarations: SubmissionDeclarations
  businessHours?: string
  subCategory?: string
  area?: string
  rent?: string
  layout?: string
  merchantName?: string
  merchantId?: string
  validFrom?: string
  validUntil?: string
}

export interface SubmitFeedbackInput {
  type: FeedbackType
  entryType: PublicContentType | ''
  entryId: string
  entryTitle: string
  content: string
  contact: string
}

export interface FeedbackSubmission {
  id: string
  type: FeedbackType
  entryType: PublicContentType | ''
  entryId: string
  entryTitle: string
  content: string
  contact: string
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
}

export interface MerchantComment {
  id: string
  entryType: 'merchant'
  entryId: string
  entryTitle?: string
  rating: number
  content: string
  status: CommentStatus
  moderationReason?: string
  hidden?: boolean
  userProfileSnapshot?: UserProfile | null
  createdAt: string
  updatedAt?: string
}

export interface SubmitCommentInput {
  entryId: string
  rating: number
  content: string
}

export interface UserProfile {
  publicId: string
  nickname: string
  avatarFileId: string
  avatarUrl: string
  hasProfile: boolean
  updatedAt: string
}

export interface AdminPatch {
  status?: ReviewStatus
  rejectReason?: string
  hasContacted?: boolean
  isTop?: boolean
  topUntil?: string
  isFeatured?: boolean
  featuredUntil?: string
  isPaid?: boolean
  paidType?: string
  adminNote?: string
}
