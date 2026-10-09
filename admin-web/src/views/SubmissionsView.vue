<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import PhoneListEditor from '../components/PhoneListEditor.vue'
import StatusTag from '../components/StatusTag.vue'
import { callAdminApi, getPrivateFileUrls } from '../services/cloudbase'
import { normalizeMerchantPhones } from '../services/phone-utils'
import type { PageResult, Submission } from '../types/admin'

const loading = ref(false)
const rows = ref<Submission[]>([])
const keyword = ref('')
const status = ref('pending')
const drawerVisible = ref(false)
const current = ref<Submission | null>(null)
const rejectReason = ref('')
const decisionLoading = ref(false)
const entry = reactive<Record<string, any>>({})
const verificationChecks = reactive<Record<string, boolean>>({})
const verificationNote = ref('')
const evidenceUrls = ref<Record<string, string>>({})

const typeLabels: Record<string, string> = {
  merchant: '商家电话',
  rental: '房屋出租',
}

const evidenceLabels: Record<string, string> = {
  business_license: '营业执照', storefront: '门头或实际经营场所', ownership_proof: '产权或出租权证明',
  brokerage_filing: '房地产经纪备案证明', owner_authorization: '业主房源发布授权',
}

const verificationOptions = computed(() => {
  if (current.value?.type === 'merchant') {
    return [
      ['licenseSubject', '营业执照主体一致'], ['premise', '经营场所一致'],
      ['phoneCallback', '电话回拨完成'], ['displayConsent', '展示授权确认'],
    ]
  }
  if (current.value?.submitterRole === 'registered_agent') {
    return [
      ['agencySubject', '中介机构主体一致'], ['brokerageFiling', '备案信息有效'],
      ['ownerAuthorization', '业主授权有效'], ['rentalRight', '房源权属材料一致'],
      ['phoneCallback', '电话回拨完成'],
    ]
  }
  return [
    ['identityRelation', '发布人与权利人关系一致'], ['rentalRight', '出租权证明有效'],
    ['listingMatch', '房源信息一致'], ['phoneCallback', '电话回拨完成'],
    ['displayConsent', '展示授权确认'],
  ]
})
const canApprove = computed(() =>
  Boolean(current.value?.evidenceFiles?.length) &&
  verificationOptions.value.every(([key]) => verificationChecks[key] === true),
)

const columns = [
  { colKey: 'type', title: '类型', width: 110 },
  { colKey: 'title', title: '投稿标题', ellipsis: true },
  { colKey: 'userProfile', title: '提交用户', width: 130 },
  { colKey: 'contactName', title: '联系人', width: 110 },
  { colKey: 'phone', title: '联系电话', width: 140 },
  { colKey: 'updatedAt', title: '提交时间', width: 170 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'operation', title: '操作', width: 90 },
]

const canonicalType = computed(() => current.value?.type)

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<PageResult<Submission>>('listSubmissions', {
      status: status.value,
      keyword: keyword.value,
      pageSize: 50,
    })
    rows.value = data.items
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '投稿读取失败')
  } finally {
    loading.value = false
  }
}

async function open(row: Submission) {
  current.value = row
  rejectReason.value = ''
  verificationNote.value = ''
  evidenceUrls.value = {}
  Object.keys(verificationChecks).forEach((key) => delete verificationChecks[key])
  Object.keys(entry).forEach((key) => delete entry[key])
  if (row.type === 'merchant') {
    Object.assign(entry, {
      name: row.title,
      category: row.category || '其他便民',
      phone: row.phone,
      phones: [row.phone],
      wechat: row.wechat,
      address: row.location || '六库城区',
      businessHours: row.businessHours || '电话联系',
      description: row.content,
      tags: [],
      images: row.publicImages || row.images,
    })
  } else if (row.type === 'rental') {
    Object.assign(entry, {
      title: row.title,
      rent: row.rent || '面议',
      location: row.location || '六库城区',
      layout: row.layout || '请咨询发布者',
      area: row.area || '',
      contact: row.phone,
      description: row.content,
      validUntil: '',
      images: row.publicImages || row.images,
    })
  }
  const fileIds = (row.evidenceFiles || []).map((item) => item.fileId).filter(Boolean)
  evidenceUrls.value = await getPrivateFileUrls(fileIds)
  drawerVisible.value = true
}

