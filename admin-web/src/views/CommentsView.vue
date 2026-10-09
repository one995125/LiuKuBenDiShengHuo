<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { callAdminApi } from '../services/cloudbase'
import type { CommentPolicy, CommentRecord, CommentStatus, PageResult } from '../types/admin'

interface CommentPageResult extends PageResult<CommentRecord> {
  policy?: CommentPolicy
}

const rows = ref<CommentRecord[]>([])
const loading = ref(false)
const savingPolicy = ref(false)
const keyword = ref('')
const status = ref<CommentStatus | ''>('pending')
const includeHidden = ref(false)
const policyVersion = ref(0)
const blockedText = ref('')
const reviewText = ref('')
const notice = ref('评论提交后先进入人工审核，审核通过后展示。')

const columns = computed(() => [
  { colKey: 'entryTitle', title: '商家', width: 180, ellipsis: true },
  { colKey: 'content', title: '评论内容', ellipsis: true },
  { colKey: 'rating', title: '评分', width: 90 },
  { colKey: 'moderationReason', title: '风险原因', width: 180, ellipsis: true },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'createdAt', title: '提交时间', width: 180 },
  { colKey: 'operation', title: '操作', width: 300 },
])

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<CommentPageResult>('listComments', {
      status: status.value,
      keyword: keyword.value,
      includeHidden: includeHidden.value,
      pageSize: 50,
    })
    rows.value = data.items
    if (data.policy) {
      policyVersion.value = data.policy.version || 0
      blockedText.value = (data.policy.blockedWords || []).join('\n')
      reviewText.value = (data.policy.reviewWords || []).join('\n')
      notice.value = data.policy.notice || notice.value
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '评论读取失败')
  } finally {
    loading.value = false
  }
}

async function review(row: CommentRecord, nextStatus: 'approved' | 'rejected') {
  const moderationReason = nextStatus === 'rejected'
    ? window.prompt('请输入拒绝原因', row.moderationReason || '') || ''
    : row.moderationReason || ''
  try {
    await callAdminApi('reviewComment', {
      id: row.id,
      status: nextStatus,
      moderationReason,
      expectedVersion: row.version || 0,
    })
    MessagePlugin.success(nextStatus === 'approved' ? '评论已通过' : '评论已拒绝')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '审核失败')
  }
}

async function toggleHidden(row: CommentRecord) {
  try {
    await callAdminApi('toggleCommentHidden', {
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

async function deleteRow(row: CommentRecord) {
  if (!window.confirm('确认删除这条评论？删除后前台不可见，后台默认也不再显示。')) return
  try {
    await callAdminApi('deleteComment', {
      id: row.id,
      expectedVersion: row.version || 0,
    })
    MessagePlugin.success('评论已删除')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function savePolicy() {
  savingPolicy.value = true
  try {
    await callAdminApi('updateCommentPolicy', {
      expectedVersion: policyVersion.value,
      policy: {
        blockedWords: splitWords(blockedText.value),
        reviewWords: splitWords(reviewText.value),
        notice: notice.value,
      },
    })
    MessagePlugin.success('违禁词策略已保存')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '策略保存失败')
  } finally {
    savingPolicy.value = false
  }
}

function splitWords(value: string): string[] {
  return value
    .split(/[\n,，|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 200)
}

onMounted(load)
</script>

<template>
  <PageHeader
    title="评论管理"
    description="审核商家评论、处理隐藏删除，并维护评论违禁词策略"
  />

  <section class="surface table-wrap">
    <div class="toolbar">
      <div class="toolbar-group">
        <t-input v-model="keyword" clearable placeholder="商家、评论或风险原因" style="width: 280px" @enter="load" />
        <t-select v-model="status" style="width: 140px" @change="load">
          <t-option value="" label="全部评论" />
          <t-option value="pending" label="待审核" />
          <t-option value="approved" label="已通过" />
          <t-option value="rejected" label="已拒绝" />
          <t-option value="hidden" label="已隐藏" />
        </t-select>
        <t-button theme="primary" @click="load">查询</t-button>
      </div>
      <div class="toolbar-group">
        <span class="helper-text">显示隐藏</span>
        <t-switch v-model="includeHidden" @change="load" />
        <span class="helper-text">共 {{ rows.length }} 条</span>
      </div>
    </div>

    <t-table row-key="id" :data="rows" :columns="columns" :loading="loading" :hover="true">
      <template #rating="{ row }">{{ row.rating }} 星</template>
      <template #moderationReason="{ row }">{{ row.moderationReason || '-' }}</template>
      <template #status="{ row }"><StatusTag :status="row.hidden ? 'hidden' : row.status" /></template>
      <template #operation="{ row }">
        <div class="inline-actions">
          <t-button
            v-if="row.status !== 'approved'"
            variant="text"
            theme="success"
            @click="review(row, 'approved')"
          >通过</t-button>
          <t-button
            v-if="row.status !== 'rejected'"
            variant="text"
            theme="danger"
            @click="review(row, 'rejected')"
          >拒绝</t-button>
          <t-button
            variant="text"
            :theme="row.hidden ? 'success' : 'warning'"
            @click="toggleHidden(row)"
          >{{ row.hidden ? '取消隐藏' : '隐藏' }}</t-button>
          <t-button variant="text" theme="danger" @click="deleteRow(row)">删除</t-button>
        </div>
      </template>
      <template #empty><div class="empty-block">暂无评论</div></template>
    </t-table>
  </section>

  <section class="surface form-section">
    <div class="section-title">违禁词策略</div>
    <div class="policy-grid">
      <t-textarea
        v-model="blockedText"
        label="强违禁词"
        placeholder="命中后直接拦截，不入库；一行一个"
        :autosize="{ minRows: 5 }"
      />
      <t-textarea
        v-model="reviewText"
        label="普通敏感词"
        placeholder="命中后进入待审核，并标记风险原因；一行一个"
        :autosize="{ minRows: 5 }"
      />
      <t-textarea
        v-model="notice"
        label="提交提示"
        class="full"
        :autosize="{ minRows: 2 }"
      />
    </div>
    <div class="drawer-footer">
      <t-button theme="primary" :loading="savingPolicy" @click="savePolicy">保存策略</t-button>
    </div>
  </section>
</template>
