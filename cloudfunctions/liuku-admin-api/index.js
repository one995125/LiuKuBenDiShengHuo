const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const {
  ENTRY_COLLECTIONS,
  ENTRY_TYPES,
  calculateEvidenceRetainUntil,
  getRequiredEvidenceTypes,
  getRequiredVerificationKeys,
  createEntryDocument,
  createId,
  mapSubmissionToEntry,
  normalizeCursor,
  normalizePageSize,
  normalizeStatus,
  sanitizeImportRows,
  sanitizeText,
  serializeValue,
} = require('./admin-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const nodeApp = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const command = db.command
const auth = nodeApp.auth()

const SERVICE_NAME = 'liuku-admin-api'
const SERVICE_VERSION = '1.2.0'
const APP_ID_ENV_NAME = 'LIUKU_ALLOWED_APP_ID'
const ADMIN_COLLECTION = 'liuku_admins'
const SUBMISSION_COLLECTION = 'liuku_submissions'
const FEEDBACK_COLLECTION = 'liuku_feedbacks'
const COMMENT_COLLECTION = 'liuku_comments'
const LOG_COLLECTION = 'liuku_admin_logs'
const CONFIG_COLLECTION = 'liuku_configs'
const COMMENT_POLICY_CONFIG_ID = 'comment_policy'
const COMMENT_STATUSES = ['pending', 'approved', 'rejected']

/**
 * 运营管理云函数统一入口。
 *
 * 小程序开发期调用使用可信 OPENID；网页后台调用使用 CloudBase Auth UID。
 * 所有管理动作都必须通过 liuku_admins 白名单，客户端不能直接读写数据库。
 */
exports.main = async (event = {}) => {
  const requestId = sanitizeText(event.requestId, 80) || createId('req')
  const action = sanitizeText(event.action, 40) || 'health'
  const payload = isPlainObject(event.payload) ? event.payload : {}

  try {
    const allowedAppId = requireAllowedAppId()
    const identity = await resolveIdentity(allowedAppId)

    if (action === 'health') {
      return success({
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        authenticated: true,
        identity: maskIdentity(identity.uid),
        channel: identity.channel,
        serverTime: new Date().toISOString(),
      }, requestId)
    }

    const admin = await requireAdmin(identity, allowedAppId)
    const context = { identity, admin, requestId, allowedAppId }

    switch (action) {
      case 'adminHealth':
      case 'adminSession':
        return success(createSessionData(context), requestId)
      case 'dashboard':
        return success(await loadDashboard(), requestId)
      case 'listSubmissions':
        return success(await listSubmissions(payload), requestId)
      case 'getSubmission':
        return success(await getSubmissionForReview(payload), requestId)
      case 'reviewSubmission':
        return success(await reviewSubmission(payload, context), requestId)
      case 'listEntries':
        return success(await listEntries(payload), requestId)
      case 'getEntry':
        return success(await getEntry(payload), requestId)
      case 'saveEntry':
        return success(await saveEntry(payload, context), requestId)
      case 'setEntryStatus':
        return success(await setEntryStatus(payload, context), requestId)
      case 'setPromotion':
        return success(await setPromotion(payload, context), requestId)
      case 'toggleEntryHidden':
        return success(await toggleEntryHidden(payload, context), requestId)
      case 'deleteEntry':
        return success(await deleteEntry(payload, context), requestId)
      case 'listFeedbacks':
        return success(await listFeedbacks(payload), requestId)
      case 'resolveFeedback':
        return success(await resolveFeedback(payload, context), requestId)
      case 'listComments':
        return success(await listComments(payload), requestId)
      case 'reviewComment':
        return success(await reviewComment(payload, context), requestId)
      case 'toggleCommentHidden':
        return success(await toggleCommentHidden(payload, context), requestId)
      case 'deleteComment':
        return success(await deleteComment(payload, context), requestId)
      case 'updateCommentPolicy':
        return success(await updateCommentPolicy(payload, context), requestId)
      case 'getConfig':
        return success(await getConfig(payload), requestId)
      case 'updateConfig':
        return success(await updateConfig(payload, context), requestId)
      case 'importEntries':
        return success(await importEntries(payload, context), requestId)
      case 'closeJobChannel':
        return success(await closeJobChannel(payload, context), requestId)
      case 'listAdminLogs':
        return success(await listAdminLogs(payload), requestId)
      default:
        return failure('UNSUPPORTED_ACTION', '不支持该管理操作', requestId)
    }
  } catch (error) {
    const normalized = normalizeError(error)
    console.error('管理操作失败', {
      action,
      requestId,
      code: normalized.code,
      message: normalized.debug || normalized.message,
    })
    return failure(normalized.code, normalized.message, requestId, normalized.debug)
  }
}

async function resolveIdentity(allowedAppId) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const appid = wxContext.APPID || ''

  if (openid) {
    if (appid !== allowedAppId) {
      throw appError('APP_NOT_ALLOWED', '当前小程序无权调用该云函数')
    }
    return {
      uid: openid,
      openid,
      appid,
      channel: 'miniprogram',
      username: '',
    }
  }

  try {
    const result = await auth.getEndUserInfo()
    const userInfo = result && result.userInfo ? result.userInfo : {}
    const uid = sanitizeText(userInfo.uid, 128)
    if (!uid) {
      throw new Error('CloudBase Auth session is empty')
    }
    return {
      uid,
      openid: sanitizeText(userInfo.openId, 128),
      appid: sanitizeText(userInfo.appId, 128),
      channel: 'web',
      username: sanitizeText(userInfo.username || userInfo.email, 120),
    }
  } catch (error) {
    throw appError(
      'UNAUTHENTICATED',
      '登录状态已失效，请重新登录',
      error && error.message ? error.message : '',
    )
  }
}

