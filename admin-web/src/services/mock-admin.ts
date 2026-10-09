import type {
  AdminLog,
  CommentPolicy,
  CommentRecord,
  EntryRecord,
  EntryType,
  Feedback,
  PageResult,
  Submission,
} from '../types/admin'

const now = new Date()
const iso = (offsetMinutes = 0) =>
  new Date(now.getTime() + offsetMinutes * 60_000).toISOString()

let submissions: Submission[] = [
  {
    id: 'submission_demo_1',
    type: 'merchant',
    title: '江边家电维修',
    category: '生活服务',
    subCategory: '水电维修',
    contactName: '王师傅',
    phone: '0876-3621288',
    wechat: 'wx-liuku-repair',
    location: '六库江东片区便民服务点',
    content: '提供家电维修、开锁换锁和上门检查服务。',
    images: [],
    publicImages: [],
    evidenceFiles: [
      { type: 'business_license', fileId: 'cloud://mock/liuku/submissions/mock/evidence/license.jpg' },
      { type: 'storefront', fileId: 'cloud://mock/liuku/submissions/mock/evidence/storefront.jpg' },
    ],
    submitterRole: 'merchant_owner',
    status: 'pending',
    rejectReason: '',
    version: 1,
    createdAt: iso(-180),
    updatedAt: iso(-30),
  },
  {
    id: 'submission_demo_2',
    type: 'rental',
    title: '餐馆服务员',
    category: '餐饮服务',
    contactName: '李女士',
    phone: '13900001111',
    wechat: '',
    location: '六库城区',
    content: '工作认真，有餐饮服务经验优先。',
    images: [],
    publicImages: [],
    evidenceFiles: [
      { type: 'ownership_proof', fileId: 'cloud://mock/liuku/submissions/mock/evidence/ownership.jpg' },
    ],
    submitterRole: 'property_owner',
    status: 'pending',
    rejectReason: '',
    version: 1,
    createdAt: iso(-240),
    updatedAt: iso(-70),
  },
]

let entries: EntryRecord[] = [
  {
    id: 'merchant_demo_1',
    type: 'merchant',
    status: 'published',
    version: 2,
    name: '六库阿丽小吃',
    category: '餐饮美食',
    phone: '13900001111',
    phones: ['13900001111'],
    wechat: '',
    address: '六库人民路便民市场旁',
    businessHours: '08:00-21:30',
    description: '本地早餐、小吃和简餐。',
    images: [],
    tags: ['早餐', '本地生活'],
    isTop: true,
    topUntil: iso(60 * 24 * 7),
    isFeatured: true,
    featuredUntil: iso(60 * 24 * 7),
    isPaid: true,
    paidType: '首页推荐',
    chargeUntil: iso(60 * 24 * 7),
    adminNote: '',
    reviewDueAt: iso(60 * 24 * 30),
    updatedAt: iso(-40),
  },
  {
    id: 'job_demo_1',
    type: 'job',
    status: 'published',
    version: 1,
    title: '餐馆服务员',
    companyName: '六库阿丽小吃',
    category: '餐饮服务',
    salaryRange: '3500-4200元/月',
    location: '六库城区',
    workingTime: '10:00-21:00，月休4天',
    headcount: '2人',
    contact: '0876-3621288',
    requirement: '做事认真，有餐饮服务经验优先。',
    validUntil: iso(60 * 24 * 20),
    images: [],
    isTop: false,
    topUntil: '',
    isFeatured: false,
    featuredUntil: '',
    isPaid: false,
    paidType: '',
    chargeUntil: '',
    adminNote: '',
    reviewDueAt: iso(60 * 24 * 20),
    updatedAt: iso(-80),
  },
  {
    id: 'rental_demo_1',
    type: 'rental',
    status: 'published',
    version: 1,
    title: '江东两室一厅出租',
    rent: '1600元/月',
    location: '六库江东片区',
    layout: '两室一厅',
    area: '78㎡',
    contact: '13987652210',
    description: '采光良好，生活配套方便。',
    validUntil: iso(60 * 24 * 30),
    images: [],
    isTop: false,
    topUntil: '',
    isFeatured: false,
    featuredUntil: '',
    isPaid: false,
    paidType: '',
    chargeUntil: '',
    adminNote: '',
    reviewDueAt: iso(60 * 24 * 30),
    updatedAt: iso(-120),
  },
  {
    id: 'offer_demo_1',
    type: 'offer',
    status: 'published',
    version: 1,
    title: '周末到店九折',
    merchantName: '六库阿丽小吃',
    merchantId: 'merchant_demo_1',
    summary: '周末到店消费享受九折优惠。',
    description: '活动期间到店消费可享受九折优惠，详情请联系商家。',
    phone: '13900001111',
    wechat: '',
    images: [],
    validFrom: iso(-60 * 24 * 2),
    validUntil: iso(60 * 24 * 20),
    displayOrder: 80,
    isTop: false,
    topUntil: '',
    isFeatured: true,
    featuredUntil: iso(60 * 24 * 20),
    isPaid: false,
    paidType: '',
    chargeUntil: '',
    adminNote: '',
    reviewDueAt: iso(60 * 24 * 20),
    updatedAt: iso(-20),
  },
]

