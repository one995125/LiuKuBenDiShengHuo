import { CLOUD_BASE_CONFIG } from '../constants/cloud-base'
import { STORAGE_KEYS } from '../constants/local-life'
import type {
  FeedbackSubmission,
  EvidenceFileInput,
  MerchantComment,
  Submission,
  SubmitCommentInput,
  SubmitEntryInput,
  SubmitFeedbackInput,
  UserProfile,
} from '../types/local-life'
import {
  filterUserScopedItems,
  matchesUserDataScope,
  type UserDataIdentity,
} from '../utils/user-data-scope'
import { callCloudApi, type CloudApiResponse } from './cloud-base'
import {
  listMySubmissions as listLocalSubmissions,
  submitEntry as submitLocalEntry,
  submitFeedback as submitLocalFeedback,
} from './local-life'

export type UserDataSource = 'cloud' | 'cache' | 'local' | 'unavailable'
export type PendingOperationKind = 'submission' | 'feedback'

interface PendingOperationBase {
  id: string
  requestId: string
  kind: PendingOperationKind
  /** 草稿归属只能使用用户云函数返回的可信身份，禁止页面传入。 */
  ownerOpenid: string
  appid: string
  createdAt: string
  updatedAt: string
  attempts: number
  lastError: string
}

export interface PendingSubmissionOperation extends PendingOperationBase {
  kind: 'submission'
  input: SubmitEntryInput
}

export interface PendingFeedbackOperation extends PendingOperationBase {
  kind: 'feedback'
  input: SubmitFeedbackInput
}

export type PendingUserOperation = PendingSubmissionOperation | PendingFeedbackOperation

export interface SubmitEntryResult {
  item: Submission
  source: 'cloud' | 'local'
}

export interface SubmitFeedbackResult {
  source: 'cloud' | 'local'
  item?: FeedbackSubmission
}

export interface SubmitCommentResult {
  source: 'cloud' | 'local'
  item: MerchantComment
}

export interface UserSubmissionListResult {
  items: Submission[]
  source: UserDataSource
  stale: boolean
  error: string
  pendingOperations: PendingUserOperation[]
}

export interface UserProfileResult {
  profile: UserProfile
  source: UserDataSource
  stale: boolean
  error: string
}

export interface UserDataSelfCheckDraft {
  id: string
  kind: PendingOperationKind
  title: string
  updatedAt: string
  attempts: number
  lastError: string
  recoverable: boolean
  recoveryMessage: string
}

export interface UserDataSelfCheckResult {
  generatedAt: string
  logTag: string
  userDataEnabled: boolean
  identityOk: boolean
  identityLabel: string
  identityError: string
  submissionSource: UserDataSource
  submissionCount: number
  submissionError: string
  profileSource: UserDataSource
  profileError: string
  currentDrafts: UserDataSelfCheckDraft[]
  isolatedDraftCount: number
  latestCloudFailure: string
  retryStatus: string
  summaryLines: string[]
  detailLines: string[]
}

export interface SaveUserProfileInput {
  nickname: string
  avatarPath: string
  avatarFileId: string
}

export interface RetryOperationResult {
  kind: PendingOperationKind
  item?: Submission
}

export interface PendingFeedbackListResult {
  items: PendingFeedbackOperation[]
  error: string
}

interface SubmitEntryCloudData {
  item: Submission
  serverTime: number
}

interface ListMySubmissionsCloudData {
  items: Submission[]
  nextCursor: string
  hasMore: boolean
  serverTime: number
}

interface SubmitFeedbackCloudData {
  id: string
  status: 'pending'
  createdAt: string
  serverTime: number
}

interface SubmitCommentCloudData {
  item: MerchantComment
  serverTime: number
}

interface UserProfileCloudData {
  profile: UserProfile
  serverTime: number
}

interface UserSubmissionCache {
  ownerOpenid: string
  appid: string
  items: Submission[]
  updatedAt: string
}

interface UserProfileCache {
  ownerOpenid: string
  appid: string
  profile: UserProfile
  updatedAt: string
}

const EMPTY_USER_PROFILE: UserProfile = {
  publicId: '',
  nickname: '',
  avatarFileId: '',
  avatarUrl: '',
  hasProfile: false,
  updatedAt: '',
}

const PROFILE_READ_RETRY_DELAY_MS = 300

/**
 * 表示云端提交失败但本地草稿已经保存。
 * 页面捕获该错误后不得删除本地图片，否则后续重试会失去上传源文件。
 */
export const USER_DATA_SELF_CHECK_LOG_TAG = '[LIUKU_SELF_CHECK]'

