import {
  isUserOperationQueuedError,
  submitUserFeedback,
} from '../../services/user-data'
import type { FeedbackType, PublicContentType } from '../../types/local-life'

type FeedbackField = 'content' | 'contact'

interface FeedbackPageData {
  type: FeedbackType
  entryType: PublicContentType | ''
  entryId: string
  entryTitle: string
  content: string
  contact: string
  submitting: boolean
}

function decodeQuery(value: string | undefined): string {
  return value ? decodeURIComponent(value) : ''
}

Page<FeedbackPageData, WechatMiniprogram.IAnyObject>({
  data: {
    type: 'correction',
    entryType: '',
    entryId: '',
    entryTitle: '',
    content: '',
    contact: '',
    submitting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      entryType: (query.entryType as PublicContentType) || '',
      entryId: query.entryId || '',
      entryTitle: decodeQuery(query.entryTitle),
    })
  },

  selectType(event: WechatMiniprogram.BaseEvent) {
    this.setData({ type: event.currentTarget.dataset.type as FeedbackType })
  },

  onFieldInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const field = event.currentTarget.dataset.field as FeedbackField
    this.setData({
      [field]: event.detail.value,
    } as Partial<FeedbackPageData>)
  },

  async submit() {
    if (this.data.submitting) return
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写反馈说明', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await submitUserFeedback({
        type: this.data.type,
        entryType: this.data.entryType,
        entryId: this.data.entryId,
        entryTitle: this.data.entryTitle,
        content: this.data.content,
        contact: this.data.contact,
      })
      wx.showModal({
        title: '反馈已提交',
        content: '记录已进入人工处理列表，运营者会按提交顺序核实。',
        showCancel: false,
        success: () => {
          const pages = getCurrentPages()
          if (pages.length > 1) {
            wx.navigateBack()
          } else {
            wx.reLaunch({ url: '/pages/index/index' })
          }
        },
        complete: () => this.setData({ submitting: false }),
      })
    } catch (error) {
      if (isUserOperationQueuedError(error)) {
        this.setData({ submitting: false })
        wx.showModal({
          title: '已保存待重试',
          content: '当前网络或云服务不可用，反馈内容已保存在本机，可在“帮助”页面重新提交。',
          confirmText: '去帮助',
          success: (result) => {
            if (result.confirm) {
              wx.reLaunch({ url: '/pages/mine/index' })
            }
          },
        })
        return
      }
      console.error('提交反馈失败', error)
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，请检查存储空间', icon: 'none' })
    }
  },
})
