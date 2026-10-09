<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { callAdminApi } from '../services/cloudbase'
import type { Feedback, PageResult } from '../types/admin'

const loading = ref(false)
const rows = ref<Feedback[]>([])
const status = ref('pending')
const keyword = ref('')
const current = ref<Feedback | null>(null)
const resolution = ref('')
const dialogVisible = ref(false)

const columns = [
  { colKey: 'type', title: '类型', width: 90 },
  { colKey: 'entryTitle', title: '关联内容', ellipsis: true },
  { colKey: 'content', title: '反馈说明', ellipsis: true },
  { colKey: 'contact', title: '联系方式', width: 150 },
  { colKey: 'updatedAt', title: '提交时间', width: 170 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'operation', title: '操作', width: 90 },
]

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<PageResult<Feedback>>('listFeedbacks', {
      status: status.value,
      keyword: keyword.value,
      pageSize: 50,
    })
    rows.value = data.items
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '反馈读取失败')
  } finally {
    loading.value = false
  }
}

function open(row: Feedback) {
  current.value = row
  resolution.value = row.resolution || ''
  dialogVisible.value = true
}

async function resolve() {
  if (!current.value || !resolution.value.trim()) {
    MessagePlugin.warning('请填写处理结果')
    return
  }
  try {
    await callAdminApi('resolveFeedback', {
      id: current.value.id,
      expectedVersion: current.value.version || 0,
      resolution: resolution.value,
    })
    MessagePlugin.success('反馈已处理')
    dialogVisible.value = false
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '处理失败')
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="纠错与投诉" description="处理用户提交的内容纠错、侵权和投诉信息" />
  <section class="surface table-wrap">
    <div class="toolbar">
      <div class="toolbar-group">
        <t-input v-model="keyword" clearable placeholder="关联内容、说明或联系方式" style="width: 280px" @enter="load" />
        <t-select v-model="status" style="width: 130px" @change="load">
          <t-option value="" label="全部状态" />
          <t-option value="pending" label="待处理" />
          <t-option value="resolved" label="已处理" />
        </t-select>
        <t-button theme="primary" @click="load">查询</t-button>
      </div>
    </div>
    <t-table row-key="id" :data="rows" :columns="columns" :loading="loading" :hover="true">
      <template #type="{ row }">{{ row.type === 'complaint' ? '投诉' : '纠错' }}</template>
      <template #status="{ row }"><StatusTag :status="row.status" /></template>
      <template #operation="{ row }">
        <t-button variant="text" theme="primary" @click="open(row)">{{ row.status === 'resolved' ? '查看' : '处理' }}</t-button>
      </template>
      <template #empty><div class="empty-block">暂无反馈记录</div></template>
    </t-table>
  </section>

  <t-dialog v-model:visible="dialogVisible" header="处理纠错 / 投诉" :on-confirm="resolve">
    <template v-if="current">
      <p><strong>关联内容：</strong>{{ current.entryTitle || '未关联具体内容' }}</p>
      <p><strong>用户说明：</strong>{{ current.content }}</p>
      <p><strong>联系方式：</strong>{{ current.contact || '未填写' }}</p>
      <t-textarea v-model="resolution" placeholder="填写核实结果、处理动作或回复说明" :autosize="{ minRows: 4 }" />
    </template>
  </t-dialog>
</template>