export class UserOperationQueuedError extends Error {
  readonly draftId: string

  constructor(message: string, draftId: string) {
    super(message)
    this.name = 'UserOperationQueuedError'
    this.draftId = draftId
  }
}

export function isUserOperationQueuedError(error: unknown): error is UserOperationQueuedError {
  return error instanceof UserOperationQueuedError
}

/**
 * 读取当前微信用户的轻登录资料。
 *
 * 调用时机：进入“我的”页时调用。该接口只依赖可信 openid，不弹授权窗；
 * 头像和昵称必须由用户在页面上主动选择/填写后再保存。
 */
export async function getMyUserProfile(): Promise<UserProfileResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    return {
      profile: { ...EMPTY_USER_PROFILE },
      source: 'local',
      stale: false,
      error: '',
    }
  }

  let identity: UserDataIdentity
  try {
    identity = await getCloudIdentity()
  } catch (error) {
    return {
      profile: { ...EMPTY_USER_PROFILE },
      source: 'unavailable',
      stale: true,
      error: getErrorMessage(error),
    }
  }

  try {
    const response = await readCloudUserProfileWithRetry()
    if (!response.ok || !response.data || !response.data.profile) {
      throw new Error(response.message || '读取用户资料失败')
    }
    const profile = normalizeUserProfile(response.data.profile)
    writeUserProfileCache(identity, profile)
    return {
      profile,
      source: 'cloud',
      stale: false,
      error: '',
    }
  } catch (error) {
    const cached = readUserProfileCache(identity)
    return {
      profile: cached || { ...EMPTY_USER_PROFILE },
      source: cached ? 'cache' : 'unavailable',
      stale: true,
      error: getErrorMessage(error),
    }
  }
}

/**
 * 用户资料读取是幂等操作。云函数实例冷启动或数据库发生一次性抖动时，
 * 仅对传输异常和 USER_OPERATION_FAILED 自动重试一次，避免发布页直接进入错误态。
 * 鉴权、来源 AppID、参数等确定性错误不会重试，仍交由页面明确提示用户。
 */
async function readCloudUserProfileWithRetry(): Promise<CloudApiResponse<UserProfileCloudData>> {
  try {
    const firstResponse = await callCloudApi<UserProfileCloudData>('userApi', 'getMyProfile')
    if (firstResponse.ok || firstResponse.code !== 'USER_OPERATION_FAILED') {
      return firstResponse
    }
  } catch (error) {
    console.warn('首次读取用户资料失败，准备自动重试', error)
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, PROFILE_READ_RETRY_DELAY_MS)
  })
  return callCloudApi<UserProfileCloudData>('userApi', 'getMyProfile')
}

/**
 * 保存头像昵称资料。
 *
 * 参数说明：
 * - nickname：用户主动输入或从微信昵称键盘选择的昵称。
 * - avatarPath：chooseAvatar 返回的临时头像路径；已是 cloud:// 时会直接复用。
 * - avatarFileId：当前已保存头像 fileID，用户未重新选择头像时继续保留。
 */
export async function saveMyUserProfile(input: SaveUserProfileInput): Promise<UserProfileResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    const profile = normalizeUserProfile({
      publicId: 'local',
      nickname: input.nickname,
      avatarFileId: input.avatarFileId,
      avatarUrl: input.avatarPath || input.avatarFileId,
      hasProfile: Boolean(input.nickname && (input.avatarPath || input.avatarFileId)),
      updatedAt: nowText(),
    })
    return {
      profile,
      source: 'local',
      stale: false,
      error: '',
    }
  }

  const identity = await getCloudIdentity()
  const avatarFileId = await uploadProfileAvatar(
    input.avatarPath,
    input.avatarFileId,
    identity.openid,
  )
  const response = await callCloudApi<UserProfileCloudData>(
    'userApi',
    'saveMyProfile',
    {
      input: {
        nickname: input.nickname,
        avatarFileId,
      },
    },
  )
  if (!response.ok || !response.data || !response.data.profile) {
    throw new Error(response.message || '保存用户资料失败')
  }

  const profile = normalizeUserProfile(response.data.profile)
  writeUserProfileCache(identity, profile)
  return {
    profile,
    source: 'cloud',
    stale: false,
    error: '',
  }
}

/**
 * 提交用户发布。
 *
 * 调用时机：发布页完成必填校验后调用。
 * 本地模式：直接复用旧 storage 逻辑，确保当前原型继续可用。
 * 云端模式：先写入重试草稿，再上传图片和调用用户云函数；失败时保留草稿。
 */
