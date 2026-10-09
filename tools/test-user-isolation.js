const assert = require('assert')
const Module = require('module')
const path = require('path')
const { loadProjectConfig } = require('./project-config')

const appConfig = loadProjectConfig()
const officialAppId = appConfig.appId
process.env[appConfig.cloud.sourceAppIdEnvVar] = officialAppId

const collections = new Map()
let currentContext = { OPENID: 'openid-user-a', APPID: officialAppId }

function getCollection(name) {
  if (!collections.has(name)) collections.set(name, new Map())
  return collections.get(name)
}

function createQuery(name, initialFilter = {}) {
  const state = { filter: initialFilter, skip: 0, limit: Number.MAX_SAFE_INTEGER }
  const query = {
    where(filter) {
      state.filter = filter
      return query
    },
    orderBy() {
      return query
    },
    skip(value) {
      state.skip = value
      return query
    },
    limit(value) {
      state.limit = value
      return query
    },
    async get() {
      const data = Array.from(getCollection(name).values())
        .filter((document) => Object.entries(state.filter).every(
          ([key, value]) => document[key] === value,
        ))
        .sort((first, second) => String(second.updatedAt).localeCompare(String(first.updatedAt)))
        .slice(state.skip, state.skip + state.limit)
      return { data }
    },
  }
  return query
}

const database = {
  serverDate() {
    return new Date('2026-07-22T12:00:00.000Z')
  },
  collection(name) {
    return {
      doc(id) {
        return {
          async get() {
            const document = getCollection(name).get(id)
            if (!document) {
              const error = new Error('document does not exist')
              error.errCode = -502005
              throw error
            }
            return { data: document }
          },
          async update({ data }) {
            const oldDocument = getCollection(name).get(id)
            if (!oldDocument) {
              const error = new Error('document does not exist')
              error.errCode = -502005
              throw error
            }
            getCollection(name).set(id, { ...oldDocument, ...data, _id: id })
            return { updated: 1 }
          },
        }
      },
      async add({ data }) {
        const id = String(data && data._id || '')
        if (!id) throw new Error('mock add requires _id')
        if (getCollection(name).has(id)) throw new Error('document already exists')
        getCollection(name).set(id, { ...data })
        return { _id: id }
      },
      where(filter) {
        return createQuery(name, filter)
      },
    }
  },
}

const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'mock-env',
  init() {},
  database() {
    return database
  },
  getWXContext() {
    return currentContext
  },
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock
  return originalLoad.call(this, request, parent, isMain)
}

const functionPath = path.resolve(__dirname, '../cloudfunctions/liuku-user-api/index.js')
delete require.cache[functionPath]
const userApi = require(functionPath)
Module._load = originalLoad

function invokeUserAction(action) {
  const requestId = `${action}_request_001`
  return userApi.main({
    action,
    payload: {
      clientRequestId: `${action}_request_001`,
      input: {
        nickname: '不应保存的用户',
        avatarFileId: 'cloud://env.bucket/liuku/users/openid-user-a/avatar/a.jpg',
        type: 'merchant',
        title: '不应创建的投稿',
        contactName: '测试联系人',
        phone: '13900000000',
        category: '其他便民',
        subCategory: '便民服务',
        area: '江东片区',
        location: '六库城区',
        businessHours: '09:00-18:00',
        content: '该内容不应写入数据库。',
        publicImages: [`cloud://env.bucket/liuku/submissions/openid-user-a/${requestId}/public/store.jpg`],
        evidenceFiles: [
          { type: 'business_license', fileId: `cloud://env.bucket/liuku/submissions/openid-user-a/${requestId}/evidence/license.jpg` },
          { type: 'storefront', fileId: `cloud://env.bucket/liuku/submissions/openid-user-a/${requestId}/evidence/storefront.jpg` },
        ],
        submitterRole: 'merchant_owner',
        declarations: {
          truthConfirmed: true,
          displayConsentConfirmed: true,
          materialUseConsentConfirmed: true,
        },
        entryId: 'merchant-001',
        rating: 5,
      },
    },
  })
}

function saveProfile(nickname, openid) {
  return userApi.main({
    action: 'saveMyProfile',
    payload: {
      input: {
        nickname,
        avatarFileId: `cloud://env.bucket/liuku/users/${openid}/avatar/profile.jpg`,
      },
    },
  })
}

