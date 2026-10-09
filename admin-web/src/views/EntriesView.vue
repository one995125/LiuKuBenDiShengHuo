<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import PhoneListEditor from '../components/PhoneListEditor.vue'
import StatusTag from '../components/StatusTag.vue'
import {
  MERCHANT_AREA_OPTIONS,
  MERCHANT_CATEGORY_OPTIONS,
  MERCHANT_TAG_OPTIONS,
  getSubCategoryOptions,
} from '../constants/content-options'
import { callAdminApi, uploadImportImage } from '../services/cloudbase'
import { merchantPhonesFromRecord, normalizeMerchantPhones } from '../services/phone-utils'
import type { EntryRecord, EntryType, PageResult, ReviewStatus } from '../types/admin'

const props = defineProps<{ type: EntryType }>()
const rows = ref<EntryRecord[]>([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const status = ref('')
const includeHidden = ref(false)
const drawerVisible = ref(false)
const form = reactive<Record<string, any>>({})
const selectedTags = ref<string[]>([])
const imagesText = ref('')
const evidenceFiles = ref<Array<{ type: string; fileId: string }>>([])
const verificationChecks = reactive<Record<string, boolean>>({})

const labels = {
  merchant: { page: '商家管理', item: '商家', title: '商家名称' },
  job: { page: '招聘管理', item: '招聘', title: '岗位名称' },
  rental: { page: '房源管理', item: '房源', title: '房源标题' },
  offer: { page: '优惠活动', item: '活动', title: '活动标题' },
}
const currentLabel = computed(() => labels[props.type])
const subCategoryOptions = computed(() => getSubCategoryOptions(String(form.category || '')))
const evidenceOptions = computed(() => {
  if (props.type === 'merchant') return [['business_license', '营业执照'], ['storefront', '门头或经营场所']]
  if (props.type !== 'rental') return []
  return form.submitterRole === 'registered_agent'
    ? [['business_license', '中介营业执照'], ['brokerage_filing', '经纪备案证明'], ['owner_authorization', '业主授权'], ['ownership_proof', '房源权属证明']]
    : [['ownership_proof', '产权或合法出租权证明']]
})
const verificationOptions = computed(() => {
  if (props.type === 'merchant') return [['licenseSubject', '营业执照主体一致'], ['premise', '经营场所一致'], ['phoneCallback', '电话回拨完成'], ['displayConsent', '展示授权确认']]
  if (props.type !== 'rental') return []
  return form.submitterRole === 'registered_agent'
    ? [['agencySubject', '中介主体一致'], ['brokerageFiling', '备案信息有效'], ['ownerAuthorization', '业主授权有效'], ['rentalRight', '房源权属一致'], ['phoneCallback', '电话回拨完成']]
    : [['identityRelation', '发布人与权利人关系一致'], ['rentalRight', '出租权有效'], ['listingMatch', '房源信息一致'], ['phoneCallback', '电话回拨完成'], ['displayConsent', '展示授权确认']]
})
const columns = computed(() => [
  { colKey: 'mainTitle', title: currentLabel.value.title, ellipsis: true },
  { colKey: 'contactValue', title: '联系方式', width: 150 },
  { colKey: 'updatedAt', title: '更新时间', width: 170 },
  { colKey: 'promotion', title: '推广', width: 120 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'operation', title: '操作', width: 300 },
])

function displayRows() {
  return rows.value.map((row) => ({
    ...row,
    mainTitle: row.name || row.title || '',
    contactValue: row.phone || row.contact || '',
  }))
}

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<PageResult<EntryRecord>>('listEntries', {
      type: props.type,
      status: status.value,
      keyword: keyword.value,
      includeHidden: includeHidden.value,
      pageSize: 50,
    })
    rows.value = data.items
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '内容读取失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, {
    id: '',
    status: 'draft',
    version: 0,
    isTop: false,
    topUntil: '',
    isFeatured: false,
    featuredUntil: '',
    isPaid: false,
    paidType: '',
    chargeUntil: '',
    adminNote: '',
    reviewDueAt: '',
    consentConfirmed: false,
    checkedAt: '',
    sourceName: '',
    subCategory: '',
    area: '',
    hidden: false,
    deleted: false,
    phones: [''],
    displayOrder: 100,
    submitterRole: props.type === 'merchant' ? 'merchant_owner' : 'property_owner',
  })
  selectedTags.value = []
  imagesText.value = ''
  evidenceFiles.value = []
  Object.keys(verificationChecks).forEach((key) => delete verificationChecks[key])
}