async function requireAdmin(identity, allowedAppId) {
  const admin = await getDocument(ADMIN_COLLECTION, identity.uid, false)
  if (!admin || admin.enabled !== true) {
    throw appError('ADMIN_FORBIDDEN', '当前账号没有管理权限')
  }
  if (identity.channel === 'miniprogram' && admin.appid && admin.appid !== allowedAppId) {
    throw appError('ADMIN_FORBIDDEN', '管理员来源应用不匹配')
  }
  return {
    uid: identity.uid,
    displayName: sanitizeText(admin.displayName, 80) || identity.username || '超级管理员',
    role: admin.role === 'super_admin' ? admin.role : 'super_admin',
  }
}

function createSessionData({ identity, admin }) {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    identity: maskIdentity(identity.uid),
    channel: identity.channel,
    admin,
    environment: process.env.TCB_ENV || process.env.SCF_NAMESPACE || '',
    serverTime: new Date().toISOString(),
  }
}

async function loadDashboard() {
  const [
    publishedMerchants,
    publishedRentals,
    publishedOffers,
    pendingSubmissions,
    pendingFeedbacks,
  ] = await Promise.all([
    countWhere(ENTRY_COLLECTIONS.merchant, { status: 'published', hidden: command.neq(true), deleted: command.neq(true) }),
    countWhere(ENTRY_COLLECTIONS.rental, { status: 'published', hidden: command.neq(true), deleted: command.neq(true) }),
    countWhere(ENTRY_COLLECTIONS.offer, { status: 'published', hidden: command.neq(true), deleted: command.neq(true) }),
    countWhere(SUBMISSION_COLLECTION, { status: 'pending', type: command.in(['merchant', 'rental']) }),
    countWhere(FEEDBACK_COLLECTION, { status: 'pending' }),
  ])
  const recentFeedbacks = await listDocuments(FEEDBACK_COLLECTION, {
    status: 'pending',
    pageSize: 5,
  })
  const recentSubmissionResult = await listDocuments(SUBMISSION_COLLECTION, {
    status: 'pending',
    pageSize: 10,
  })
  const recentSubmissions = recentSubmissionResult.items
    .filter((item) => item.type === 'merchant' || item.type === 'rental')
    .slice(0, 5)

  return {
    counts: {
      pendingSubmissions,
      publishedEntries: publishedMerchants + publishedRentals + publishedOffers,
      pendingFeedbacks,
      pendingComments: 0,
      activePromotions: await countActivePromotions(),
      activeOffers: publishedOffers,
    },
    recentSubmissions,
    recentFeedbacks: recentFeedbacks.items,
    serverTime: new Date().toISOString(),
  }
}

async function listSubmissions(payload) {
  const result = await listDocuments(SUBMISSION_COLLECTION, {
    status: normalizeStatus(payload.status, true),
    keyword: sanitizeText(payload.keyword, 60),
    keywordFields: ['title', 'contactName', 'phone'],
    cursor: payload.cursor,
    pageSize: payload.pageSize,
  })
  result.items = result.items.filter((item) => item.type === 'merchant' || item.type === 'rental')
  return result
}

async function getSubmissionForReview(payload) {
  const item = await getDocument(SUBMISSION_COLLECTION, payload.id)
  if (item.type !== 'merchant' && item.type !== 'rental') {
    throw appError('CHANNEL_DISABLED', '招聘频道暂未开放')
  }
  return { item }
}

async function listEntries(payload) {
  const type = normalizeEntryType(payload.type)
  if (type === 'job') throw appError('CHANNEL_DISABLED', '招聘频道暂未开放')
  return listDocuments(ENTRY_COLLECTIONS[type], {
    status: normalizeStatus(payload.status, true),
    category: type === 'merchant' ? sanitizeText(payload.category, 40) : '',
    keyword: sanitizeText(payload.keyword, 60),
    keywordFields: type === 'merchant'
      ? ['name', 'category', 'subCategory', 'area', 'phone', 'phonesSearch', 'address', 'tags']
      : type === 'job'
        ? ['title', 'companyName', 'contact']
        : type === 'rental'
          ? ['title', 'location', 'contact']
          : ['title', 'merchantName', 'summary', 'description', 'phone'],
    filterDeleted: true,
    filterHidden: !Boolean(payload.includeHidden),
    cursor: payload.cursor,
    pageSize: payload.pageSize,
  })
}

async function getEntry(payload) {
  const type = normalizeEntryType(payload.type)
  if (type === 'job') throw appError('CHANNEL_DISABLED', '招聘频道暂未开放')
  return {
    item: await getDocument(ENTRY_COLLECTIONS[type], payload.id),
  }
}

async function listFeedbacks(payload) {
  return listDocuments(FEEDBACK_COLLECTION, {
    status: sanitizeText(payload.status, 20),
    keyword: sanitizeText(payload.keyword, 60),
    keywordFields: ['entryTitle', 'content', 'contact'],
    cursor: payload.cursor,
    pageSize: payload.pageSize,
  })
}

async function listAdminLogs(payload) {
  return listDocuments(LOG_COLLECTION, {
    cursor: payload.cursor,
    pageSize: payload.pageSize,
    orderField: 'createdAt',
  })
}

