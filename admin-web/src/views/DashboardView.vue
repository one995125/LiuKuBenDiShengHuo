<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { callAdminApi } from '../services/cloudbase'
import type { Feedback, Submission } from '../types/admin'

interface DashboardData {
  counts: {
    publishedEntries: number
    pendingSubmissions: number
    pendingFeedbacks: number
    activePromotions: number
    activeOffers: number
  }
  recentFeedbacks: Feedback[]
  recentSubmissions: Submission[]
  serverTime: string
}

const router = useRouter()
const loading = ref(false)
const dashboard = ref<DashboardData>({
  counts: {
    publishedEntries: 0,
    pendingSubmissions: 0,
    pendingFeedbacks: 0,
    activePromotions: 0,
    activeOffers: 0,
  },
  recentFeedbacks: [],
  recentSubmissions: [],
  serverTime: '',
})

const feedbackColumns = [
  { colKey: 'entryTitle', title: '关联内容', ellipsis: true },
  { colKey: 'type', title: '类型', width: 80 },
  { colKey: 'status', title: '状态', width: 90 },
]

const submissionColumns = [
  { colKey: 'title', title: '投稿标题', ellipsis: true },
  { colKey: 'type', title: '类型', width: 90 },
  { colKey: 'status', title: '状态', width: 90 },
]

async function load() {
  loading.value = true
  try {
    dashboard.value = await callAdminApi<DashboardData>('dashboard')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '概览加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="今日运营概览" description="公开内容由运营者直接维护，集中处理纠错投诉和推广到期事项">
    <t-button theme="primary" @click="load">刷新数据</t-button>
  </PageHeader>

  <div class="summary-grid">
    <div class="summary-item surface">
      <span>待审核投稿</span>
      <strong>{{ dashboard.counts.pendingSubmissions }}</strong>
    </div>
    <div class="summary-item surface">
      <span>已发布内容</span>
      <strong>{{ dashboard.counts.publishedEntries }}</strong>
    </div>
    <div class="summary-item surface">
      <span>待处理纠错</span>
      <strong>{{ dashboard.counts.pendingFeedbacks }}</strong>
    </div>
    <div class="summary-item surface">
      <span>置顶 / 推荐</span>
      <strong>{{ dashboard.counts.activePromotions }}</strong>
    </div>
    <div class="summary-item surface">
      <span>进行中优惠</span>
      <strong>{{ dashboard.counts.activeOffers }}</strong>
    </div>
  </div>

  <div class="dashboard-grid">
    <section class="surface table-wrap">
      <div class="section-title">
        <h3>近期商家与房源投稿</h3>
        <t-button variant="text" theme="primary" @click="router.push({ name: 'submissions' })">查看全部</t-button>
      </div>
      <t-table row-key="id" :data="dashboard.recentSubmissions" :columns="submissionColumns" :loading="loading">
        <template #type="{ row }">{{ row.type === 'merchant' ? '商家' : '出租房源' }}</template>
        <template #status="{ row }"><StatusTag :status="row.status" /></template>
        <template #empty><div class="empty-block">暂无待审核投稿</div></template>
      </t-table>
    </section>
    <section class="surface table-wrap">
      <div class="section-title">
        <h3>近期纠错与投诉</h3>
        <t-button variant="text" theme="primary" @click="router.push({ name: 'feedbacks' })">查看全部</t-button>
      </div>
      <t-table
        row-key="id"
        :data="dashboard.recentFeedbacks"
        :columns="feedbackColumns"
        :loading="loading"
      >
        <template #type="{ row }">{{ row.type === 'complaint' ? '投诉' : '纠错' }}</template>
        <template #status="{ row }"><StatusTag :status="row.status" /></template>
        <template #empty><div class="empty-block">暂无待处理反馈</div></template>
      </t-table>
    </section>
  </div>
</template>