let feedbacks: Feedback[] = [
  {
    id: 'feedback_demo_1',
    type: 'correction',
    entryTitle: '江边家电维修',
    content: '营业时间最近有调整，请联系商家核实。',
    contact: '13900002222',
    status: 'pending',
    version: 1,
    createdAt: iso(-90),
    updatedAt: iso(-90),
  },
]

let comments: CommentRecord[] = [
  {
    id: 'comment_demo_1',
    entryType: 'merchant',
    entryId: 'merchant_demo_1',
    entryTitle: '六库阿丽小吃',
    ownerOpenid: 'mock_openid_1',
    appid: 'mock_appid',
    rating: 5,
    content: '味道稳定，电话预订比较方便。',
    status: 'pending',
    moderationReason: '',
    userProfileSnapshot: {
      publicId: 'LKMOCKUSER',
      nickname: '本地用户',
      avatarFileId: '',
      avatarUrl: '',
      hasProfile: true,
    },
    hidden: false,
    deleted: false,
    version: 1,
    createdAt: iso(-50),
    updatedAt: iso(-50),
  },
]

const logs: AdminLog[] = [
  {
    _id: 'log_demo_1',
    actorName: '演示管理员',
    action: 'entry.update',
    targetType: 'merchant',
    targetId: 'merchant_demo_1',
    changedFields: ['isFeatured', 'featuredUntil'],
    requestId: 'mock_request_1',
    createdAt: iso(-45),
  },
]

let customerService = {
  id: 'customer_service',
  phone: '0876-1234567',
  wechat: 'liuku-service',
  description: '用于信息纠错、投诉和商家合作咨询。',
  version: 1,
}

let commentPolicy: CommentPolicy = {
  id: 'comment_policy',
  blockedWords: ['诈骗', '赌博'],
  reviewWords: ['差评', '投诉'],
  notice: '评论提交后先进入人工审核，审核通过后展示。',
  version: 1,
  updatedAt: iso(-20),
}

function page<T>(items: T[]): PageResult<T> {
  return { items, nextCursor: '', hasMore: false }
}

function filterKeyword<T>(items: T[], keyword: unknown): T[] {
  const normalized = String(keyword || '').trim().toLowerCase()
  if (!normalized) return items
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(normalized))
}

function updateLog(action: string, targetType: string, targetId: string, changedFields: string[]) {
  logs.unshift({
    _id: `log_${Date.now()}`,
    actorName: '演示管理员',
    action,
    targetType,
    targetId,
    changedFields,
    requestId: `mock_${Date.now()}`,
    createdAt: new Date().toISOString(),
  })
}