async function reviewSubmission(payload, context) {
  const submissionId = sanitizeText(payload.id, 120)
  const decision = payload.decision === 'approve' ? 'approve' : payload.decision === 'reject' ? 'reject' : ''
  const expectedVersion = normalizeVersion(payload.expectedVersion)
  const rejectReason = sanitizeText(payload.rejectReason, 300)

  if (!submissionId || !decision) {
    throw appError('INVALID_ARGUMENT', '审核参数不完整')
  }
  if (decision === 'reject' && !rejectReason) {
    throw appError('REJECT_REASON_REQUIRED', '拒绝投稿时必须填写原因')
  }
  if (decision === 'approve') {
    const preview = await getDocument(SUBMISSION_COLLECTION, submissionId)
    await assertChannelMutationAllowed(preview.type)
  }

  const logId = createId('log')
  const result = await db.runTransaction(async (transaction) => {
    const submissionResult = await transaction
      .collection(SUBMISSION_COLLECTION)
      .doc(submissionId)
      .get()
    const submission = submissionResult && submissionResult.data
    if (!submission) {
      throw appError('NOT_FOUND', '投稿不存在')
    }
    if (submission.type === 'job') {
      throw appError('CHANNEL_DISABLED', '招聘频道暂未开放')
    }
    assertVersion(submission, expectedVersion)
    if (submission.status !== 'pending') {
      throw appError('INVALID_STATUS', '只有待审核投稿可以执行审核')
    }

    const now = db.serverDate()
    const nextVersion = normalizeVersion(submission.version) + 1
    let entryType = ''
    let entryId = ''

    if (decision === 'approve') {
      const verification = buildVerifiedSubmission(payload, submission, context)
      entryType = submission.type === 'service'
        ? 'merchant'
        : submission.type === 'promotion'
          ? 'offer'
          : submission.type
      normalizeEntryType(entryType)
      entryId = submission.publishedEntryId || submissionId
      const mapped = mapSubmissionToEntry(submission)
      const normalized = createEntryDocument(entryType, {
        ...mapped,
        ...(isPlainObject(payload.entry) ? payload.entry : {}),
      }, {
        id: entryId,
        status: 'published',
        sourceType: 'submission',
        sourceSubmissionId: submissionId,
        appid: context.allowedAppId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdByUid: context.admin.uid,
        updatedByUid: context.admin.uid,
        sourceSubmissionId: submissionId,
        submitterRole: submission.submitterRole || '',
        evidenceFiles: submission.evidenceFiles || [],
        verification,
        checkedAt: new Date().toISOString(),
        reviewDueAt: calculateEvidenceRetainUntil(),
      })

      await transaction.collection(ENTRY_COLLECTIONS[entryType]).doc(entryId).set({
        data: normalized,
      })
    }

    const verification = decision === 'approve'
      ? buildVerifiedSubmission(payload, submission, context)
      : {
          status: 'rejected',
          checks: {},
          verifiedByUid: context.admin.uid,
          verifiedAt: new Date().toISOString(),
          note: rejectReason,
        }
    await transaction.collection(SUBMISSION_COLLECTION).doc(submissionId).update({
      data: {
        status: decision === 'approve' ? 'published' : 'rejected',
        rejectReason: decision === 'reject' ? rejectReason : '',
        reviewedByUid: context.admin.uid,
        reviewedAt: now,
        publishedEntryType: entryType,
        publishedEntryId: entryId,
        verification,
        evidenceRetainUntil: decision === 'reject' ? calculateEvidenceRetainUntil() : '',
        version: nextVersion,
        updatedAt: now,
      },
    })

    await transaction.collection(LOG_COLLECTION).doc(logId).set({
      data: createLogDocument(context, {
        id: logId,
        action: decision === 'approve' ? 'submission.approve' : 'submission.reject',
        targetType: 'submission',
        targetId: submissionId,
        changedFields: decision === 'approve'
          ? ['status', 'publishedEntryType', 'publishedEntryId']
          : ['status', 'rejectReason'],
        createdAt: now,
      }),
    })

    return {
      id: submissionId,
      status: decision === 'approve' ? 'published' : 'rejected',
      publishedEntryType: entryType,
      publishedEntryId: entryId,
      version: nextVersion,
    }
  })

  return serializeValue(result)
}

async function saveEntry(payload, context) {
  const type = normalizeEntryType(payload.type)
  await assertChannelMutationAllowed(type)
  const input = isPlainObject(payload.entry) ? payload.entry : {}
  const existingId = sanitizeText(input.id || payload.id, 120)
  const id = existingId || createId(type)
  const existing = existingId
    ? await getDocument(ENTRY_COLLECTIONS[type], existingId, false)
    : null
  assertNotDeleted(existing)
  assertVersion(existing, normalizeVersion(payload.expectedVersion), Boolean(existing))

  const now = db.serverDate()
  const nextVersion = existing ? normalizeVersion(existing.version) + 1 : 1
  const document = createEntryDocument(type, input, {
    ...(existing || {}),
    id,
    appid: context.allowedAppId,
    status: normalizeStatus(input.status) || (existing && existing.status) || 'draft',
    sourceType: existing && existing.sourceType ? existing.sourceType : 'admin',
    version: nextVersion,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now,
    createdByUid: existing && existing.createdByUid ? existing.createdByUid : context.admin.uid,
    updatedByUid: context.admin.uid,
  })
  if (document.verification && document.verification.status === 'verified') {
    document.verification.verifiedByUid = context.admin.uid
    document.verification.verifiedAt = new Date().toISOString()
    document.checkedAt = document.checkedAt || document.verification.verifiedAt
    document.reviewDueAt = document.reviewDueAt || calculateEvidenceRetainUntil()
  }
  if (document.status === 'published' && (type === 'merchant' || type === 'rental')) {
    assertEntryVerified(document)
  }

  await db.collection(ENTRY_COLLECTIONS[type]).doc(id).set({ data: document })
  await writeLog(context, {
    action: existing ? 'entry.update' : 'entry.create',
    targetType: type,
    targetId: id,
    changedFields: Object.keys(input).filter((key) => !['images'].includes(key)).slice(0, 30),
  })
  return { id, version: nextVersion }
}