export async function submitUserEntry(input: SubmitEntryInput): Promise<SubmitEntryResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    return {
      item: submitLocalEntry(input),
      source: 'local',
    }
  }

  const identity = await getCloudIdentity()
  const operation = createSubmissionOperation(input, identity)
  appendPendingOperation(operation)
  return executeQueuedSubmission(operation, identity)
}

/**
 * 提交纠错或投诉。
 *
 * 云端模式同样使用请求标识和本地草稿，避免弱网时用户填写内容丢失。
 */
export async function submitUserFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    return {
      item: submitLocalFeedback(input),
      source: 'local',
    }
  }

  const identity = await getCloudIdentity()
  const operation = createFeedbackOperation(input, identity)
  appendPendingOperation(operation)
  return executeQueuedFeedback(operation, identity)
}

/**
 * 读取当前微信账号尚未提交成功的私密反馈。
 *
 * 投稿草稿由“我的投稿”处理；这里只把纠错/投诉草稿交给帮助页展示。
 */
export async function listPendingFeedbackOperations(): Promise<PendingFeedbackListResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    return { items: [], error: '' }
  }

  try {
    const identity = await getCloudIdentity()
    const scopedOperations = listPendingUserOperations(identity)
    return {
      items: scopedOperations.filter(
        (item): item is PendingFeedbackOperation => item.kind === 'feedback',
      ),
      error: '',
    }
  } catch (error) {
    return {
      items: [],
      error: getErrorMessage(error),
    }
  }
}

/**
 * 提交商家评论。
 *
 * 调用时机：商家详情页完成评分和文字校验后调用。
 * 评论属于用户生成内容，云函数会再次校验商家状态、违禁词和当前 openid；
 * 首版全部进入 pending，页面不得把返回结果插入已展示评论列表。
 */
export async function submitMerchantComment(input: SubmitCommentInput): Promise<SubmitCommentResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    const now = nowText()
    return {
      source: 'local',
      item: {
        id: makeRequestId('comment'),
        entryType: 'merchant',
        entryId: input.entryId,
        rating: input.rating,
        content: input.content.trim(),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    }
  }

  const requestId = makeRequestId('comment')
  const response = await callCloudApi<SubmitCommentCloudData>(
    'userApi',
    'submitComment',
    {
      clientRequestId: requestId,
      input,
    },
  )
  if (!response.ok || !response.data || !response.data.item) {
    throw new Error(response.message || '评论提交失败')
  }
  return {
    source: 'cloud',
    item: response.data.item,
  }
}

/**
 * 读取“我的发布”。
 *
 * 云端失败时优先返回最近一次云缓存；首次无缓存时回退旧本地投稿。
 * pendingOperations 单独返回，页面可展示“待重试”而不伪装成已提交记录。
 */
export async function listUserSubmissions(): Promise<UserSubmissionListResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    return {
      items: listLocalSubmissions(),
      source: 'local',
      stale: false,
      error: '',
      pendingOperations: [],
    }
  }

  let identity: UserDataIdentity
  try {
    identity = await getCloudIdentity()
  } catch (error) {
    // 无法确认当前微信身份时不读取任何旧缓存，避免账号切换后泄露上一用户数据。
    return {
      items: [],
      source: 'unavailable',
      stale: true,
      error: getErrorMessage(error),
      pendingOperations: [],
    }
  }

  const pendingOperations = listPendingUserOperations(identity)
  try {
    const items = await fetchAllCloudSubmissions()
    writeSubmissionCache(identity, items)
    return {
      items,
      source: 'cloud',
      stale: false,
      error: '',
      pendingOperations,
    }
  } catch (error) {
    const message = getErrorMessage(error)
    const cached = readSubmissionCache(identity)
    return {
      // 云模式只允许回退当前身份绑定的缓存，不再展示未标记归属的旧本地投稿。
      items: cached,
      source: cached.length > 0 ? 'cache' : 'unavailable',
      stale: true,
      error: message,
      pendingOperations,
    }
  }
}

/**
 * 用户数据自检，只读取现有服务层状态，不自动重试、不直接写入业务数据。
 *
 * 调用时机：隐藏验收入口触发时手动执行。
 * 检查内容：当前账号归属、离线草稿恢复能力、云端回退来源、最近失败原因和重试状态。
 */