function openCreate() {
  resetForm()
  drawerVisible.value = true
}

function openEdit(row: EntryRecord) {
  resetForm()
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  if (props.type === 'merchant') {
    form.phones = merchantPhonesFromRecord(row)
    form.phone = form.phones[0] || ''
  }
  selectedTags.value = Array.isArray(row.tags) ? [...row.tags] : []
  imagesText.value = Array.isArray(row.images) ? row.images.join('|') : ''
  evidenceFiles.value = Array.isArray(row.evidenceFiles) ? row.evidenceFiles.map((item) => ({ ...item })) : []
  Object.assign(verificationChecks, row.verification?.checks || {})
  drawerVisible.value = true
}

function handleCategoryChange() {
  if (props.type !== 'merchant') return
  if (!subCategoryOptions.value.includes(String(form.subCategory || ''))) {
    form.subCategory = ''
  }
}

async function save() {
  if (props.type === 'merchant') {
    const phoneResult = normalizeMerchantPhones(form.phones)
    if (phoneResult.error) {
      MessagePlugin.warning(phoneResult.error)
      return
    }
    form.phones = phoneResult.phones
    form.phone = phoneResult.phones[0]
  }
  saving.value = true
  try {
    const isVerified = (props.type === 'merchant' || props.type === 'rental') &&
      evidenceOptions.value.every(([type]) => evidenceFiles.value.some((item) => item.type === type)) &&
      verificationOptions.value.every(([key]) => verificationChecks[key] === true)
    await callAdminApi('saveEntry', {
      type: props.type,
      id: form.id,
      expectedVersion: form.version || 0,
      entry: {
        ...form,
        tags: props.type === 'merchant' ? selectedTags.value : [],
        images: imagesText.value.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 3),
        evidenceFiles: evidenceFiles.value,
        verification: {
          status: isVerified ? 'verified' : 'pending',
          checks: { ...verificationChecks },
          verifiedAt: isVerified ? new Date().toISOString() : '',
          verifiedByUid: '',
          note: String(form.adminNote || ''),
        },
      },
    })
    MessagePlugin.success(form.id ? '内容已更新' : '草稿已创建')
    drawerVisible.value = false
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function uploadEvidence(event: Event, type: string) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    MessagePlugin.warning('核验材料仅支持不超过5MB的 JPG/PNG 图片')
    return
  }
  try {
    const extension = file.type === 'image/png' ? 'png' : 'jpg'
    const fileId = await uploadImportImage(`liuku/admin/evidence/${Date.now()}/${type}.${extension}`, file)
    evidenceFiles.value = [...evidenceFiles.value.filter((item) => item.type !== type), { type, fileId }]
    MessagePlugin.success('核验材料已上传')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '材料上传失败')
  }
}

