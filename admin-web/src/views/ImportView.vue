<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircleIcon, CloudUploadIcon, FileIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '../components/PageHeader.vue'
import {
  parseImageZip,
  parseImportWorkbook,
  type ImportImage,
  type ImportIssue,
  type ImportEntryType,
} from '../services/import-parser'
import { callAdminApi, uploadImportImage } from '../services/cloudbase'

const activeType = ref<ImportEntryType>('merchant')
const workbookName = ref('')
const zipName = ref('')
const rows = ref<Record<ImportEntryType, Record<string, unknown>[]>>({
  merchant: [],
  rental: [],
})
const images = ref<ImportImage[]>([])
const issues = ref<ImportIssue[]>([])
const parsing = ref(false)
const importing = ref(false)
const resultText = ref('')
// 使用 Vite 基础路径，兼容后台部署在 /liuku-admin/ 子目录的场景。
const templateDownloadUrl = `${import.meta.env.BASE_URL}${encodeURIComponent('六库生活圈资料采集模板.xlsx')}`

const typeLabels: Record<ImportEntryType, string> = {
  merchant: '商家',
  rental: '房源',
}
const currentRows = computed(() => rows.value[activeType.value])
const previewColumns = computed(() => {
  const base = [{ colKey: 'sourceCode', title: '编号', width: 110 }]
  if (activeType.value === 'merchant') {
    return [...base,
      { colKey: 'name', title: '商家名称' },
      { colKey: 'category', title: '分类', width: 120 },
      { colKey: 'phone', title: '联系电话', width: 150 },
      { colKey: 'status', title: '状态', width: 90 }]
  }
  return [...base,
    { colKey: 'title', title: '房源标题' },
    { colKey: 'rent', title: '租金', width: 130 },
    { colKey: 'contact', title: '联系方式', width: 150 },
    { colKey: 'status', title: '状态', width: 90 }]
})

async function selectWorkbook(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  parsing.value = true
  try {
    const parsed = await parseImportWorkbook(file)
    workbookName.value = file.name
    rows.value = parsed.rows
    issues.value = [...parsed.issues]
    resultText.value = ''
    MessagePlugin.success('Excel 解析完成')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : 'Excel 解析失败')
  } finally {
    parsing.value = false
  }
}

async function selectZip(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  parsing.value = true
  try {
    const parsed = await parseImageZip(file)
    zipName.value = file.name
    images.value = parsed.images
    issues.value = [...issues.value.filter((item) => item.sheet !== '图片ZIP'), ...parsed.issues]
    MessagePlugin.success(`已识别 ${parsed.images.length} 张图片`)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '图片 ZIP 解析失败')
  } finally {
    parsing.value = false
  }
}

async function confirmImport() {
  const totalRows = Object.values(rows.value).reduce((sum, items) => sum + items.length, 0)
  if (totalRows === 0) {
    MessagePlugin.warning('请先选择有效的 Excel 模板')
    return
  }
  if (issues.value.length > 0) {
    MessagePlugin.warning('请先修复校验错误后重新上传')
    return
  }

  importing.value = true
  resultText.value = ''
  try {
    const imageMap = new Map<string, string[]>()
    for (const image of images.value) {
      const cloudPath = `liuku/imports/${Date.now()}/${image.sourceCode}_${image.index}.${image.extension}`
      const fileId = await uploadImportImage(cloudPath, image.blob)
      const current = imageMap.get(image.sourceCode) || []
      current.push(fileId)
      imageMap.set(image.sourceCode, current)
    }

    const summaries: string[] = []
    for (const type of ['merchant', 'rental'] as ImportEntryType[]) {
      if (rows.value[type].length === 0) continue
      const payloadRows = rows.value[type].map((row) => ({
        ...row,
        images: imageMap.get(String(row.sourceCode)) || [],
      }))
      const summary = await callAdminApi<{
        inserted: number
        updated: number
        failed: number
      }>('importEntries', { type, rows: payloadRows })
      summaries.push(
        `${typeLabels[type]}：新增 ${summary.inserted}，更新 ${summary.updated}，失败 ${summary.failed}`,
      )
    }
    resultText.value = summaries.join('；')
    MessagePlugin.success('批量导入完成')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <PageHeader title="Excel 批量导入" description="上传模板后先校验预览，确认无误后写入开发环境">
    <a
      class="t-button t-size-m t-button--theme-default t-button--variant-outline"
      :href="templateDownloadUrl"
      download="六库生活圈资料采集模板.xlsx"
    >
      下载采集模板
    </a>
  </PageHeader>

  <section class="surface import-steps">
    <t-steps :current="workbookName ? (issues.length ? 1 : resultText ? 3 : 2) : 0">
      <t-step-item title="上传文件" />
      <t-step-item title="解析校验" />
      <t-step-item title="确认导入" />
      <t-step-item title="导入完成" />
    </t-steps>

    <div v-if="!workbookName" class="upload-zone">
      <div>
        <CloudUploadIcon size="38" />
        <strong>选择资料采集 Excel</strong>
        <p>仅支持商家、房源两个工作表；招聘频道暂未开放</p>
        <label class="t-button t-size-m t-button--theme-primary t-button--variant-base">
          选择 Excel
          <input hidden type="file" accept=".xlsx" @change="selectWorkbook" />
        </label>
      </div>
    </div>

    <template v-else>
      <div class="toolbar" style="margin-top: 18px; border: 1px solid var(--border)">
        <div class="toolbar-group">
          <FileIcon />
          <strong>{{ workbookName }}</strong>
          <t-tag theme="success" variant="light">{{ Object.values(rows).flat().length }} 条有效记录</t-tag>
        </div>
        <div class="toolbar-group">
          <label class="t-button t-size-m t-button--theme-default t-button--variant-outline">
            {{ zipName ? '重新选择图片 ZIP' : '选择图片 ZIP（可选）' }}
            <input hidden type="file" accept=".zip" @change="selectZip" />
          </label>
          <label class="t-button t-size-m t-button--theme-default t-button--variant-outline">
            重新选择 Excel
            <input hidden type="file" accept=".xlsx" @change="selectWorkbook" />
          </label>
        </div>
      </div>

      <div class="validation-summary">
        <span class="valid">有效：{{ Object.values(rows).flat().length }} 条</span>
        <span class="invalid">错误：{{ issues.length }} 条</span>
        <span>图片：{{ images.length }} 张</span>
      </div>

      <t-alert
        v-if="issues.length"
        theme="error"
        :message="`发现 ${issues.length} 个问题，请修复 Excel 或 ZIP 后重新上传。`"
        style="margin: 16px 0"
      >
        <template #operation>
          {{ issues.slice(0, 5).map((item) => `${item.sheet} 第${item.row || '-'}行：${item.message}`).join('；') }}
        </template>
      </t-alert>

      <t-tabs v-model="activeType">
        <t-tab-panel value="merchant" :label="`商家 ${rows.merchant.length}`" />
        <t-tab-panel value="rental" :label="`房源 ${rows.rental.length}`" />
      </t-tabs>
      <t-table row-key="sourceCode" :data="currentRows" :columns="previewColumns" :loading="parsing" max-height="420" />

      <t-alert v-if="resultText" theme="success" style="margin-top: 16px">
        <template #icon><CheckCircleIcon /></template>
        {{ resultText }}
      </t-alert>

      <div class="drawer-footer">
        <t-button theme="primary" :loading="importing" :disabled="issues.length > 0" @click="confirmImport">
          确认导入开发环境
        </t-button>
      </div>
    </template>
  </section>
</template>