async function setEntryStatus(payload, context) {
  const type = normalizeEntryType(payload.type)
  const id = sanitizeText(payload.id, 120)
  const status = normalizeStatus(payload.status)
  if (status === 'published') await assertChannelMutationAllowed(type)
  if (!id || !status) {
    throw appError('INVALID_ARGUMENT', '内容状态参数不完整')
  }
  const item = await getDocument(ENTRY_COLLECTIONS[type], id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))
  const nextVersion = normalizeVersion(item.version) + 1
  if (status === 'published' && (type === 'merchant' || type === 'rental')) {
    assertEntryVerified(item)
  }

  await db.collection(ENTRY_COLLECTIONS[type]).doc(id).update({
    data: {
      status,
      version: nextVersion,
      updatedAt: db.serverDate(),
      updatedByUid: context.admin.uid,
    },
  })
  if (status === 'offline' && item.sourceSubmissionId) {
    await scheduleEvidenceRetention(item.sourceSubmissionId)
  }
  await writeLog(context, {
    action: `entry.status.${status}`,
    targetType: type,
    targetId: id,
    changedFields: ['status'],
  })
  return { id, status, version: nextVersion }
}

async function setPromotion(payload, context) {
  const type = normalizeEntryType(payload.type)
  await assertChannelMutationAllowed(type)
  const id = sanitizeText(payload.id, 120)
  const item = await getDocument(ENTRY_COLLECTIONS[type], id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))
  const nextVersion = normalizeVersion(item.version) + 1
  const patch = {
    isTop: Boolean(payload.isTop),
    topUntil: sanitizeDate(payload.topUntil),
    isFeatured: Boolean(payload.isFeatured),
    featuredUntil: sanitizeDate(payload.featuredUntil),
    isPaid: Boolean(payload.isPaid),
    paidType: sanitizeText(payload.paidType, 80),
    chargeUntil: sanitizeDate(payload.chargeUntil),
    adminNote: sanitizeText(payload.adminNote, 500),
    reviewDueAt: sanitizeDate(payload.reviewDueAt),
    version: nextVersion,
    updatedAt: db.serverDate(),
    updatedByUid: context.admin.uid,
  }
  await db.collection(ENTRY_COLLECTIONS[type]).doc(id).update({ data: patch })
  await writeLog(context, {
    action: 'entry.promotion.update',
    targetType: type,
    targetId: id,
    changedFields: Object.keys(patch).filter((key) => !['updatedAt', 'updatedByUid', 'version'].includes(key)),
  })
  return { id, version: nextVersion }
}

async function toggleEntryHidden(payload, context) {
  const type = normalizeEntryType(payload.type)
  const id = sanitizeText(payload.id, 120)
  if (!id) {
    throw appError('INVALID_ARGUMENT', '内容 ID 不能为空')
  }
  const item = await getDocument(ENTRY_COLLECTIONS[type], id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))

  const hidden = Boolean(payload.hidden)
  const nextVersion = normalizeVersion(item.version) + 1
  await db.collection(ENTRY_COLLECTIONS[type]).doc(id).update({
    data: {
      hidden,
      hiddenAt: hidden ? db.serverDate() : '',
      hiddenByUid: hidden ? context.admin.uid : '',
      version: nextVersion,
      updatedAt: db.serverDate(),
      updatedByUid: context.admin.uid,
    },
  })
  await writeLog(context, {
    action: hidden ? 'entry.hidden' : 'entry.unhidden',
    targetType: type,
    targetId: id,
    changedFields: ['hidden', 'hiddenAt', 'hiddenByUid'],
  })
  return { id, hidden, version: nextVersion }
}

async function deleteEntry(payload, context) {
  const type = normalizeEntryType(payload.type)
  const id = sanitizeText(payload.id, 120)
  if (!id) {
    throw appError('INVALID_ARGUMENT', '内容 ID 不能为空')
  }
  const item = await getDocument(ENTRY_COLLECTIONS[type], id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))

  const nextVersion = normalizeVersion(item.version) + 1
  await db.collection(ENTRY_COLLECTIONS[type]).doc(id).update({
    data: {
      deleted: true,
      deletedAt: db.serverDate(),
      deletedByUid: context.admin.uid,
      hidden: true,
      hiddenAt: db.serverDate(),
      hiddenByUid: context.admin.uid,
      version: nextVersion,
      updatedAt: db.serverDate(),
      updatedByUid: context.admin.uid,
    },
  })
  if (item.sourceSubmissionId) {
    await scheduleEvidenceRetention(item.sourceSubmissionId)
  }
  await writeLog(context, {
    action: 'entry.delete',
    targetType: type,
    targetId: id,
    changedFields: ['deleted', 'deletedAt', 'deletedByUid', 'hidden'],
  })
  return { id, deleted: true, version: nextVersion }
}