function submitFeedback(clientRequestId) {
  return userApi.main({
    action: 'submitFeedback',
    payload: {
      clientRequestId,
      input: {
        type: 'correction',
        entryType: 'merchant',
        entryId: 'merchant-001',
        entryTitle: '测试商家',
        content: '联系电话需要运营者核实。',
        contact: 'wx-contact',
      },
    },
  })
}

async function listMine() {
  return userApi.main({
    action: 'listMySubmissions',
    payload: { cursor: '', pageSize: 20, openid: 'forged-openid' },
  })
}

async function run() {
  const submission = await invokeUserAction('submitEntry')
  assert.strictEqual(submission.ok, true)
  assert.strictEqual(submission.data.item.status, 'pending')
  assert.strictEqual(getCollection('liuku_submissions').size, 1)

  const jobSubmission = await userApi.main({
    action: 'submitEntry',
    payload: { clientRequestId: 'job_request_001', input: { type: 'job' } },
  })
  assert.strictEqual(jobSubmission.ok, false)
  assert.strictEqual(jobSubmission.code, 'CHANNEL_DISABLED')

  const comment = await invokeUserAction('submitComment')
  assert.strictEqual(comment.ok, false)
  assert.strictEqual(comment.code, 'COMMENT_DISABLED')
  assert.strictEqual(getCollection('liuku_comments').size, 0)

  // 头像昵称由用户主动选择后保存，并按 openid + appid 隔离。
  const userAProfile = await saveProfile('用户 A', 'openid-user-a')
  assert.strictEqual(userAProfile.ok, true)
  assert.strictEqual(userAProfile.data.profile.nickname, '用户 A')
  assert.strictEqual(userAProfile.data.profile.hasProfile, true)
  assert.strictEqual(getCollection('liuku_users').size, 1)

  // 历史投稿仍可按 openid + appid 只读查询，用于兼容旧客户端和审计。
  getCollection('liuku_submissions').set('legacy-a', {
    _id: 'legacy-a',
    id: 'legacy-a',
    ownerOpenid: 'openid-user-a',
    appid: officialAppId,
    title: '历史投稿 A',
    type: 'merchant',
    status: 'rejected',
    images: [],
    updatedAt: '2026-07-20T10:00:00.000Z',
  })
  getCollection('liuku_submissions').set('legacy-b', {
    _id: 'legacy-b',
    id: 'legacy-b',
    ownerOpenid: 'openid-user-b',
    appid: officialAppId,
    title: '历史投稿 B',
    type: 'merchant',
    status: 'rejected',
    images: [],
    updatedAt: '2026-07-20T11:00:00.000Z',
  })
  const userALegacy = await listMine()
  assert(userALegacy.data.items.some((item) => item.id === 'legacy-a'))
  assert(userALegacy.data.items.some((item) => item.status === 'pending'))
  assert(!userALegacy.data.items.some((item) => item.id === 'legacy-b'))

  const userAFeedback = await submitFeedback('feedback_shared_request')
  assert.strictEqual(userAFeedback.ok, true)
  currentContext = { OPENID: 'openid-user-b', APPID: officialAppId }
  const userBProfile = await saveProfile('用户 B', 'openid-user-b')
  assert.strictEqual(userBProfile.ok, true)
  assert.strictEqual(userBProfile.data.profile.nickname, '用户 B')
  assert.strictEqual(getCollection('liuku_users').size, 2)
  const userBFeedback = await submitFeedback('feedback_shared_request')
  assert.strictEqual(userBFeedback.ok, true)
  assert.notStrictEqual(userAFeedback.data.id, userBFeedback.data.id)

  const storedFeedbacks = Array.from(getCollection('liuku_feedbacks').values())
  assert.strictEqual(storedFeedbacks.length, 2)
  assert.deepStrictEqual(
    storedFeedbacks.map((item) => item.ownerOpenid).sort(),
    ['openid-user-a', 'openid-user-b'],
  )
  assert(storedFeedbacks.every((item) => item.appid === officialAppId))

  const storedProfiles = Array.from(getCollection('liuku_users').values())
  assert.deepStrictEqual(
    storedProfiles.map((item) => item.ownerOpenid).sort(),
    ['openid-user-a', 'openid-user-b'],
  )
  assert(storedProfiles.every((item) => item.appid === officialAppId))

  console.log('用户云函数测试通过：头像昵称隔离、商家投稿待审、招聘/评论关闭、私密反馈可提交。')
}

run().catch((error) => {
  console.error('用户云函数收口测试失败：', error)
  process.exit(1)
})
