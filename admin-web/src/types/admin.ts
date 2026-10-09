export type EntryType = 'merchant' | 'job' | 'rental' | 'offer'
export type ReviewStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'expired' | 'offline'
export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'hidden'

export interface AdminSession {
  uid: string
  displayName: string
  role: 'super_admin'
}

export interface ApiResponse<T> {
  ok: boolean
  code: string
  message: string
  data: T
  requestId: string
  debug?: string
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string
  hasMore: boolean
}

export interface UserProfileSnapshot {
  publicId: string
  nickname: string
  avatarFileId: string
  avatarUrl: string
  hasProfile: boolean
}

export interface Submission {
  _id?: string
  id: string
  type: EntryType | 'service' | 'promotion'
  title: string
  category: string
  contactName: string
  phone: string
  wechat: string
  location: string
  content: string
  images: string[]
  publicImages?: string[]
  evidenceFiles?: Array<{ type: string; fileId: string }>
  submitterRole?: 'merchant_owner' | 'property_owner' | 'registered_agent'
  declarations?: Record<string, boolean>
  businessHours?: string
  subCategory?: string
  area?: string
  rent?: string
  layout?: string
  merchantName?: string
  merchantId?: string
  validFrom?: string
  validUntil?: string
  userProfileSnapshot?: UserProfileSnapshot | null
  status: ReviewStatus
  rejectReason: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface EntryRecord {
  _id?: string
  id: string
  type: EntryType
  status: ReviewStatus
  version: number
  name?: string
  title?: string
  companyName?: string
  category?: string
  subCategory?: string
  phone?: string
  phones?: string[]
  contact?: string
  address?: string
  location?: string
  description?: string
  requirement?: string
  rent?: string
  salaryRange?: string
  layout?: string
  area?: string
  businessHours?: string
  workingTime?: string
  headcount?: string
  validUntil?: string
  validFrom?: string
  wechat?: string
  images?: string[]
  tags?: string[]
  merchantName?: string
  merchantId?: string
  summary?: string
  displayOrder?: number
  hidden?: boolean
  hiddenAt?: string
  hiddenByUid?: string
  deleted?: boolean
  deletedAt?: string
  deletedByUid?: string
  isTop: boolean
  topUntil: string
  isFeatured: boolean
  featuredUntil: string
  isPaid: boolean
  paidType: string
  chargeUntil: string
  adminNote: string
  reviewDueAt: string
  updatedAt: string
  submitterRole?: 'merchant_owner' | 'property_owner' | 'registered_agent'
  evidenceFiles?: Array<{ type: string; fileId: string }>
  sourceSubmissionId?: string
  verification?: {
    status: 'pending' | 'verified' | 'rejected'
    checks: Record<string, boolean>
    verifiedByUid: string
    verifiedAt: string
    note: string
  }
}

export interface Feedback {
  _id?: string
  id: string
  type: 'correction' | 'complaint'
  entryTitle: string
  content: string
  contact: string
  status: 'pending' | 'resolved'
  resolution?: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface CommentPolicy {
  id: 'comment_policy'
  blockedWords: string[]
  reviewWords: string[]
  notice: string
  version: number
  updatedAt?: string
}

export interface CommentRecord {
  _id?: string
  id: string
  entryType: 'merchant'
  entryId: string
  entryTitle: string
  ownerOpenid: string
  appid: string
  rating: number
  content: string
  status: 'pending' | 'approved' | 'rejected'
  moderationReason: string
  userProfileSnapshot?: UserProfileSnapshot | null
  hidden: boolean
  deleted: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface AdminLog {
  _id: string
  actorName: string
  action: string
  targetType: string
  targetId: string
  changedFields: string[]
  requestId: string
  createdAt: string
}