async function listComments(payload) {
  const statusFilter = sanitizeText(payload.status, 20)
  const keyword = sanitizeText(payload.keyword, 60)
  const cursor = normalizeCursor(payload.cursor)
  const pageSize = normalizePageSize(payload.pageSize)
  const conditions = [{ deleted: command.neq(true) }]

  if (statusFilter === 'hidden') {
    conditions.push({ hidden: true })
  } else {
    if (statusFilter) {
      if (!COMMENT_STATUSES.includes(statusFilter)) {
        throw appError('INVALID_COMMENT_STATUS', '评论状态不合法')
      }
      conditions.push({ status: statusFilter })
    }
    if (!Boolean(payload.includeHidden)) {
      conditions.push({ hidden: command.neq(true) })
    }
  }

  const entryId = sanitizeText(payload.entryId, 120)
  if (entryId) {
    conditions.push({ entryType: 'merchant', entryId })
  }
  if (keyword) {
    const regexp = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    conditions.push(command.or([
      { content: regexp },
      { entryTitle: regexp },
      { moderationReason: regexp },
    ]))
  }

  let query = db.collection(COMMENT_COLLECTION)
  query = conditions.length === 1
    ? query.where(conditions[0])
    : query.where(command.and(conditions))
  const result = await query
    .orderBy('createdAt', 'desc')
    .skip(cursor)
    .limit(pageSize + 1)
    .get()
  const items = Array.isArray(result.data) ? result.data.map(serializeValue) : []
  const hasMore = items.length > pageSize
  const visibleItems = hasMore ? items.slice(0, pageSize) : items
  return {
    items: visibleItems,
    nextCursor: hasMore ? String(cursor + visibleItems.length) : '',
    hasMore,
    policy: await loadCommentPolicy(),
  }
}

async function reviewComment(payload, context) {
  const id = sanitizeText(payload.id, 120)
  const status = sanitizeText(payload.status, 20)
  const moderationReason = sanitizeText(payload.moderationReason, 300)
  if (!id || !COMMENT_STATUSES.includes(status)) {
    throw appError('INVALID_ARGUMENT', '评论审核参数不完整')
  }
  const item = await getDocument(COMMENT_COLLECTION, id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))

  const nextVersion = normalizeVersion(item.version) + 1
  await db.collection(COMMENT_COLLECTION).doc(id).update({
    data: {
      status,
      moderationReason,
      reviewedByUid: context.admin.uid,
      reviewedAt: db.serverDate(),
      version: nextVersion,
      updatedAt: db.serverDate(),
    },
  })
  await writeLog(context, {
    action: `comment.review.${status}`,
    targetType: 'comment',
    targetId: id,
    changedFields: ['status', 'moderationReason'],
  })
  return { id, status, version: nextVersion }
}

async function toggleCommentHidden(payload, context) {
  const id = sanitizeText(payload.id, 120)
  if (!id) {
    throw appError('INVALID_ARGUMENT', '评论 ID 不能为空')
  }
  const item = await getDocument(COMMENT_COLLECTION, id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))

  const hidden = Boolean(payload.hidden)
  const nextVersion = normalizeVersion(item.version) + 1
  await db.collection(COMMENT_COLLECTION).doc(id).update({
    data: {
      hidden,
      hiddenAt: hidden ? db.serverDate() : '',
      hiddenByUid: hidden ? context.admin.uid : '',
      version: nextVersion,
      updatedAt: db.serverDate(),
    },
  })
  await writeLog(context, {
    action: hidden ? 'comment.hidden' : 'comment.unhidden',
    targetType: 'comment',
    targetId: id,
    changedFields: ['hidden', 'hiddenAt', 'hiddenByUid'],
  })
  return { id, hidden, version: nextVersion }
}

async function deleteComment(payload, context) {
  const id = sanitizeText(payload.id, 120)
  if (!id) {
    throw appError('INVALID_ARGUMENT', '评论 ID 不能为空')
  }
  const item = await getDocument(COMMENT_COLLECTION, id)
  assertNotDeleted(item)
  assertVersion(item, normalizeVersion(payload.expectedVersion))

  const nextVersion = normalizeVersion(item.version) + 1
  await db.collection(COMMENT_COLLECTION).doc(id).update({
    data: {
      deleted: true,
      deletedAt: db.serverDate(),
      deletedByUid: context.admin.uid,
      hidden: true,
      hiddenAt: db.serverDate(),
      hiddenByUid: context.admin.uid,
      version: nextVersion,
      updatedAt: db.serverDate(),
    },
  })
  await writeLog(context, {
    action: 'comment.delete',
    targetType: 'comment',
    targetId: id,
    changedFields: ['deleted', 'deletedAt', 'deletedByUid', 'hidden'],
  })
  return { id, deleted: true, version: nextVersion }
}

async function updateCommentPolicy(payload, context) {
  const input = isPlainObject(payload.policy) ? payload.policy : {}
  const existing = await getDocument(CONFIG_COLLECTION, COMMENT_POLICY_CONFIG_ID, false)
  assertVersion(existing, normalizeVersion(payload.expectedVersion), Boolean(existing))
  const nextVersion = existing ? normalizeVersion(existing.version) + 1 : 1
  const policy = normalizeCommentPolicy(input)
  const document = {
    id: COMMENT_POLICY_CONFIG_ID,
    ...policy,
    version: nextVersion,
    updatedAt: db.serverDate(),
    updatedByUid: context.admin.uid,
  }
  await db.collection(CONFIG_COLLECTION).doc(COMMENT_POLICY_CONFIG_ID).set({ data: document })
  await writeLog(context, {
    action: 'comment.policy.update',
    targetType: 'config',
    targetId: COMMENT_POLICY_CONFIG_ID,
    changedFields: ['blockedWords', 'reviewWords', 'notice'],
  })
  return { item: serializeValue(document), version: nextVersion }
}