async function decide(decision: 'approve' | 'reject') {
  if (!current.value) return
  if (decision === 'reject' && !rejectReason.value.trim()) {
    MessagePlugin.warning('拒绝投稿时必须填写原因')
    return
  }
  if (decision === 'approve' && canonicalType.value === 'merchant') {
    const phoneResult = normalizeMerchantPhones(entry.phones)
    if (phoneResult.error) {
      MessagePlugin.warning(phoneResult.error)
      return
    }
    entry.phones = phoneResult.phones
    entry.phone = phoneResult.phones[0]
  }
  if (decision === 'approve' && !canApprove.value) {
    MessagePlugin.warning('请完成全部核验项并确认核验材料')
    return
  }
  decisionLoading.value = true
  try {
    await callAdminApi('reviewSubmission', {
      id: current.value.id,
      decision,
      expectedVersion: current.value.version || 0,
      rejectReason: rejectReason.value,
      entry,
      verificationChecks: { ...verificationChecks },
      verificationNote: verificationNote.value,
    })
    MessagePlugin.success(decision === 'approve' ? '投稿已通过并发布' : '投稿已拒绝')
    drawerVisible.value = false
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '审核失败')
  } finally {
    decisionLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="投稿审核" description="审核通过后生成正式公开内容，拒绝时必须记录原因" />

  <section class="surface table-wrap">
    <div class="toolbar">
      <div class="toolbar-group">
        <t-input v-model="keyword" clearable placeholder="标题、联系人或电话" style="width: 260px" @enter="load" />
        <t-select v-model="status" style="width: 130px" @change="load">
          <t-option value="" label="全部状态" />
          <t-option value="pending" label="待审核" />
          <t-option value="published" label="已通过" />
          <t-option value="rejected" label="已拒绝" />
        </t-select>
        <t-button theme="primary" @click="load">查询</t-button>
      </div>
      <span class="helper-text">共 {{ rows.length }} 条</span>
    </div>
    <t-table row-key="id" :data="rows" :columns="columns" :loading="loading" :hover="true">
      <template #type="{ row }">{{ typeLabels[row.type] || row.type }}</template>
      <template #userProfile="{ row }">
        {{ row.userProfileSnapshot?.nickname || row.userProfileSnapshot?.publicId || '-' }}
      </template>
      <template #status="{ row }"><StatusTag :status="row.status" /></template>
      <template #operation="{ row }">
        <t-button variant="text" theme="primary" @click="open(row)">审核</t-button>
      </template>
      <template #empty><div class="empty-block">没有符合条件的投稿</div></template>
    </t-table>
  </section>

  <t-drawer v-model:visible="drawerVisible" size="720px" header="投稿审核" :footer="false">
    <template v-if="current">
      <t-descriptions bordered :column="2" size="small">
        <t-descriptions-item label="投稿类型">{{ typeLabels[current.type] }}</t-descriptions-item>
        <t-descriptions-item label="提交时间">{{ current.createdAt }}</t-descriptions-item>
        <t-descriptions-item label="提交用户">
          {{ current.userProfileSnapshot?.nickname || current.userProfileSnapshot?.publicId || '未完善资料' }}
        </t-descriptions-item>
        <t-descriptions-item label="联系人">{{ current.contactName }}</t-descriptions-item>
        <t-descriptions-item label="电话">{{ current.phone }}</t-descriptions-item>
        <t-descriptions-item label="微信">{{ current.wechat || '-' }}</t-descriptions-item>
        <t-descriptions-item label="位置">{{ current.location || '-' }}</t-descriptions-item>
        <t-descriptions-item label="提交主体">
          {{ current.submitterRole === 'merchant_owner' ? '持照商家' : current.submitterRole === 'registered_agent' ? '备案中介' : '业主本人' }}
        </t-descriptions-item>
        <t-descriptions-item label="投稿说明" :span="2">{{ current.content }}</t-descriptions-item>
      </t-descriptions>

      <h3>私密核验材料</h3>
      <div class="form-grid">
        <a
          v-for="material in current.evidenceFiles || []"
          :key="material.type"
          class="surface"
          style="padding: 12px; color: var(--brand); text-decoration: none"
          :href="evidenceUrls[material.fileId] || undefined"
          target="_blank"
          rel="noreferrer"
        >{{ evidenceLabels[material.type] || material.type }} · 打开预览</a>
      </div>

      <h3>人工核验清单</h3>
      <div class="form-grid">
        <t-checkbox
          v-for="option in verificationOptions"
          :key="option[0]"
          v-model="verificationChecks[option[0]]"
        >{{ option[1] }}</t-checkbox>
        <t-textarea v-model="verificationNote" label="核验备注" class="full" :autosize="{ minRows: 2 }" />
      </div>

      <h3>正式内容</h3>
      <div class="form-grid">
        <template v-if="canonicalType === 'merchant'">
          <t-input v-model="entry.name" label="商家名称" />
          <t-input v-model="entry.category" label="分类" />
          <PhoneListEditor v-model="entry.phones" class="full" />
          <t-input v-model="entry.wechat" label="微信" />
          <t-input v-model="entry.address" label="地址" class="full" />
          <t-input v-model="entry.businessHours" label="营业时间" class="full" />
          <t-textarea v-model="entry.description" label="简介" class="full" :autosize="{ minRows: 3 }" />
        </template>
        <template v-else-if="canonicalType === 'rental'">
          <t-input v-model="entry.title" label="房源标题" />
          <t-input v-model="entry.rent" label="租金" />
          <t-input v-model="entry.location" label="位置" />
          <t-input v-model="entry.layout" label="户型" />
          <t-input v-model="entry.area" label="面积" />
          <t-input v-model="entry.contact" label="联系方式" />
          <t-textarea v-model="entry.description" label="说明" class="full" :autosize="{ minRows: 3 }" />
        </template>
        <t-textarea
          v-model="rejectReason"
          label="拒绝原因"
          class="full"
          placeholder="仅拒绝时必填，用户会在“我的发布”中看到"
          :autosize="{ minRows: 2 }"
        />
      </div>

      <div class="drawer-footer">
        <t-button theme="danger" variant="outline" :loading="decisionLoading" @click="decide('reject')">拒绝投稿</t-button>
        <t-button theme="primary" :loading="decisionLoading" :disabled="!canApprove" @click="decide('approve')">通过并发布</t-button>
      </div>
    </template>
  </t-drawer>
</template>
