const automator = require('miniprogram-automator')
const { getCloudConfig } = require('./project-config')

const autoPort = Number(process.env.WECHAT_AUTO_PORT || 9420)
const environmentId = getCloudConfig().environmentId

async function run() {
  const miniProgram = await automator.connect({
    wsEndpoint: `ws://127.0.0.1:${autoPort}`,
  })

  try {
    const result = await miniProgram.evaluate(function (env) {
      function call(name, action, payload) {
        return wx.cloud.callFunction({
          name,
          data: { action, payload: payload || {} },
          config: { env },
        }).then(function (response) {
          return response.result || {}
        })
      }

      function verifyWriteDenied(collectionName) {
        return wx.cloud.database({ env }).collection(collectionName)
          .doc('__liuku_permission_probe__')
          .remove()
          .then(function () { return false })
          .catch(function () { return true })
      }

      return call('liuku-user-api', 'identity').then(function (identityResult) {
        return Promise.all([
          call('liuku-user-api', 'submitEntry', {
            clientRequestId: 'remote_disabled_submission',
            input: { type: 'merchant', title: '不得写入', images: [] },
          }),
          call('liuku-user-api', 'submitComment', {
            clientRequestId: 'remote_disabled_comment',
            input: { entryId: 'merchant-001', rating: 5, content: '不得写入' },
          }),
          call('liuku-user-api', 'saveMyProfile', {
            // 使用无效空资料验证保存路由已恢复，同时避免修改当前验收账号的真实资料。
            input: { nickname: '', avatarFileId: '' },
          }),
          call('liuku-public-api', 'listComments', { entryId: 'merchant-001' }),
          verifyWriteDenied('liuku_submissions'),
          verifyWriteDenied('liuku_comments'),
          verifyWriteDenied('liuku_users'),
          verifyWriteDenied('liuku_feedbacks'),
        ]).then(function (checks) {
          const identity = identityResult.data || {}
          return {
            identityOk: Boolean(identityResult.ok),
            serviceVersion: identity.version || '',
            identityMask: identity.openid
              ? identity.openid.slice(0, 4) + '***' + identity.openid.slice(-4)
              : '',
            publishCode: checks[0].code,
            commentCode: checks[1].code,
            profileCode: checks[2].code,
            publicCommentCode: checks[3].code,
            submissionsWriteDenied: checks[4],
            commentsWriteDenied: checks[5],
            usersWriteDenied: checks[6],
            feedbacksWriteDenied: checks[7],
          }
        })
      }).catch(function (error) {
        return { error: String(error && (error.errMsg || error.message) || error) }
      })
    }, environmentId)

    const passed = Boolean(
      result.identityOk
      && result.serviceVersion === '1.2.0'
      && result.publishCode === 'USER_PUBLISH_DISABLED'
      && result.commentCode === 'COMMENT_DISABLED'
      && result.profileCode === 'INVALID_PROFILE'
      && result.publicCommentCode === 'COMMENTS_DISABLED'
      && result.submissionsWriteDenied
      && result.commentsWriteDenied
      && result.usersWriteDenied
      && result.feedbacksWriteDenied,
    )
    if (!passed) {
      throw new Error(`用户云端远程收口检查失败：${JSON.stringify(result)}`)
    }

    console.log(
      `用户云端远程收口检查通过：服务 ${result.serviceVersion}，`
      + '头像昵称保存路由已恢复，投稿/评论和公开评论仍禁用，四个集合拒绝客户端直写。',
    )
  } finally {
    miniProgram.disconnect()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
