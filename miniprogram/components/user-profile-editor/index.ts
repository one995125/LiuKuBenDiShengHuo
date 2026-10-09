import { saveMyUserProfile } from '../../services/user-data'
import type { UserProfile } from '../../types/local-life'

const MAX_NICKNAME_LENGTH = 24

const EMPTY_PROFILE: UserProfile = {
  publicId: '',
  nickname: '',
  avatarFileId: '',
  avatarUrl: '',
  hasProfile: false,
  updatedAt: '',
}

type PrivacySettingApi = (options: {
  success?: (result: { needAuthorization?: boolean; privacyContractName?: string }) => void
  fail?: (error: WechatMiniprogram.GeneralCallbackResult) => void
}) => void

Component({
  properties: {
    /** 由页面控制弹层显示，关闭时组件不会执行资料读取或写入。 */
    visible: { type: Boolean, value: false },
    /** 当前账号资料，用于用户未更换头像时保留已有云文件。 */
    profile: { type: Object, value: EMPTY_PROFILE },
  },

  data: {
    nickname: '',
    avatarPath: '',
    avatarFileId: '',
    saving: false,
    formError: '',
    privacyChecking: false,
    privacyReady: true,
    privacyContractName: '《用户隐私保护指引》',
  },

  observers: {
    'visible, profile': function (visible: boolean, profile: UserProfile) {
      if (!visible) return
      const current = profile || EMPTY_PROFILE
      this.setData({
        nickname: current.nickname || '',
        avatarPath: current.avatarUrl || current.avatarFileId || '',
        avatarFileId: current.avatarFileId || '',
        saving: false,
        formError: '',
      })
      void this.checkPrivacyAuthorization()
    },
  },

  methods: {
    /**
     * 头像与昵称控件属于微信隐私相关接口。显示编辑表单前先检查授权状态，
     * 避免未同意隐私指引时直接渲染 nickname 输入框导致基础库降级警告。
     */
    checkPrivacyAuthorization() {
      const getPrivacySetting = (wx as unknown as { getPrivacySetting?: PrivacySettingApi }).getPrivacySetting
      if (typeof getPrivacySetting !== 'function') {
        this.setData({ privacyChecking: false, privacyReady: true })
        return Promise.resolve()
      }

      this.setData({ privacyChecking: true })
      return new Promise<void>((resolve) => {
        getPrivacySetting({
          success: (result) => {
            this.setData({
              privacyChecking: false,
              privacyReady: !result.needAuthorization,
              privacyContractName: result.privacyContractName || '《用户隐私保护指引》',
            })
            resolve()
          },
          fail: (error) => {
            console.warn('检查头像昵称隐私授权状态失败', error)
            this.setData({ privacyChecking: false, privacyReady: false })
            resolve()
          },
        })
      })
    },

    onPrivacyAuthorized() {
      this.setData({ privacyReady: true, formError: '' })
    },

    onChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
      const avatarUrl = String(event.detail.avatarUrl || '')
      if (!avatarUrl) return
      this.setData({ avatarPath: avatarUrl, formError: '' })
    },

    onNicknameInput(event: WechatMiniprogram.Input) {
      this.setData({ nickname: String(event.detail.value || ''), formError: '' })
    },

    onMaskTap() {
      if (!this.data.saving) this.triggerEvent('cancel')
    },

    stopPropagation() {},

    cancel() {
      if (!this.data.saving) this.triggerEvent('cancel')
    },

    /**
     * 保存前在客户端完成基础校验，云函数还会再次校验昵称长度和头像归属。
     * 临时头像由服务层上传到当前 openid 专属目录，页面不会接触或传入 openid。
     */
    async saveProfile() {
      if (this.data.saving) return
      const nickname = this.data.nickname.trim()
      if (!nickname) {
        this.setData({ formError: '请填写昵称' })
        return
      }
      if (nickname.length > MAX_NICKNAME_LENGTH) {
        this.setData({ formError: `昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符` })
        return
      }
      if (!this.data.avatarPath && !this.data.avatarFileId) {
        this.setData({ formError: '请选择头像' })
        return
      }

      this.setData({ saving: true, formError: '' })
      try {
        const result = await saveMyUserProfile({
          nickname,
          avatarPath: this.data.avatarPath,
          avatarFileId: this.data.avatarFileId,
        })
        this.triggerEvent('saved', { profile: result.profile })
        wx.showToast({ title: '资料已保存', icon: 'success' })
      } catch (error) {
        console.error('保存头像昵称资料失败', error)
        this.setData({
          formError: error instanceof Error ? error.message : '保存失败，请稍后重试',
        })
      } finally {
        this.setData({ saving: false })
      }
    },
  },
})