export async function runUserDataSelfCheck(): Promise<UserDataSelfCheckResult> {
  const generatedAt = nowText()
  const allDrafts = readAllPendingUserOperations()
  let identity: UserDataIdentity | null = null
  let identityError = ''

  if (CLOUD_BASE_CONFIG.features.userData) {
    try {
      identity = await getCloudIdentity()
    } catch (error) {
      identityError = getErrorMessage(error)
    }
  } else {
    identityError = '用户云端功能未开启，当前为本地模式'
  }

  const submissionResult: UserSubmissionListResult = await listUserSubmissions().catch((error) => ({
    items: [],
    source: 'unavailable',
    stale: true,
    error: getErrorMessage(error),
    pendingOperations: [],
  }))
  const profileResult: UserProfileResult = await getMyUserProfile().catch((error) => ({
    profile: { ...EMPTY_USER_PROFILE },
    source: 'unavailable',
    stale: true,
    error: getErrorMessage(error),
  }))
  const currentDraftSource = identity ? filterUserScopedItems(allDrafts, identity) : []
  const currentDrafts = await Promise.all(currentDraftSource.map(toSelfCheckDraft))
  const isolatedDraftCount = identity ? allDrafts.length - currentDrafts.length : allDrafts.length
  const retryableCount = currentDrafts.filter((item) => item.recoverable).length
  const blockedCount = currentDrafts.length - retryableCount
  const latestCloudFailure = resolveLatestCloudFailure(
    identityError,
    submissionResult,
    profileResult,
    currentDrafts,
  )
  const retryStatus = currentDrafts.length === 0
    ? '当前账号没有待重试草稿'
    : `当前账号 ${currentDrafts.length} 条待重试，${retryableCount} 条可恢复，${blockedCount} 条需要先处理`
  const identityLabel = identity
    ? `${maskIdentityValue(identity.openid)} / ${identity.appid}`
    : '未确认当前微信账号'
  const summaryLines = [
    `自检时间：${generatedAt}`,
    `当前账号：${identityLabel}`,
    `我的发布来源：${getUserDataSourceLabel(submissionResult.source)}，记录 ${submissionResult.items.length} 条`,
    `离线草稿：当前账号 ${currentDrafts.length} 条，隔离其他账号 ${isolatedDraftCount} 条`,
    `重试状态：${retryStatus}`,
    `最近云端失败：${latestCloudFailure || '未发现'}`,
  ]
  const detailLines = buildSelfCheckDetailLines(
    identityError,
    submissionResult,
    profileResult,
    currentDrafts,
    isolatedDraftCount,
  )

  return {
    generatedAt,
    logTag: USER_DATA_SELF_CHECK_LOG_TAG,
    userDataEnabled: CLOUD_BASE_CONFIG.features.userData,
    identityOk: Boolean(identity),
    identityLabel,
    identityError,
    submissionSource: submissionResult.source,
    submissionCount: submissionResult.items.length,
    submissionError: submissionResult.error,
    profileSource: profileResult.source,
    profileError: profileResult.error,
    currentDrafts,
    isolatedDraftCount,
    latestCloudFailure,
    retryStatus,
    summaryLines,
    detailLines,
  }
}

function readAllPendingUserOperations(): PendingUserOperation[] {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.userOperationDrafts)
    if (!Array.isArray(value)) return []
    return value
      .filter(isPendingOperation)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  } catch (error) {
    console.warn('读取云投稿重试草稿失败', error)
    return []
  }
}

function listPendingUserOperations(identity: UserDataIdentity): PendingUserOperation[] {
  return filterUserScopedItems(readAllPendingUserOperations(), identity)
}

async function toSelfCheckDraft(operation: PendingUserOperation): Promise<UserDataSelfCheckDraft> {
  const recovery = await checkDraftRecovery(operation)
  return {
    id: operation.id,
    kind: operation.kind,
    title: getPendingOperationTitle(operation),
    updatedAt: operation.updatedAt,
    attempts: operation.attempts,
    lastError: operation.lastError,
    recoverable: recovery.recoverable,
    recoveryMessage: recovery.message,
  }
}

async function checkDraftRecovery(
  operation: PendingUserOperation,
): Promise<{ recoverable: boolean; message: string }> {
  if (operation.kind === 'feedback') {
    return {
      recoverable: true,
      message: '反馈草稿内容完整，网络或云服务恢复后可重试',
    }
  }

  const images = operation.input.images.filter(Boolean)
  if (images.length === 0) {
    return {
      recoverable: true,
      message: '投稿草稿无图片依赖，可直接重试',
    }
  }

  const checks = await Promise.all(images.map(checkImageAccessibleForRetry))
  const missingCount = checks.filter((item) => !item).length
  if (missingCount > 0) {
    return {
      recoverable: false,
      message: `有 ${missingCount}/${images.length} 张本地图片不可访问，重试前需要重新发布或重新选择图片`,
    }
  }

  return {
    recoverable: true,
    message: `已确认 ${images.length} 张图片可用于重试`,
  }
}