async function resolveFeedback(payload, context) {
  const id = sanitizeText(payload.id, 120)
  const resolution = sanitizeText(payload.resolution, 500)
  if (!id || !resolution) {
    throw appError('INVALID_ARGUMENT', '处理结果不能为空')
  }
  const item = await getDocument(FEEDBACK_COLLECTION, id)
  assertVersion(item, normalizeVersion(payload.expectedVersion))
  const nextVersion = normalizeVersion(item.version) + 1

  await db.collection(FEEDBACK_COLLECTION).doc(id).update({
    data: {
      status: 'resolved',
      resolution,
      handledByUid: context.admin.uid,
      handledAt: db.serverDate(),
      version: nextVersion,
      updatedAt: db.serverDate(),
    },
  })
  await writeLog(context, {
    action: 'feedback.resolve',
    targetType: 'feedback',
    targetId: id,
    changedFields: ['status', 'resolution'],
  })
  return { id, status: 'resolved', version: nextVersion }
}

async function getConfig(payload) {
  const id = sanitizeText(payload.id, 80) || 'customer_service'
  const item = await getDocument(CONFIG_COLLECTION, id, false)
  return {
    item: item || {
      id,
      phone: '',
      wechat: '',
      description: '客服用于信息纠错、投诉反馈和商家合作。',
      version: 0,
    },
  }
}

async function updateConfig(payload, context) {
  const id = sanitizeText(payload.id, 80) || 'customer_service'
  const input = isPlainObject(payload.config) ? payload.config : {}
  const existing = await getDocument(CONFIG_COLLECTION, id, false)
  assertVersion(existing, normalizeVersion(payload.expectedVersion), Boolean(existing))
  const nextVersion = existing ? normalizeVersion(existing.version) + 1 : 1
  const document = {
    id,
    phone: sanitizeText(input.phone, 30),
    wechat: sanitizeText(input.wechat, 80),
    description: sanitizeText(input.description, 300),
    version: nextVersion,
    updatedAt: db.serverDate(),
    updatedByUid: context.admin.uid,
  }
  await db.collection(CONFIG_COLLECTION).doc(id).set({ data: document })
  await writeLog(context, {
    action: 'config.update',
    targetType: 'config',
    targetId: id,
    changedFields: ['phone', 'wechat', 'description'],
  })
  return { id, version: nextVersion }
}

async function importEntries(payload, context) {
  const type = normalizeEntryType(payload.type)
  await assertChannelMutationAllowed(type)
  const validation = sanitizeImportRows(type, payload.rows)
  if (validation.errors.length > 0) {
    throw appError('IMPORT_VALIDATION_FAILED', '导入数据校验失败', JSON.stringify(validation.errors.slice(0, 20)))
  }

  const summary = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] }
  for (const row of validation.rows) {
    try {
      const id = `${type}_${row.sourceCode.toLowerCase()}`
      const existing = await getDocument(ENTRY_COLLECTIONS[type], id, false)
      const now = db.serverDate()
      const document = createEntryDocument(type, row, {
        ...(existing || {}),
        id,
        appid: context.allowedAppId,
        status: row.status || 'draft',
        sourceType: 'import',
        sourceCode: row.sourceCode,
        version: existing ? normalizeVersion(existing.version) + 1 : 1,
        createdAt: existing && existing.createdAt ? existing.createdAt : now,
        updatedAt: now,
        createdByUid: existing && existing.createdByUid ? existing.createdByUid : context.admin.uid,
        updatedByUid: context.admin.uid,
      })
      if (document.status === 'published' && (type === 'merchant' || type === 'rental')) {
        assertEntryVerified(document)
      }
      await db.collection(ENTRY_COLLECTIONS[type]).doc(id).set({ data: document })
      summary[existing ? 'updated' : 'inserted'] += 1
    } catch (error) {
      summary.failed += 1
      summary.errors.push({
        sourceCode: row.sourceCode,
        message: error && error.message ? error.message : '写入失败',
      })
    }
  }

  await writeLog(context, {
    action: 'entry.import',
    targetType: type,
    targetId: createId('import'),
    changedFields: [`inserted:${summary.inserted}`, `updated:${summary.updated}`, `failed:${summary.failed}`],
  })
  return summary
}

/**
 * 招聘频道一次性收口动作。该动作不在常规后台提供按钮，必须先完成外部备份，
 * 再用固定确认串调用；每次最多处理 100 条，可根据 hasMore 重复执行。
 */