export async function mockAdminApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120))
  if (payload.type === 'job' && ['listEntries', 'getEntry', 'saveEntry', 'setPromotion', 'importEntries'].includes(action)) {
    throw new Error('招聘频道暂未开放')
  }

  if (action === 'adminSession' || action === 'adminHealth') {
    return {
      admin: { uid: 'mock-super-admin', displayName: '演示管理员', role: 'super_admin' },
    } as T
  }
  if (action === 'dashboard') {
    return {
      counts: {
        pendingSubmissions: submissions.filter((item) => item.status === 'pending').length,
        publishedEntries: entries.filter((item) => item.type !== 'job' && item.status === 'published').length,
        pendingFeedbacks: feedbacks.filter((item) => item.status === 'pending').length,
        pendingComments: comments.filter((item) => item.status === 'pending' && !item.deleted).length,
        activePromotions: entries.filter((item) => item.isTop || item.isFeatured).length,
        activeOffers: entries.filter((item) => item.type === 'offer' && item.status === 'published').length,
      },
      recentSubmissions: submissions.slice(0, 5),
      recentFeedbacks: feedbacks.slice(0, 5),
      serverTime: new Date().toISOString(),
    } as T
  }
  if (action === 'listSubmissions') {
    const status = String(payload.status || '')
    const filtered = submissions.filter((item) => !status || item.status === status)
    return page(filterKeyword(filtered, payload.keyword)) as T
  }
  if (action === 'reviewSubmission') {
    const id = String(payload.id || '')
    const decision = String(payload.decision || '')
    submissions = submissions.map((item) => item.id === id
      ? {
          ...item,
          status: decision === 'approve' ? 'published' : 'rejected',
          rejectReason: String(payload.rejectReason || ''),
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog(`submission.${decision}`, 'submission', id, ['status'])
    return { id } as T
  }
  if (action === 'listEntries') {
    const type = String(payload.type || '') as EntryType
    const status = String(payload.status || '')
    const includeHidden = Boolean(payload.includeHidden)
    const filtered = entries.filter((item) =>
      item.type === type &&
      !item.deleted &&
      (includeHidden || !item.hidden) &&
      (!status || item.status === status))
    return page(filterKeyword(filtered, payload.keyword)) as T
  }
  if (action === 'saveEntry') {
    const type = String(payload.type || '') as EntryType
    const input = (payload.entry || {}) as Partial<EntryRecord>
    const id = String(input.id || `${type}_${Date.now()}`)
    const previous = entries.find((item) => item.id === id)
    const next = {
      ...previous,
      ...input,
      id,
      type,
      version: (previous?.version || 0) + 1,
          updatedAt: new Date().toISOString(),
          hidden: previous?.hidden || false,
          deleted: previous?.deleted || false,
        } as EntryRecord
    entries = previous
      ? entries.map((item) => item.id === id ? next : item)
      : [next, ...entries]
    updateLog('entry.save', type, id, Object.keys(input))
    return { id, version: next.version } as T
  }
  if (action === 'setEntryStatus' || action === 'setPromotion') {
    const id = String(payload.id || '')
    entries = entries.map((item) => item.id === id
      ? {
          ...item,
          ...payload,
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog(action, String(payload.type || 'entry'), id, Object.keys(payload))
    return { id } as T
  }
  if (action === 'toggleEntryHidden') {
    const id = String(payload.id || '')
    const hidden = Boolean(payload.hidden)
    entries = entries.map((item) => item.id === id
      ? {
          ...item,
          hidden,
          hiddenAt: hidden ? new Date().toISOString() : '',
          hiddenByUid: hidden ? 'mock-super-admin' : '',
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog(hidden ? 'entry.hidden' : 'entry.unhidden', String(payload.type || 'entry'), id, ['hidden'])
    return { id, hidden } as T
  }
  if (action === 'deleteEntry') {
    const id = String(payload.id || '')
    entries = entries.map((item) => item.id === id
      ? {
          ...item,
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedByUid: 'mock-super-admin',
          hidden: true,
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog('entry.delete', String(payload.type || 'entry'), id, ['deleted'])
    return { id, deleted: true } as T
  }
  if (action === 'listFeedbacks') {
    const status = String(payload.status || '')
    const filtered = feedbacks.filter((item) => !status || item.status === status)
    return page(filterKeyword(filtered, payload.keyword)) as T
  }
  if (action === 'resolveFeedback') {
    const id = String(payload.id || '')
    feedbacks = feedbacks.map((item) => item.id === id
      ? {
          ...item,
          status: 'resolved',
          resolution: String(payload.resolution || ''),
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog('feedback.resolve', 'feedback', id, ['status', 'resolution'])
    return { id } as T
  }
  if (action === 'listComments') {
    const status = String(payload.status || '')
    const includeHidden = Boolean(payload.includeHidden)
    const filtered = comments.filter((item) => {
      if (item.deleted) return false
      if (status === 'hidden') return item.hidden
      if (!includeHidden && item.hidden) return false
      return !status || item.status === status
    })
    return {
      ...page(filterKeyword(filtered, payload.keyword)),
      policy: commentPolicy,
    } as T
  }
  if (action === 'reviewComment') {
    const id = String(payload.id || '')
    comments = comments.map((item) => item.id === id
      ? {
          ...item,
          status: String(payload.status || 'pending') as CommentRecord['status'],
          moderationReason: String(payload.moderationReason || ''),
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog('comment.review', 'comment', id, ['status'])
    return { id } as T
  }
  if (action === 'toggleCommentHidden') {
    const id = String(payload.id || '')
    const hidden = Boolean(payload.hidden)
    comments = comments.map((item) => item.id === id
      ? {
          ...item,
          hidden,
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog(hidden ? 'comment.hidden' : 'comment.unhidden', 'comment', id, ['hidden'])
    return { id, hidden } as T
  }
  if (action === 'deleteComment') {
    const id = String(payload.id || '')
    comments = comments.map((item) => item.id === id
      ? {
          ...item,
          deleted: true,
          hidden: true,
          version: item.version + 1,
          updatedAt: new Date().toISOString(),
        }
      : item)
    updateLog('comment.delete', 'comment', id, ['deleted'])
    return { id, deleted: true } as T
  }
  if (action === 'updateCommentPolicy') {
    const input = (payload.policy || {}) as Partial<CommentPolicy>
    commentPolicy = {
      ...commentPolicy,
      blockedWords: Array.isArray(input.blockedWords) ? input.blockedWords : [],
      reviewWords: Array.isArray(input.reviewWords) ? input.reviewWords : [],
      notice: String(input.notice || commentPolicy.notice),
      version: commentPolicy.version + 1,
      updatedAt: new Date().toISOString(),
    }
    updateLog('comment.policy.update', 'config', 'comment_policy', ['blockedWords', 'reviewWords'])
    return { item: commentPolicy, version: commentPolicy.version } as T
  }
  if (action === 'getConfig') return { item: customerService } as T
  if (action === 'updateConfig') {
    customerService = {
      ...customerService,
      ...((payload.config || {}) as typeof customerService),
      version: customerService.version + 1,
    }
    updateLog('config.update', 'config', customerService.id, ['phone', 'wechat', 'description'])
    return { version: customerService.version } as T
  }
  if (action === 'importEntries') {
    const importedRows = Array.isArray(payload.rows) ? payload.rows : []
    return {
      inserted: importedRows.length,
      updated: 0,
      failed: 0,
      errors: [],
    } as T
  }
  if (action === 'listAdminLogs') return page(logs) as T
  throw new Error(`模拟 API 未实现动作：${action}`)
}