async function updateStatus(row: EntryRecord, nextStatus: ReviewStatus) {
  try {
    await callAdminApi('setEntryStatus', {
      type: props.type,
      id: row.id,
      status: nextStatus,
      expectedVersion: row.version || 0,
    })
    MessagePlugin.success(nextStatus === 'published' ? '已发布' : '已下架')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function toggleHidden(row: EntryRecord) {
  try {
    await callAdminApi('toggleEntryHidden', {
      type: props.type,
      id: row.id,
      hidden: !row.hidden,
      expectedVersion: row.version || 0,
    })
    MessagePlugin.success(row.hidden ? '已取消隐藏' : '已隐藏')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '隐藏状态更新失败')
  }
}

async function deleteRow(row: EntryRecord) {
  const title = row.name || row.title || row.id
  if (!window.confirm(`确认删除“${title}”？删除后前台不可见，后台默认也不再显示。`)) {
    return
  }
  try {
    await callAdminApi('deleteEntry', {
      type: props.type,
      id: row.id,
      expectedVersion: row.version || 0,
    })
    MessagePlugin.success('已删除')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除失败')
  }
}

watch(() => props.type, () => {
  keyword.value = ''
  status.value = ''
  includeHidden.value = false
  load()
})
onMounted(load)
</script>

<template>
  <PageHeader
    :title="currentLabel.page"
    :description="`维护正式${currentLabel.item}内容、上下架状态和推广到期时间`"
  >
    <t-button theme="primary" @click="openCreate">新增{{ currentLabel.item }}</t-button>
  </PageHeader>

  <section class="surface table-wrap">
    <div class="toolbar">
      <div class="toolbar-group">
        <t-input v-model="keyword" clearable placeholder="名称、电话或位置" style="width: 260px" @enter="load" />
        <t-select v-model="status" style="width: 130px" @change="load">
          <t-option value="" label="全部状态" />
          <t-option value="draft" label="草稿" />
          <t-option value="published" label="已发布" />
          <t-option value="offline" label="已下架" />
          <t-option value="expired" label="已过期" />
        </t-select>
        <t-button theme="primary" @click="load">查询</t-button>
      </div>
      <div class="toolbar-group">
        <span class="helper-text">显示隐藏</span>
        <t-switch v-model="includeHidden" @change="load" />
        <span class="helper-text">共 {{ rows.length }} 条</span>
      </div>
    </div>
    <t-table row-key="id" :data="displayRows()" :columns="columns" :loading="loading" :hover="true">
      <template #promotion="{ row }">
        <div class="inline-actions">
          <t-tag v-if="row.isTop" size="small" theme="primary" variant="light">置顶</t-tag>
          <t-tag v-if="row.isFeatured" size="small" theme="warning" variant="light">推荐</t-tag>
          <span v-if="!row.isTop && !row.isFeatured">-</span>
        </div>
      </template>
      <template #status="{ row }">
        <div class="inline-actions">
          <StatusTag :status="row.hidden ? 'hidden' : row.status" />
        </div>
      </template>
      <template #operation="{ row }">
        <div class="inline-actions">
          <t-button variant="text" theme="primary" @click="openEdit(row)">编辑</t-button>
          <t-button
            v-if="row.status !== 'published'"
            variant="text"
            theme="success"
            @click="updateStatus(row, 'published')"
          >发布</t-button>
          <t-button
            v-else
            variant="text"
            theme="danger"
            @click="updateStatus(row, 'offline')"
          >下架</t-button>
          <t-button
            variant="text"
            :theme="row.hidden ? 'success' : 'warning'"
            @click="toggleHidden(row)"
          >{{ row.hidden ? '取消隐藏' : '隐藏' }}</t-button>
          <t-button variant="text" theme="danger" @click="deleteRow(row)">删除</t-button>
        </div>
      </template>
      <template #empty><div class="empty-block">暂无内容</div></template>
    </t-table>
  </section>

  <t-drawer v-model:visible="drawerVisible" size="760px" :header="`${form.id ? '编辑' : '新增'}${currentLabel.item}`" :footer="false">
    <div class="form-grid">
      <template v-if="type === 'merchant'">
        <t-input v-model="form.name" label="商家名称" />
        <t-select v-model="form.category" label="一级分类" @change="handleCategoryChange">
          <t-option
            v-for="item in MERCHANT_CATEGORY_OPTIONS"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          />
        </t-select>
        <t-select v-model="form.subCategory" label="二级分类" :disabled="!form.category">
          <t-option
            v-for="item in subCategoryOptions"
            :key="item"
            :value="item"
            :label="item"
          />
        </t-select>
        <t-select v-model="form.area" label="区域">
          <t-option
            v-for="item in MERCHANT_AREA_OPTIONS"
            :key="item"
            :value="item"
            :label="item"
          />
        </t-select>
        <PhoneListEditor v-model="form.phones" class="full" />
        <t-input v-model="form.wechat" label="微信号" />
        <t-input v-model="form.address" label="地址" class="full" />
        <t-input v-model="form.businessHours" label="营业时间" class="full" />
        <t-select
          v-model="selectedTags"
          label="运营标签"
          class="full"
          multiple
          placeholder="仅供运营者记录，不对用户公开"
        >
          <t-option
            v-for="item in MERCHANT_TAG_OPTIONS"
            :key="item"
            :value="item"
            :label="item"
          />
        </t-select>
        <t-textarea v-model="form.description" label="简介" class="full" :autosize="{ minRows: 4 }" />
      </template>
      <template v-else-if="type === 'job'">
        <t-input v-model="form.title" label="岗位名称" />
        <t-input v-model="form.companyName" label="公司名称" />
        <t-input v-model="form.category" label="招聘分类" />
        <t-input v-model="form.salaryRange" label="薪资范围" />
        <t-input v-model="form.location" label="工作地点" />
        <t-input v-model="form.workingTime" label="工作时间" />
        <t-input v-model="form.headcount" label="招聘人数" />
        <t-input v-model="form.contact" label="联系方式" />
        <t-date-picker v-model="form.validUntil" placeholder="有效期" />
        <t-textarea v-model="form.requirement" label="岗位要求" class="full" :autosize="{ minRows: 4 }" />
      </template>
      <template v-else-if="type === 'rental'">
        <t-input v-model="form.title" label="房源标题" />
        <t-input v-model="form.rent" label="租金" />
        <t-input v-model="form.location" label="位置" />
        <t-input v-model="form.layout" label="户型" />
        <t-input v-model="form.area" label="面积" />
        <t-input v-model="form.contact" label="联系方式" />
        <t-date-picker v-model="form.validUntil" placeholder="有效期" />
        <t-textarea v-model="form.description" label="房源说明" class="full" :autosize="{ minRows: 4 }" />
      </template>
      <template v-else>
        <t-input v-model="form.title" label="活动标题" />
        <t-input v-model="form.merchantName" label="商家名称" />
        <t-input v-model="form.merchantId" label="关联商家 ID" placeholder="选填，例如 merchant_xxx" />
        <t-input v-model="form.phone" label="联系电话" />
        <t-input v-model="form.wechat" label="微信号" />
        <t-input-number v-model="form.displayOrder" label="轮播顺序" :min="0" :max="9999" />
        <t-date-picker v-model="form.validFrom" placeholder="活动开始日期" />
        <t-date-picker v-model="form.validUntil" placeholder="活动结束日期" />
        <t-input v-model="imagesText" label="图片 FileID" class="full" placeholder="最多 3 张，使用 | 分隔；可留空使用分类占位" />
        <t-textarea v-model="form.summary" label="活动摘要" class="full" :autosize="{ minRows: 2 }" />
        <t-textarea v-model="form.description" label="活动说明" class="full" :autosize="{ minRows: 4 }" />
      </template>

      <template v-if="type === 'merchant' || type === 'rental'">
        <t-divider class="full">主体资质与人工核验</t-divider>
        <t-select v-if="type === 'rental'" v-model="form.submitterRole" label="发布主体">
          <t-option value="property_owner" label="业主本人" />
          <t-option value="registered_agent" label="备案中介" />
        </t-select>
        <div class="full helper-text">核验材料仅管理员可访问；任一必核项未完成时后台不能发布。</div>
        <label
          v-for="option in evidenceOptions"
          :key="option[0]"
          class="t-button t-size-m t-button--theme-default t-button--variant-outline"
        >
          {{ evidenceFiles.some((item) => item.type === option[0]) ? `已上传：${option[1]}` : `上传：${option[1]}` }}
          <input hidden type="file" accept="image/jpeg,image/png" @change="uploadEvidence($event, option[0])" />
        </label>
        <t-checkbox
          v-for="option in verificationOptions"
          :key="option[0]"
          v-model="verificationChecks[option[0]]"
        >{{ option[1] }}</t-checkbox>
      </template>

      <t-divider class="full">推广与复核</t-divider>
      <t-switch v-if="type !== 'offer'" v-model="form.isTop" label="列表置顶" />
      <t-date-picker v-if="type !== 'offer'" v-model="form.topUntil" placeholder="置顶到期" />
      <t-switch v-model="form.isFeatured" label="首页推荐" />
      <t-date-picker v-model="form.featuredUntil" placeholder="推荐到期" />
      <t-switch v-model="form.isPaid" label="已收费" />
      <t-input v-model="form.paidType" label="收费类型" />
      <t-date-picker v-model="form.chargeUntil" placeholder="服务到期" />
      <t-date-picker v-model="form.reviewDueAt" placeholder="下次复核日期" />
      <t-input v-model="form.sourceName" label="信息来源" />
      <t-date-picker v-model="form.checkedAt" placeholder="最近核验日期" />
      <t-checkbox v-model="form.consentConfirmed">已确认联系方式和图片展示授权</t-checkbox>
      <t-textarea v-model="form.adminNote" label="运营备注" class="full" :autosize="{ minRows: 3 }" />
    </div>

    <div class="drawer-footer">
      <t-button theme="default" @click="drawerVisible = false">取消</t-button>
      <t-button theme="primary" :loading="saving" @click="save">保存</t-button>
    </div>
  </t-drawer>
</template>
