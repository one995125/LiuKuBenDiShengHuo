/**
 * 六库生活圈 CloudBase 稳定配置。
 * 环境 ID 和资源名称集中维护，页面及业务服务不得散落硬编码。
 */
export const CLOUD_BASE_CONFIG = {
  environmentId: 'cloud1-d6glqc7e7244211f2',
  traceUser: true,
  features: {
    /**
     * 开发环境公开集合、复合索引和精选种子数据已完成验收。
     * 云端调用失败时仍按“最近缓存 -> 本地 mock”回退，避免页面空白。
     */
    publicData: true,
    /**
     * 私密反馈和可信身份云端开关。
     * 普通用户投稿、评论和资料保存已由用户云函数返回稳定禁用码。
     */
    userData: true,
  },
  functionNames: {
    publicApi: 'liuku-public-api',
    userApi: 'liuku-user-api',
    adminApi: 'liuku-admin-api',
  },
} as const
