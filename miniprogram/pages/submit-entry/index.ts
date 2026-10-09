import { MERCHANT_CATEGORIES, getMerchantSubCategories } from '../../constants/merchant-taxonomy'
import {
  isUserOperationQueuedError,
  submitUserEntry,
} from '../../services/user-data'
import type {
  EvidenceFileInput,
  EvidenceFileType,
  SubmissionType,
  SubmitterRole,
} from '../../types/local-life'

const MAX_FILE_SIZE = 5 * 1024 * 1024

interface EvidenceOption {
  type: EvidenceFileType
  label: string
  selected: boolean
  fileName: string
}

interface SubmissionForm {
  title: string
  category: string
  subCategory: string
  area: string
  contactName: string
  phone: string
  wechat: string
  location: string
  businessHours: string
  content: string
  rent: string
  layout: string
  validUntil: string
}

interface SubmitPageData {
  type: SubmissionType
  pageTitle: string
  submitterRole: SubmitterRole
  roleIndex: number
  roleLabels: string[]
  categories: string[]
  categoryIndex: number
  subCategories: string[]
  subCategoryIndex: number
  form: SubmissionForm
  publicImages: string[]
  evidenceFiles: EvidenceFileInput[]
  evidenceOptions: EvidenceOption[]
  declarationValues: string[]
  submitting: boolean
}

const EVIDENCE_LABELS: Record<EvidenceFileType, string> = {
  business_license: '营业执照',
  storefront: '门头或实际经营场所',
  ownership_proof: '产权或合法出租权证明',
  brokerage_filing: '房地产经纪备案证明',
  owner_authorization: '业主房源发布授权',
}

function requiredEvidence(type: SubmissionType, role: SubmitterRole): EvidenceFileType[] {
  if (type === 'merchant') return ['business_license', 'storefront']
  if (role === 'registered_agent') {
    return ['business_license', 'brokerage_filing', 'owner_authorization', 'ownership_proof']
  }
  return ['ownership_proof']
}

function buildEvidenceOptions(
  type: SubmissionType,
  role: SubmitterRole,
  files: EvidenceFileInput[],
): EvidenceOption[] {
  return requiredEvidence(type, role).map((evidenceType) => {
    const selected = files.find((item) => item.type === evidenceType)
    return {
      type: evidenceType,
      label: EVIDENCE_LABELS[evidenceType],
      selected: Boolean(selected),
      fileName: selected ? '已选择材料' : '未选择',
    }
  })
}