async function closeJobChannel(payload, context) {
  if (payload.backupConfirmed !== true || payload.confirm !== 'CLOSE_JOB_CHANNEL_AFTER_BACKUP') {
    throw appError('BACKUP_CONFIRM_REQUIRED', '请先导出招聘及投稿备份，再确认执行频道收口')
  }

  await db.collection(CONFIG_COLLECTION).doc('channel_policy').set({
    data: {
      channels: {
        merchant: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
        rental: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
        job: { publicVisible: false, submissionEnabled: false, adminPublishingEnabled: false },
      },
      version: 1,
      updatedAt: db.serverDate(),
      updatedByUid: context.admin.uid,
    },
  })

  const [jobResult, submissionResult] = await Promise.all([
    db.collection(ENTRY_COLLECTIONS.job).where({ status: 'published' }).limit(100).get(),
    db.collection(SUBMISSION_COLLECTION).where({ type: 'job', status: 'pending' }).limit(100).get(),
  ])
  const jobs = Array.isArray(jobResult.data) ? jobResult.data : []
  const submissions = Array.isArray(submissionResult.data) ? submissionResult.data : []

  for (const item of jobs) {
    await db.collection(ENTRY_COLLECTIONS.job).doc(item._id).update({
      data: {
        status: 'offline',
        version: normalizeVersion(item.version) + 1,
        updatedAt: db.serverDate(),
        updatedByUid: context.admin.uid,
      },
    })
  }
  for (const item of submissions) {
    await db.collection(SUBMISSION_COLLECTION).doc(item._id).update({
      data: {
        status: 'rejected',
        rejectReason: '招聘频道暂未开放',
        reviewedByUid: context.admin.uid,
        reviewedAt: db.serverDate(),
        evidenceRetainUntil: calculateEvidenceRetainUntil(),
        version: normalizeVersion(item.version) + 1,
        updatedAt: db.serverDate(),
      },
    })
  }

  await writeLog(context, {
    action: 'channel.job.close',
    targetType: 'channel',
    targetId: 'job',
    changedFields: [`jobsOffline:${jobs.length}`, `submissionsRejected:${submissions.length}`],
  })
  return {
    jobsOffline: jobs.length,
    submissionsRejected: submissions.length,
    hasMore: jobs.length === 100 || submissions.length === 100,
  }
}

async function listDocuments(collectionName, options = {}) {
  const cursor = normalizeCursor(options.cursor)
  const pageSize = normalizePageSize(options.pageSize)
  const conditions = []
  if (options.filterDeleted) conditions.push({ deleted: command.neq(true) })
  if (options.filterHidden) conditions.push({ hidden: command.neq(true) })
  if (options.status) conditions.push({ status: options.status })
  if (options.category) conditions.push({ category: options.category })
  if (options.keyword && Array.isArray(options.keywordFields) && options.keywordFields.length > 0) {
    const regexp = db.RegExp({ regexp: escapeRegExp(options.keyword), options: 'i' })
    conditions.push(command.or(options.keywordFields.map((field) => ({ [field]: regexp }))))
  }

  let query = db.collection(collectionName)
  if (conditions.length === 1) query = query.where(conditions[0])
  if (conditions.length > 1) query = query.where(command.and(conditions))
  const result = await query
    .orderBy(options.orderField || 'updatedAt', 'desc')
    .skip(cursor)
    .limit(pageSize + 1)
    .get()
  const items = Array.isArray(result.data) ? result.data.map(serializeValue) : []
  const hasMore = items.length > pageSize
  const visibleItems = hasMore ? items.slice(0, pageSize) : items
  return {
    items: visibleItems,
    nextCursor: hasMore ? String(cursor + visibleItems.length) : '',
    hasMore,
  }
}

async function countWhere(collectionName, where) {
  const result = await db.collection(collectionName).where(where).count()
  return Number(result.total || 0)
}

async function countActivePromotions() {
  const results = await Promise.all(ENTRY_TYPES.map(async (type) => {
    const collection = db.collection(ENTRY_COLLECTIONS[type])
    const [top, featured] = await Promise.all([
      collection.where({ isTop: true, deleted: command.neq(true), hidden: command.neq(true) }).count(),
      collection.where({ isFeatured: true, deleted: command.neq(true), hidden: command.neq(true) }).count(),
    ])
    return Number(top.total || 0) + Number(featured.total || 0)
  }))
  return results.reduce((sum, value) => sum + value, 0)
}

async function getDocument(collectionName, id, required = true) {
  const documentId = sanitizeText(id, 120)
  if (!documentId) {
    if (required) throw appError('INVALID_ARGUMENT', '记录 ID 不能为空')
    return null
  }
  try {
    const result = await db.collection(collectionName).doc(documentId).get()
    return result && result.data ? serializeValue(result.data) : null
  } catch (error) {
    if (isDocumentNotFound(error)) {
      if (required) throw appError('NOT_FOUND', '记录不存在')
      return null
    }
    throw error
  }
}

async function writeLog(context, input) {
  const id = createId('log')
  await db.collection(LOG_COLLECTION).doc(id).set({
    data: createLogDocument(context, {
      id,
      ...input,
      createdAt: db.serverDate(),
    }),
  })
}

function createLogDocument(context, input) {
  return {
    actorUid: context.admin.uid,
    actorName: context.admin.displayName,
    actorRole: context.admin.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    changedFields: Array.isArray(input.changedFields) ? input.changedFields.slice(0, 50) : [],
    requestId: context.requestId,
    createdAt: input.createdAt,
  }
}

function assertVersion(document, expectedVersion, required = true) {
  if (!document) {
    if (required) throw appError('NOT_FOUND', '记录不存在')
    return
  }
  if (normalizeVersion(document.version) !== expectedVersion) {
    throw appError('VERSION_CONFLICT', '记录已被其他操作更新，请刷新后重试')
  }
}

function assertNotDeleted(document) {
  if (document && document.deleted === true) {
    throw appError('CONTENT_DELETED', '已删除内容不能继续修改')
  }
}

async function loadCommentPolicy() {
  const item = await getDocument(CONFIG_COLLECTION, COMMENT_POLICY_CONFIG_ID, false)
  return {
    id: COMMENT_POLICY_CONFIG_ID,
    ...normalizeCommentPolicy(item || {}),
    version: normalizeVersion(item && item.version),
    updatedAt: item && item.updatedAt ? item.updatedAt : '',
  }
}

