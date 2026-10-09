<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { callAdminApi } from '../services/cloudbase'

interface Config {
  id: string
  phone: string
  wechat: string
  description: string
  version: number
}

const loading = ref(false)
const saving = ref(false)
const form = reactive<Config>({
  id: 'customer_service',
  phone: '',
  wechat: '',
  description: '',
  version: 0,
})

async function load() {
  loading.value = true
  try {
    const data = await callAdminApi<{ item: Config }>('getConfig', { id: 'customer_service' })
    Object.assign(form, data.item)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '配置读取失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await callAdminApi<{ version: number }>('updateConfig', {
      id: form.id,
      expectedVersion: form.version,
      config: form,
    })
    form.version = data.version
    MessagePlugin.success('客服配置已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '配置保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader title="客服配置" description="配置会同步给小程序底部客服入口和悬浮客服按钮" />
  <section class="surface" style="max-width: 760px; padding: 24px">
    <t-loading :loading="loading">
      <t-form layout="vertical">
        <t-form-item label="客服电话">
          <t-input v-model="form.phone" placeholder="未填写时小程序不显示拨号操作" />
        </t-form-item>
        <t-form-item label="客服微信">
          <t-input v-model="form.wechat" placeholder="未填写时小程序不显示复制微信操作" />
        </t-form-item>
        <t-form-item label="客服说明">
          <t-textarea v-model="form.description" :autosize="{ minRows: 4 }" />
        </t-form-item>
        <t-alert theme="warning" message="电话、微信属于联系信息。上线前应在隐私保护指引中说明收集和展示用途。" />
        <div class="drawer-footer">
          <t-button theme="primary" :loading="saving" @click="save">保存配置</t-button>
        </div>
      </t-form>
    </t-loading>
  </section>
</template>