Page<SubmitPageData, WechatMiniprogram.IAnyObject>({
  data: {
    type: 'merchant',
    pageTitle: '提交商家资料',
    submitterRole: 'merchant_owner',
    roleIndex: 0,
    roleLabels: ['业主本人', '备案中介'],
    categories: [...MERCHANT_CATEGORIES],
    categoryIndex: 0,
    subCategories: [...getMerchantSubCategories(MERCHANT_CATEGORIES[0])],
    subCategoryIndex: 0,
    form: {
      title: '', category: MERCHANT_CATEGORIES[0], subCategory: getMerchantSubCategories(MERCHANT_CATEGORIES[0])[0] || '', area: '',
      contactName: '', phone: '', wechat: '', location: '', businessHours: '',
      content: '', rent: '', layout: '', validUntil: '',
    },
    publicImages: [],
    evidenceFiles: [],
    evidenceOptions: buildEvidenceOptions('merchant', 'merchant_owner', []),
    declarationValues: [],
    submitting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const type: SubmissionType = query.type === 'rental' ? 'rental' : 'merchant'
    const role: SubmitterRole = type === 'merchant' ? 'merchant_owner' : 'property_owner'
    this.setData({
      type,
      pageTitle: type === 'merchant' ? '提交商家资料' : '发布出租房源',
      submitterRole: role,
      evidenceOptions: buildEvidenceOptions(type, role, []),
    })
    wx.setNavigationBarTitle({ title: type === 'merchant' ? '提交商家资料' : '发布出租房源' })
  },

  onFieldInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const field = String(event.currentTarget.dataset.field || '')
    if (!field) return
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onCategoryChange(event: WechatMiniprogram.CustomEvent<{ value: string | number }>) {
    const categoryIndex = Number(event.detail.value) || 0
    const category = this.data.categories[categoryIndex]
    const subCategories = [...getMerchantSubCategories(category)]
    this.setData({
      categoryIndex,
      subCategories,
      subCategoryIndex: 0,
      'form.category': category,
      'form.subCategory': subCategories[0] || '',
    })
  },

  onSubCategoryChange(event: WechatMiniprogram.CustomEvent<{ value: string | number }>) {
    const subCategoryIndex = Number(event.detail.value) || 0
    this.setData({
      subCategoryIndex,
      'form.subCategory': this.data.subCategories[subCategoryIndex] || '',
    })
  },

  onRoleChange(event: WechatMiniprogram.CustomEvent<{ value: string | number }>) {
    if (this.data.type !== 'rental') return
    const roleIndex = Number(event.detail.value) || 0
    const submitterRole: SubmitterRole = roleIndex === 1 ? 'registered_agent' : 'property_owner'
    // 切换身份时清空旧身份材料，避免把不匹配材料误提交。
    this.setData({
      roleIndex,
      submitterRole,
      evidenceFiles: [],
      evidenceOptions: buildEvidenceOptions('rental', submitterRole, []),
    })
  },

  onDateChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ 'form.validUntil': event.detail.value })
  },

  onDeclarationsChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ declarationValues: event.detail.value })
  },

  async choosePublicImages() {
    const remaining = 3 - this.data.publicImages.length
    if (remaining <= 0) return
    const paths = await chooseAndPersistImages(remaining)
    this.setData({ publicImages: [...this.data.publicImages, ...paths].slice(0, 3) })
  },

  removePublicImage(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ publicImages: this.data.publicImages.filter((_, itemIndex) => itemIndex !== index) })
  },

  async chooseEvidence(event: WechatMiniprogram.BaseEvent) {
    const type = String(event.currentTarget.dataset.type || '') as EvidenceFileType
    if (!requiredEvidence(this.data.type, this.data.submitterRole).includes(type)) return
    const [fileId] = await chooseAndPersistImages(1)
    if (!fileId) return
    const evidenceFiles = [
      ...this.data.evidenceFiles.filter((item) => item.type !== type),
      { type, fileId },
    ]
    this.setData({
      evidenceFiles,
      evidenceOptions: buildEvidenceOptions(this.data.type, this.data.submitterRole, evidenceFiles),
    })
  },

  async submit() {
    if (this.data.submitting) return
    const validationMessage = validateForm(this.data)
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' })
      return
    }
    const form = this.data.form
    this.setData({ submitting: true })
    try {
      await submitUserEntry({
        type: this.data.type,
        title: form.title.trim(),
        category: form.category.trim(),
        subCategory: form.subCategory.trim(),
        area: form.area.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        wechat: form.wechat.trim(),
        location: form.location.trim(),
        businessHours: form.businessHours.trim(),
        content: form.content.trim(),
        rent: form.rent.trim(),
        layout: form.layout.trim(),
        validUntil: form.validUntil,
        images: [...this.data.publicImages],
        publicImages: [...this.data.publicImages],
        evidenceFiles: this.data.evidenceFiles.map((item) => ({ ...item })),
        submitterRole: this.data.submitterRole,
        declarations: {
          truthConfirmed: this.data.declarationValues.includes('truth'),
          displayConsentConfirmed: this.data.declarationValues.includes('display'),
          materialUseConsentConfirmed: this.data.declarationValues.includes('material'),
        },
      })
      wx.showToast({ title: '已提交人工审核', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: '/pages/my-submissions/index' }), 600)
    } catch (error) {
      const message = isUserOperationQueuedError(error)
        ? '网络异常，投稿草稿已保留，可在“我的投稿”重试'
        : error instanceof Error ? error.message : '提交失败，请稍后重试'
      wx.showToast({ title: message, icon: 'none', duration: 3000 })
    } finally {
      this.setData({ submitting: false })
    }
  },
})

function validateForm(data: SubmitPageData): string {
  const form = data.form
  if (!form.title.trim()) return data.type === 'merchant' ? '请填写商家名称' : '请填写房源标题'
  if (!form.contactName.trim() || !form.phone.trim()) return '请填写联系人和电话'
  if (!form.location.trim() || !form.content.trim()) return '请填写地址和详细说明'
  if (data.type === 'merchant' && (!form.category || !form.subCategory || !form.area.trim() || !form.businessHours.trim())) return '请填写一级分类、二级分类、区域和营业时间'
  if (data.type === 'rental' && (!form.rent.trim() || !form.layout.trim() || !form.area.trim() || !form.validUntil)) return '请填写租金、户型、面积和有效期'
  if (data.type === 'rental' && data.publicImages.length === 0) return '房源至少上传一张公开图片'
  const missing = requiredEvidence(data.type, data.submitterRole)
    .find((type) => !data.evidenceFiles.some((item) => item.type === type))
  if (missing) return `请上传${EVIDENCE_LABELS[missing]}`
  if (!['truth', 'display', 'material'].every((value) => data.declarationValues.includes(value))) {
    return '请确认全部声明'
  }
  return ''
}

async function chooseAndPersistImages(count: number): Promise<string[]> {
  try {
    const result = await wx.chooseMedia({ count, mediaType: ['image'], sourceType: ['album', 'camera'] })
    const valid = result.tempFiles.filter((item) => Number(item.size || 0) <= MAX_FILE_SIZE)
    if (valid.length !== result.tempFiles.length) {
      wx.showToast({ title: '单张图片不能超过5MB', icon: 'none' })
    }
    const paths: string[] = []
    for (const file of valid) {
      const saved = await wx.saveFile({ tempFilePath: file.tempFilePath })
      paths.push(saved.savedFilePath)
    }
    return paths
  } catch (error) {
    const message = error && typeof error === 'object' && 'errMsg' in error ? String(error.errMsg) : ''
    if (!message.includes('cancel')) wx.showToast({ title: '选择图片失败', icon: 'none' })
    return []
  }
}