function checkImageAccessibleForRetry(filePath: string): Promise<boolean> {
  if (!filePath || filePath.startsWith('cloud://')) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    try {
      wx.getFileSystemManager().access({
        path: filePath,
        success: () => resolve(true),
        fail: () => resolve(false),
      })
    } catch (error) {
      console.warn(`${USER_DATA_SELF_CHECK_LOG_TAG} 检查草稿图片失败`, error)
      resolve(false)
    }
  })
}

function getPendingOperationTitle(operation: PendingUserOperation): string {
  if (operation.kind === 'submission') {
    return operation.input.title || '未命名投稿'
  }
  return operation.input.entryTitle || (operation.input.type === 'complaint' ? '投诉反馈' : '信息纠错')
}

function getUserDataSourceLabel(source: UserDataSource): string {
  const labels: Record<UserDataSource, string> = {
    cloud: '云端实时',
    cache: '当前账号云缓存回退',
    local: '本地模式',
    unavailable: '不可用',
  }
  return labels[source]
}

function resolveLatestCloudFailure(
  identityError: string,
  submissionResult: UserSubmissionListResult,
  profileResult: UserProfileResult,
  drafts: UserDataSelfCheckDraft[],
): string {
  if (identityError) return `身份确认失败：${identityError}`
  if (submissionResult.error && submissionResult.source !== 'cloud') {
    return `我的发布读取失败：${submissionResult.error}`
  }
  if (profileResult.error && profileResult.source !== 'cloud') {
    return `用户资料读取失败：${profileResult.error}`
  }
  const failedDraft = drafts.find((item) => item.lastError)
  return failedDraft ? `${failedDraft.title}：${failedDraft.lastError}` : ''
}

function buildSelfCheckDetailLines(
  identityError: string,
  submissionResult: UserSubmissionListResult,
  profileResult: UserProfileResult,
  drafts: UserDataSelfCheckDraft[],
  isolatedDraftCount: number,
): string[] {
  const lines: string[] = []
  if (identityError) {
    lines.push(`身份检查：${identityError}`)
  } else {
    lines.push('身份检查：已通过 liuku-user-api identity 确认当前微信账号')
  }
  if (submissionResult.error) {
    lines.push(`云端回退：我的发布当前为 ${getUserDataSourceLabel(submissionResult.source)}，原因：${submissionResult.error}`)
  } else {
    lines.push(`云端回退：我的发布当前为 ${getUserDataSourceLabel(submissionResult.source)}`)
  }
  if (profileResult.error) {
    lines.push(`资料回退：${getUserDataSourceLabel(profileResult.source)}，原因：${profileResult.error}`)
  }
  if (drafts.length === 0) {
    lines.push('草稿恢复：当前账号没有待重试草稿')
  } else {
    drafts.forEach((draft) => {
      const kindLabel = draft.kind === 'submission' ? '投稿' : '反馈'
      const retryLabel = draft.recoverable ? '可重试' : '需处理'
      const lastError = draft.lastError ? `；最近错误：${draft.lastError}` : ''
      lines.push(
        `草稿恢复：${kindLabel}「${draft.title}」${retryLabel}，已尝试 ${draft.attempts} 次；${draft.recoveryMessage}${lastError}`,
      )
    })
  }
  if (isolatedDraftCount > 0) {
    lines.push(`账号隔离：本机另有 ${isolatedDraftCount} 条其他账号草稿，当前账号不会展示或重试这些草稿`)
  } else {
    lines.push('账号隔离：未发现其他账号草稿')
  }
  return lines
}

