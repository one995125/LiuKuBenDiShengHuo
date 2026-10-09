<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()
const labels: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  rejected: '已拒绝',
  expired: '已过期',
  offline: '已下架',
  resolved: '已处理',
  approved: '已通过',
  hidden: '已隐藏',
  deleted: '已删除',
}
const tones: Record<string, string> = {
  pending: 'warning',
  published: 'success',
  approved: 'success',
  resolved: 'success',
  rejected: 'danger',
  deleted: 'danger',
  hidden: 'warning',
  expired: 'default',
  offline: 'default',
  draft: 'primary',
}
const label = computed(() => labels[props.status] || props.status || '-')
const theme = computed(() => tones[props.status] || 'default')
</script>

<template>
  <t-tag :theme="theme as any" variant="light" size="small">{{ label }}</t-tag>
</template>
