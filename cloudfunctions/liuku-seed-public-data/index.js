const cloud = require('wx-server-sdk')
const seedData = require('./seed-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const CONFIRM_VALUE = 'LIUKU_DEV_PUBLIC_SEED_V1'
const PUBLIC_COLLECTIONS = [
  'liuku_merchants',
  'liuku_jobs',
  'liuku_rentals',
]

/**
 * 开发环境公开数据种子函数。
 *
 * 该函数只在执行种子脚本期间临时部署，完成后立即从云端删除。
 * 固定使用种子文档的 _id 幂等写入，不会清空集合或删除运营者已有资料。
 */
exports.main = async (event = {}) => {
  if (event.confirm !== CONFIRM_VALUE) {
    return {
      ok: false,
      code: 'CONFIRM_REQUIRED',
      message: '缺少开发环境种子确认参数',
    }
  }

  const summary = {}

  for (const collectionName of PUBLIC_COLLECTIONS) {
    const items = Array.isArray(seedData[collectionName])
      ? seedData[collectionName]
      : []
    const collection = db.collection(collectionName)
    let inserted = 0
    let updated = 0

    for (const item of items) {
      const { _id, ...seedDocument } = item
      if (!_id) continue

      const existing = await getDocument(collection, _id)
      await collection.doc(_id).set({
        data: {
          ...seedDocument,
          sourceType: 'seed',
          version: existing && Number.isInteger(existing.version)
            ? existing.version + 1
            : 1,
          createdAt: existing && existing.createdAt
            ? existing.createdAt
            : seedDocument.createdAt,
          updatedByUid: 'dev-seed-script',
        },
      })

      if (existing) {
        updated += 1
      } else {
        inserted += 1
      }
    }

    const published = await collection.where({ status: 'published' }).count()
    // 复用公开 API 的排序条件，提前暴露缺失复合索引的问题。
    const ordered = await collection
      .where({ status: 'published' })
      .orderBy('isTop', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(3)
      .get()

    summary[collectionName] = {
      inserted,
      updated,
      published: published.total,
      orderedIds: ordered.data.map((document) => document._id),
    }
  }

  await ensureCustomerServiceConfig()
  await ensureChannelPolicyConfig()

  return {
    ok: true,
    code: 'OK',
    message: '开发环境公开数据种子导入完成',
    data: summary,
  }
}

async function getDocument(collection, id) {
  try {
    const result = await collection.doc(id).get()
    return result && result.data ? result.data : null
  } catch (error) {
    if (isDocumentNotFound(error)) return null
    throw error
  }
}

async function ensureCustomerServiceConfig() {
  const collection = db.collection('liuku_configs')
  const existing = await getDocument(collection, 'customer_service')
  if (existing) return

  await collection.doc('customer_service').set({
    data: {
      phone: '',
      wechat: '',
      description: '客服用于信息纠错、投诉反馈和商家合作。',
      version: 1,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })
}

/**
 * 写入服务端权威频道策略。招聘始终以关闭为安全默认值，商家和出租房源
 * 只有在配置明确开启时才允许用户投稿和后台发布。
 */
async function ensureChannelPolicyConfig() {
  const collection = db.collection('liuku_configs')
  const existing = await getDocument(collection, 'channel_policy')
  if (existing) return

  await collection.doc('channel_policy').set({
    data: {
      channels: {
        merchant: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
        rental: { publicVisible: true, submissionEnabled: true, adminPublishingEnabled: true },
        job: { publicVisible: false, submissionEnabled: false, adminPublishingEnabled: false },
      },
      version: 1,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })
}

function isDocumentNotFound(error) {
  const message = error && error.message ? String(error.message) : ''
  return Boolean(error && (error.errCode === -502005 || error.code === 'DATABASE_DOCUMENT_NOT_FOUND'))
    || /does not exist|not found/i.test(message)
}