function maskIdentityValue(value: string): string {
  if (!value) return '未获取'
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}***${value.slice(-4)}`
}

/**
 * 重试一条失败操作。
 *
 * 必须沿用原 requestId，云函数会用 openid + requestId 生成固定文档 ID，
 * 从而保证“请求成功但客户端未收到响应”时不会创建重复投稿。
 */
export async function retryPendingUserOperation(id: string): Promise<RetryOperationResult> {
  if (!CLOUD_BASE_CONFIG.features.userData) {
    throw new Error('云投稿功能尚未启用')
  }

  const identity = await getCloudIdentity()
  const operation = readAllPendingUserOperations().find((item) => item.id === id)
  if (!operation) {
    throw new Error('重试草稿不存在或已处理')
  }
  if (!matchesUserDataScope(operation, identity)) {
    throw new Error('该草稿不属于当前微信账号，不能重试')
  }

  if (operation.kind === 'submission') {
    const result = await executeQueuedSubmission(operation, identity)
    return {
      kind: operation.kind,
      item: result.item,
    }
  }

  await executeQueuedFeedback(operation, identity)
  return {
    kind: operation.kind,
  }
}

async function executeQueuedSubmission(
  operation: PendingSubmissionOperation,
  verifiedIdentity?: UserDataIdentity,
): Promise<SubmitEntryResult> {
  try {
    const identity = verifiedIdentity || await getCloudIdentity()
    if (!matchesUserDataScope(operation, identity)) {
      throw new Error('投稿草稿与当前微信账号不匹配')
    }
    const cloudPublicImages = await uploadSubmissionFiles(
      operation.input.publicImages || operation.input.images,
      identity.openid,
      operation.requestId,
      'public',
    )
    const cloudEvidenceFiles: EvidenceFileInput[] = []
    for (let index = 0; index < operation.input.evidenceFiles.length; index += 1) {
      const evidence = operation.input.evidenceFiles[index]
      const [fileId] = await uploadSubmissionFiles(
        [evidence.fileId],
        identity.openid,
        operation.requestId,
        'evidence',
        index,
      )
      cloudEvidenceFiles.push({ type: evidence.type, fileId })
    }
    const response = await callCloudApi<SubmitEntryCloudData>(
      'userApi',
      'submitEntry',
      {
        clientRequestId: operation.requestId,
        input: {
          ...operation.input,
          images: cloudPublicImages,
          publicImages: cloudPublicImages,
          evidenceFiles: cloudEvidenceFiles,
        },
      },
    )
    if (response.code === 'USER_PUBLISH_DISABLED' || response.code === 'CHANNEL_DISABLED') {
      removePendingOperation(operation.id)
      cleanupSubmissionLocalFiles(operation.input)
      throw new Error(response.message || '该频道暂未开放投稿')
    }
    if (!response.ok || !response.data || !response.data.item) {
      throw new Error(response.message || '云端投稿失败')
    }

    const item = normalizeSubmission(response.data.item)
    const draftRemoved = removePendingOperation(operation.id)
    mergeSubmissionCache(identity, item)
    if (draftRemoved) {
      cleanupSubmissionLocalFiles(operation.input)
    }
    return {
      item,
      source: 'cloud',
    }
  } catch (error) {
    const message = getErrorMessage(error)
    markPendingOperationFailed(operation.id, message)
    throw new UserOperationQueuedError(message, operation.id)
  }
}

async function executeQueuedFeedback(
  operation: PendingFeedbackOperation,
  verifiedIdentity?: UserDataIdentity,
): Promise<SubmitFeedbackResult> {
  try {
    const identity = verifiedIdentity || await getCloudIdentity()
    if (!matchesUserDataScope(operation, identity)) {
      throw new Error('反馈草稿与当前微信账号不匹配')
    }
    const response = await callCloudApi<SubmitFeedbackCloudData>(
      'userApi',
      'submitFeedback',
      {
        clientRequestId: operation.requestId,
        input: operation.input,
      },
    )
    if (!response.ok || !response.data || !response.data.id) {
      throw new Error(response.message || '云端反馈提交失败')
    }

    removePendingOperation(operation.id)
    return {
      source: 'cloud',
    }
  } catch (error) {
    const message = getErrorMessage(error)
    markPendingOperationFailed(operation.id, message)
    throw new UserOperationQueuedError(message, operation.id)
  }
}

async function getCloudIdentity(): Promise<UserDataIdentity> {
  const response = await callCloudApi<{ openid: string; appid: string }>('userApi', 'identity')
  if (!response.ok || !response.data || !response.data.openid || !response.data.appid) {
    throw new Error(response.message || '无法识别当前微信用户')
  }
  return {
    openid: response.data.openid,
    appid: response.data.appid,
  }
}

async function uploadSubmissionFiles(
  localImages: string[],
  openid: string,
  requestId: string,
  folder: 'public' | 'evidence',
  indexOffset = 0,
): Promise<string[]> {
  if (localImages.length === 0) return []
  if (!wx.cloud) {
    throw new Error('当前基础库不支持云存储')
  }

  const fileIds: string[] = []
  for (let index = 0; index < localImages.length; index += 1) {
    const filePath = localImages[index]
    if (filePath.startsWith('cloud://')) {
      fileIds.push(filePath)
      continue
    }

    const extension = getFileExtension(filePath)
    const cloudPath = `liuku/submissions/${openid}/${requestId}/${folder}/${String(index + indexOffset + 1).padStart(2, '0')}.${extension}`
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath,
      config: {
        env: CLOUD_BASE_CONFIG.environmentId,
      },
    })
    if (!result.fileID) {
      throw new Error(`第 ${index + 1} 张图片上传失败`)
    }
    fileIds.push(result.fileID)
  }
  return fileIds
}

async function uploadProfileAvatar(
  avatarPath: string,
  currentFileId: string,
  openid: string,
): Promise<string> {
  const filePath = avatarPath || currentFileId
  if (!filePath) return ''
  if (filePath.startsWith('cloud://')) return filePath
  if (!wx.cloud) {
    throw new Error('当前基础库不支持云存储')
  }

  const extension = getFileExtension(filePath)
  const cloudPath = `liuku/users/${openid}/avatar/avatar_${Date.now().toString(36)}.${extension}`
  const result = await wx.cloud.uploadFile({
    cloudPath,
    filePath,
    config: {
      env: CLOUD_BASE_CONFIG.environmentId,
    },
  })
  if (!result.fileID) {
    throw new Error('头像上传失败')
  }
  return result.fileID
}

async function fetchAllCloudSubmissions(): Promise<Submission[]> {
  const items: Submission[] = []
  let cursor = ''
  let requestCount = 0

  // 限制最多读取 5 页，防止异常游标造成无限请求；运营后台后续负责归档历史数据。
  while (requestCount < 5) {
    const response = await callCloudApi<ListMySubmissionsCloudData>(
      'userApi',
      'listMySubmissions',
      {
        cursor,
        pageSize: 50,
      },
    )
    if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
      throw new Error(response.message || '读取我的发布失败')
    }

    items.push(...response.data.items.map(normalizeSubmission))
    if (!response.data.hasMore || !response.data.nextCursor) {
      break
    }
    cursor = response.data.nextCursor
    requestCount += 1
  }

  return items.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

function createSubmissionOperation(
  input: SubmitEntryInput,
  identity: UserDataIdentity,
): PendingSubmissionOperation {
  const now = nowText()
  const requestId = makeRequestId('submission')
  return {
    id: requestId,
    requestId,
    kind: 'submission',
    ownerOpenid: identity.openid,
    appid: identity.appid,
    input: {
      ...input,
      images: [...input.images],
      publicImages: [...input.publicImages],
      evidenceFiles: input.evidenceFiles.map((item) => ({ ...item })),
      declarations: { ...input.declarations },
    },
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: '',
  }
}

function createFeedbackOperation(
  input: SubmitFeedbackInput,
  identity: UserDataIdentity,
): PendingFeedbackOperation {
  const now = nowText()
  const requestId = makeRequestId('feedback')
  return {
    id: requestId,
    requestId,
    kind: 'feedback',
    ownerOpenid: identity.openid,
    appid: identity.appid,
    input: {
      ...input,
    },
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: '',
  }
}

function appendPendingOperation(operation: PendingUserOperation): void {
  const current = readAllPendingUserOperations()
  writePendingOperations([operation, ...current.filter((item) => item.id !== operation.id)])
}

function markPendingOperationFailed(id: string, message: string): void {
  const current = readAllPendingUserOperations()
  const next = current.map((item) => item.id === id
    ? {
      ...item,
      attempts: item.attempts + 1,
      lastError: message.slice(0, 160),
      updatedAt: nowText(),
    }
    : item)
  try {
    writePendingOperations(next)
  } catch (error) {
    console.error('更新失败草稿状态失败', error)
  }
}

function removePendingOperation(id: string): boolean {
  try {
    writePendingOperations(readAllPendingUserOperations().filter((item) => item.id !== id))
    return true
  } catch (error) {
    // 云端已经成功时，本地草稿清理失败不应让页面误判投稿失败；服务端幂等可避免重复数据。
    console.warn('清理已完成的重试草稿失败', error)
    return false
  }
}

function writePendingOperations(items: PendingUserOperation[]): void {
  wx.setStorageSync(STORAGE_KEYS.userOperationDrafts, items.slice(0, 50))
}

function readSubmissionCache(identity: UserDataIdentity): Submission[] {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.userSubmissionCache) as Partial<UserSubmissionCache>
    if (!value || !matchesUserDataScope(value, identity) || !Array.isArray(value.items)) {
      return []
    }
    return value.items.map(normalizeSubmission)
  } catch (error) {
    console.warn('读取我的发布缓存失败', error)
    return []
  }
}

function writeSubmissionCache(identity: UserDataIdentity, items: Submission[]): void {
  try {
    const cache: UserSubmissionCache = {
      ownerOpenid: identity.openid,
      appid: identity.appid,
      items,
      updatedAt: nowText(),
    }
    wx.setStorageSync(STORAGE_KEYS.userSubmissionCache, cache)
  } catch (error) {
    // 缓存仅用于弱网回退，写入失败不能影响已经成功的云端请求。
    console.warn('写入我的发布缓存失败', error)
  }
}

function readUserProfileCache(identity: UserDataIdentity): UserProfile | null {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.userProfileCache) as Partial<UserProfileCache>
    if (!value || !matchesUserDataScope(value, identity) || !value.profile) {
      return null
    }
    return normalizeUserProfile(value.profile)
  } catch (error) {
    console.warn('读取用户资料缓存失败', error)
    return null
  }
}

function writeUserProfileCache(identity: UserDataIdentity, profile: UserProfile): void {
  try {
    const cache: UserProfileCache = {
      ownerOpenid: identity.openid,
      appid: identity.appid,
      profile,
      updatedAt: nowText(),
    }
    wx.setStorageSync(STORAGE_KEYS.userProfileCache, cache)
  } catch (error) {
    // 用户资料缓存只用于弱网展示，写入失败不影响云端保存结果。
    console.warn('写入用户资料缓存失败', error)
  }
}

function mergeSubmissionCache(identity: UserDataIdentity, item: Submission): void {
  const current = readSubmissionCache(identity)
  writeSubmissionCache(identity, [
    item,
    ...current.filter((currentItem) => currentItem.id !== item.id),
  ])
}

function normalizeUserProfile(item: Partial<UserProfile>): UserProfile {
  const nickname = typeof item.nickname === 'string' ? item.nickname : ''
  const avatarFileId = typeof item.avatarFileId === 'string' ? item.avatarFileId : ''
  const avatarUrl = typeof item.avatarUrl === 'string'
    ? item.avatarUrl
    : avatarFileId
  return {
    publicId: typeof item.publicId === 'string' ? item.publicId : '',
    nickname,
    avatarFileId,
    avatarUrl,
    hasProfile: Boolean(item.hasProfile) && Boolean(nickname && avatarFileId),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  }
}

function normalizeSubmission(item: Submission): Submission {
  return {
    ...item,
    images: Array.isArray(item.publicImages) ? item.publicImages : (Array.isArray(item.images) ? item.images : []),
    publicImages: Array.isArray(item.publicImages) ? item.publicImages : (Array.isArray(item.images) ? item.images : []),
    evidenceFiles: Array.isArray(item.evidenceFiles) ? item.evidenceFiles : [],
    rejectReason: item.rejectReason || '',
    hasContacted: Boolean(item.hasContacted),
    isTop: Boolean(item.isTop),
    topUntil: item.topUntil || '',
    isFeatured: Boolean(item.isFeatured),
    featuredUntil: item.featuredUntil || '',
    isPaid: Boolean(item.isPaid),
    paidType: item.paidType || '',
    chargeUntil: item.chargeUntil || '',
    adminNote: '',
  }
}

function isPendingOperation(value: unknown): value is PendingUserOperation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PendingUserOperation>
  return typeof candidate.id === 'string' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.ownerOpenid === 'string' &&
    Boolean(candidate.ownerOpenid) &&
    typeof candidate.appid === 'string' &&
    Boolean(candidate.appid) &&
    (candidate.kind === 'submission' || candidate.kind === 'feedback') &&
    Boolean(candidate.input)
}

function makeRequestId(prefix: string): string {
  const random = Math.floor(Math.random() * 0x100000000).toString(36)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

function getFileExtension(filePath: string): string {
  const cleanPath = filePath.split('?')[0]
  const match = cleanPath.match(/\.([A-Za-z0-9]{1,8})$/)
  const extension = match ? match[1].toLowerCase() : 'jpg'
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'jpg'
}

function nowText(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '网络异常，请稍后重试'
}

function cleanupSubmittedLocalImages(filePaths: string[]): void {
  filePaths
    .filter((filePath) => filePath && !filePath.startsWith('cloud://'))
    .forEach((filePath) => {
      wx.removeSavedFile({
        filePath,
        fail: (error) => {
          // 云端记录已经成功，清理本机副本失败只记录日志，不回滚投稿。
          console.warn('清理已上传的本地图片失败', error)
        },
      })
    })
}

function cleanupSubmissionLocalFiles(input: SubmitEntryInput): void {
  cleanupSubmittedLocalImages([
    ...(input.publicImages || input.images || []),
    ...(input.evidenceFiles || []).map((item) => item.fileId),
  ])
}
