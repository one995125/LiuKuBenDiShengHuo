<script setup lang="ts">
import { computed } from 'vue'
import { MAX_MERCHANT_PHONES } from '../services/phone-utils'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const phones = computed(() => (
  Array.isArray(props.modelValue) && props.modelValue.length ? props.modelValue : ['']
))

function updatePhone(index: number, value: string) {
  const next = [...phones.value]
  next[index] = value
  emit('update:modelValue', next)
}

function addPhone() {
  if (phones.value.length >= MAX_MERCHANT_PHONES) return
  emit('update:modelValue', [...phones.value, ''])
}

function removePhone(index: number) {
  if (phones.value.length === 1) {
    emit('update:modelValue', [''])
    return
  }
  emit('update:modelValue', phones.value.filter((_, itemIndex) => itemIndex !== index))
}

function makePrimary(index: number) {
  if (index === 0) return
  const next = [...phones.value]
  const [selected] = next.splice(index, 1)
  next.unshift(selected)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="phone-editor">
    <div class="phone-editor__header">
      <strong>联系电话</strong>
      <span>第一个号码为主号码，最多 {{ MAX_MERCHANT_PHONES }} 个</span>
    </div>
    <div v-for="(phone, index) in phones" :key="index" class="phone-editor__row">
      <t-input
        :value="phone"
        :placeholder="index === 0 ? '主号码' : `备用号码 ${index}`"
        @change="updatePhone(index, String($event))"
      />
      <t-tag v-if="index === 0" theme="success" variant="light">主号码</t-tag>
      <t-button v-else size="small" variant="text" @click="makePrimary(index)">设为主号</t-button>
      <t-button size="small" variant="text" theme="danger" @click="removePhone(index)">删除</t-button>
    </div>
    <t-button
      v-if="phones.length < MAX_MERCHANT_PHONES"
      size="small"
      variant="outline"
      @click="addPhone"
    >添加号码</t-button>
  </div>
</template>

<style scoped>
.phone-editor {
  display: grid;
  gap: 10px;
}

.phone-editor__header,
.phone-editor__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.phone-editor__header {
  justify-content: space-between;
}

.phone-editor__header span {
  color: var(--text-secondary);
  font-size: 12px;
}

.phone-editor__row :deep(.t-input) {
  flex: 1;
}
</style>
