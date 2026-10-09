const cloud = require('wx-server-sdk')
const { buildMaintenancePatch } = require('./maintenance-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTIONS = ['liuku_merchants', 'liuku_jobs', 'liuku_rentals', 'liuku_offers']
const LOG_COLLECTION = 'liuku_admin_logs'
const SUBMISSION_COLLECTION = 'liuku_submissions'

/**
 * 每日维护函数。
 * 定时清理推广状态，并将超过有效期的招聘、房源和优惠活动标记为 expired。
 */
exports.main = async () => {
  const now = new Date()
  const summary = {
    checked: 0,
    updated: 0,
    failed: 0,
    evidencePurged: 0,
  }

  await purgeExpiredEvidence(now, summary)

  for (const collectionName of COLLECTIONS) {
    const result = await db.collection(collectionName)
      .where({ status: db.command.in(['published', 'expired']) })
      .limit(100)
      .get()
    const documents = Array.isArray(result.data) ? result.data : []
    summary.checked += documents.length

    for (const document of documents) {
      const patch = buildMaintenancePatch(document, now.getTime())
      if (Object.keys(patch).length === 0) continue
      try {
        await db.collection(collectionName).doc(document._id).update({
          data: {
            ...patch,
            version: Number.isInteger(document.version) ? document.version + 1 : 1,
            updatedAt: db.serverDate(),
            updatedByUid: 'system',
          },
        })
        if (patch.status === 'expired' && document.sourceSubmissionId) {
          const retainUntil = new Date(now.getTime())
          retainUntil.setFullYear(retainUntil.getFullYear() + 1)
          await db.collection(SUBMISSION_COLLECTION).doc(document.sourceSubmissionId).update({
            data: {
              evidenceRetainUntil: retainUntil.toISOString(),
              updatedAt: db.serverDate(),
            },
          })
        }
        summary.updated += 1
      } catch (error) {
        summary.failed += 1
        console.error('维护记录失败', {
          collectionName,
          id: document._id,
          message: error && error.message ? error.message : '',
        })
      }
    }
  }

  const logId = `log_maintenance_${Date.now().toString(36)}`
  await db.collection(LOG_COLLECTION).doc(logId).set({
    data: {
      actorUid: 'system',
      actorName: '定时维护',
      actorRole: 'system',
      action: 'maintenance.daily',
      targetType: 'system',
      targetId: logId,
      changedFields: [
        `checked:${summary.checked}`,
        `updated:${summary.updated}`,
        `failed:${summary.failed}`,
        `evidencePurged:${summary.evidencePurged}`,
      ],
      requestId: logId,
      createdAt: db.serverDate(),
    },
  })

  return {
    ok: summary.failed === 0,
    code: summary.failed === 0 ? 'OK' : 'PARTIAL_FAILURE',
    message: summary.failed === 0 ? '维护完成' : '部分记录维护失败',
    data: summary,
    requestId: logId,
  }
}

/**
 * 删除超过保留期的私密核验材料。
 * 只清理 evidenceFiles，公开展示图片 publicImages/images 不在此流程处理。
 */
async function purgeExpiredEvidence(now, summary) {
  const result = await db.collection(SUBMISSION_COLLECTION)
    .where({
      evidenceRetainUntil: db.command.lte(now.toISOString()),
      evidencePurgedAt: db.command.eq(''),
    })
    .limit(100)
    .get()
  const submissions = Array.isArray(result.data) ? result.data : []
  for (const submission of submissions) {
    const fileList = Array.isArray(submission.evidenceFiles)
      ? submission.evidenceFiles.map((item) => item && item.fileId).filter(Boolean)
      : []
    try {
      if (fileList.length > 0) {
        await cloud.deleteFile({ fileList })
      }
      await db.collection(SUBMISSION_COLLECTION).doc(submission._id).update({
        data: {
          evidenceFiles: [],
          evidencePurgedAt: db.serverDate(),
          version: Number.isInteger(submission.version) ? submission.version + 1 : 1,
          updatedAt: db.serverDate(),
        },
      })
      const materialTypes = Array.isArray(submission.evidenceFiles)
        ? submission.evidenceFiles.map((item) => item && item.type).filter(Boolean)
        : []
      const purgeLogId = `log_evidence_purge_${submission._id}_${Date.now().toString(36)}`
      await db.collection(LOG_COLLECTION).doc(purgeLogId).set({
        data: {
          actorUid: 'system',
          actorName: '定时维护',
          actorRole: 'system',
          action: 'submission.evidence.purge',
          targetType: 'submission',
          targetId: submission._id,
          changedFields: ['evidenceFiles', ...materialTypes.map((type) => `materialType:${type}`)],
          requestId: purgeLogId,
          createdAt: db.serverDate(),
        },
      })
      summary.evidencePurged += 1
    } catch (error) {
      summary.failed += 1
      console.error('清理核验材料失败', {
        submissionId: submission._id,
        materialTypes: Array.isArray(submission.evidenceFiles)
          ? submission.evidenceFiles.map((item) => item && item.type).filter(Boolean)
          : [],
        message: error && error.message ? error.message : '',
      })
    }
  }
}