function normalizeCommentPolicy(input) {
  return {
    blockedWords: sanitizeWordList(input.blockedWords),
    reviewWords: sanitizeWordList(input.reviewWords),
    notice: sanitizeText(
      input.notice,
      200,
    ) || '评论提交后先进入人工审核，审核通过后展示。',
  }
}

function sanitizeWordList(value) {
  const source = Array.isArray(value)
    ? value
    : sanitizeText(value, 2000).split(/[\n,，|]/)
  return source
    .map((item) => sanitizeText(item, 40))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 200)
}

function normalizeEntryType(value) {
  const type = sanitizeText(value, 20)
  if (!ENTRY_TYPES.includes(type)) {
    throw appError('INVALID_ENTRY_TYPE', '信息类型不合法')
  }
  return type
}

async function assertChannelMutationAllowed(type) {
  if (type === 'job') {
    throw appError('CHANNEL_DISABLED', '招聘频道暂未开放，禁止新增、发布、推荐或导入')
  }
  if (type !== 'merchant' && type !== 'rental') return
  try {
    const result = await db.collection(CONFIG_COLLECTION).doc('channel_policy').get()
    const channel = result && result.data && result.data.channels && result.data.channels[type]
    if (channel && channel.adminPublishingEnabled === false) {
      throw appError('CHANNEL_DISABLED', '该频道已暂停后台发布')
    }
  } catch (error) {
    if (error && error.code === 'CHANNEL_DISABLED') throw error
    // 配置读取失败时招聘仍由上方硬锁关闭；商家和房源沿用安全默认开启。
  }
}

function buildVerifiedSubmission(payload, submission, context) {
  const checks = isPlainObject(payload.verificationChecks) ? payload.verificationChecks : {}
  const required = getRequiredVerificationKeys(submission.type, submission.submitterRole)
  if (required.some((key) => checks[key] !== true)) {
    throw appError('VERIFICATION_INCOMPLETE', '必核项目未全部完成，不能发布')
  }
  assertRequiredEvidence(submission)
  return {
    status: 'verified',
    checks: required.reduce((result, key) => ({ ...result, [key]: true }), {}),
    verifiedByUid: context.admin.uid,
    verifiedAt: new Date().toISOString(),
    note: sanitizeText(payload.verificationNote, 500),
  }
}

function assertEntryVerified(item) {
  if (!item || !item.verification || item.verification.status !== 'verified') {
    throw appError('VERIFICATION_REQUIRED', '商家或房源完成核验后才能发布')
  }
  assertRequiredEvidence(item)
  const required = getRequiredVerificationKeys(item.type, item.submitterRole)
  if (required.some((key) => !item.verification.checks || item.verification.checks[key] !== true)) {
    throw appError('VERIFICATION_INCOMPLETE', '必核项目未全部完成，不能发布')
  }
}

function assertRequiredEvidence(item) {
  const required = getRequiredEvidenceTypes(item.type, item.submitterRole)
  const actual = new Set(Array.isArray(item.evidenceFiles)
    ? item.evidenceFiles.map((file) => file && file.type).filter(Boolean)
    : [])
  if (required.some((type) => !actual.has(type))) {
    throw appError('EVIDENCE_REQUIRED', '角色对应的核验材料不完整，不能发布')
  }
}

async function scheduleEvidenceRetention(submissionId) {
  try {
    await db.collection(SUBMISSION_COLLECTION).doc(submissionId).update({
      data: { evidenceRetainUntil: calculateEvidenceRetainUntil(), updatedAt: db.serverDate() },
    })
  } catch (error) {
    console.warn('设置核验材料保留期限失败', { submissionId, message: error && error.message })
  }
}

function normalizeVersion(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function sanitizeDate(value) {
  const text = sanitizeText(value, 30)
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
    throw appError('INVALID_DATE', '日期格式应为 YYYY-MM-DD')
  }
  return text
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function success(data, requestId) {
  return {
    ok: true,
    code: 'OK',
    message: '调用成功',
    data: serializeValue(data),
    requestId,
  }
}

function failure(code, message, requestId, debug = '') {
  return {
    ok: false,
    code,
    message,
    data: null,
    requestId,
    ...(debug ? { debug } : {}),
  }
}

function appError(code, message, debug = '') {
  const error = new Error(message)
  error.code = code
  error.debug = debug
  return error
}

function requireAllowedAppId() {
  const allowedAppId = String(process.env[APP_ID_ENV_NAME] || '').trim()
  if (!allowedAppId) {
    throw appError(
      'APP_ID_NOT_CONFIGURED',
      '云函数未配置来源 AppID',
      `请在云函数环境变量 ${APP_ID_ENV_NAME} 中配置正式 AppID`,
    )
  }
  return allowedAppId
}

function normalizeError(error) {
  if (error && error.code && typeof error.code === 'string') {
    return {
      code: error.code,
      message: error.message || '操作失败',
      debug: error.debug || '',
    }
  }
  return {
    code: 'ADMIN_OPERATION_FAILED',
    message: '管理操作失败，请稍后重试',
    debug: error && error.message ? error.message : '',
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isDocumentNotFound(error) {
  const message = error && error.message ? String(error.message) : ''
  return Boolean(error && (error.errCode === -502005 || error.code === 'DATABASE_DOCUMENT_NOT_FOUND')) ||
    /does not exist|not found/i.test(message)
}

function maskIdentity(identity) {
  if (!identity || identity.length <= 8) return '***'
  return `${identity.slice(0, 4)}***${identity.slice(-4)}`
}
