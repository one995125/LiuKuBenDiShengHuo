<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { callAdminApi } from '../services/cloudbase'
import type { AdminLog, PageResult } from '../types/admin'

const loading = ref(false)
const rows = ref<AdminLog[]>([])
const columns = [
  { colKey: 'createdAt', title: '操作时间', width: 180 },
  { colKey: 'actorName', title: '操作人', width: 130 },
  { colKey: 'action', title: '动作', width: 190 },
  { colKey: 'targetType', title: '对象类型', width: 110 },
  { colKey: 'targetId', title: '对象 ID', ellipsis: true },
  { colKey: 'changedFields', title: '变更摘要', ellipsis: true },
  { colKey: 'requestId', title: '请求 ID', ellipsis: true },
]

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<PageResult<AdminLog>>('listAdminLogs', { pageSize: 50 })
    rows.value = data.items
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '日志读取失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="管理员操作日志" description="日志仅记录动作和变更字段，不复制完整联系电话、微信或反馈正文">
    <t-button theme="primary" @click="load">刷新</t-button>
  </PageHeader>
  <section class="surface table-wrap">
    <t-table row-key="_id" :data="rows" :columns="columns" :loading="loading" :hover="true">
      <template #changedFields="{ row }">{{ row.changedFields.join('、') || '-' }}</template>
      <template #empty><div class="empty-block">暂无操作日志</div></template>
    </t-table>
  </section>
</template>
