import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { z } from 'zod'
import type { EntryType } from '../types/admin'
import { normalizeMerchantPhones } from './phone-utils'
import { isValidMerchantCategory } from '../constants/content-options'

export interface ImportIssue {
  sheet: string
  row: number
  field: string
  message: string
}

export interface ParsedImport {
  rows: Record<ImportEntryType, Record<string, unknown>[]>
  issues: ImportIssue[]
}

export interface ImportImage {
  sourceCode: string
  index: number
  extension: string
  blob: Blob
  originalName: string
}

const sheetConfig: Record<ImportEntryType, {
  sheetName: string
  headers: Record<string, string>
  schema: z.ZodTypeAny
}> = {
  merchant: {
    sheetName: '商家',
    headers: {
      编号: 'sourceCode',
      商家名称: 'name',
      分类: 'category',
      二级分类: 'subCategory',
      联系电话: 'phone',
      微信号: 'wechat',
      地址: 'address',
      营业时间: 'businessHours',
      简介: 'description',
      标签: 'tags',
      状态: 'status',
      信息来源: 'sourceName',
      授权确认: 'consentConfirmed',
      最近核验日期: 'checkedAt',
      运营备注: 'adminNote',
    },
    schema: z.object({
      sourceCode: z.string().regex(/^M[A-Z0-9_-]{3,29}$/, '商家编号应以 M 开头'),
      name: z.string().min(1, '商家名称不能为空'),
      category: z.string().min(1, '分类不能为空'),
      subCategory: z.string().min(1, '二级分类不能为空'),
      phone: z.string().min(1, '联系电话不能为空'),
      address: z.string().min(1, '地址不能为空'),
      description: z.string().min(1, '简介不能为空'),
    }),
  },
  rental: {
    sheetName: '房源',
    headers: {
      编号: 'sourceCode',
      房源标题: 'title',
      租金: 'rent',
      位置: 'location',
      户型: 'layout',
      面积: 'area',
      联系方式: 'contact',
      房源说明: 'description',
      有效期: 'validUntil',
      状态: 'status',
      信息来源: 'sourceName',
      授权确认: 'consentConfirmed',
      最近核验日期: 'checkedAt',
      运营备注: 'adminNote',
    },
    schema: z.object({
      sourceCode: z.string().regex(/^R[A-Z0-9_-]{3,29}$/, '房源编号应以 R 开头'),
      title: z.string().min(1, '房源标题不能为空'),
      rent: z.string().min(1, '租金不能为空'),
      location: z.string().min(1, '位置不能为空'),
      layout: z.string().min(1, '户型不能为空'),
      contact: z.string().min(1, '联系方式不能为空'),
      description: z.string().min(1, '房源说明不能为空'),
    }),
  },
}

export async function parseImportWorkbook(file: File): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook()
  // 显式转为 Uint8Array，兼容浏览器 File 与测试环境的 ArrayBuffer 实现差异。
  await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()) as any)
  const result: ParsedImport = {
    rows: { merchant: [], rental: [] },
    issues: [],
  }

  for (const type of Object.keys(sheetConfig) as ImportEntryType[]) {
    const config = sheetConfig[type]
    const sheet = workbook.getWorksheet(config.sheetName)
    if (!sheet) {
      result.issues.push({ sheet: config.sheetName, row: 0, field: '', message: '缺少工作表' })
      continue
    }
    const headers = new Map<number, string>()
    sheet.getRow(1).eachCell((cell, column) => {
      const key = config.headers[normalizeCellValue(cell.value)]
      if (key) headers.set(column, key)
    })

    const sourceCodes = new Set<string>()
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const record: Record<string, unknown> = {}
      headers.forEach((key, column) => {
        record[key] = normalizeCellValue(row.getCell(column).value)
      })
      if (Object.values(record).every((value) => value === '')) return

      record.sourceCode = String(record.sourceCode || '').toUpperCase()
      record.tags = String(record.tags || '').split('|').map((item) => item.trim()).filter(Boolean)
      if (type === 'merchant') {
        if (!isValidMerchantCategory(String(record.category || ''), String(record.subCategory || ''))) {
          result.issues.push({
            sheet: config.sheetName,
            row: rowNumber,
            field: 'subCategory',
            message: '一级分类和二级分类不匹配',
          })
          return
        }
        const phoneResult = normalizeMerchantPhones(record.phone)
        if (phoneResult.error) {
          result.issues.push({
            sheet: config.sheetName,
            row: rowNumber,
            field: 'phone',
            message: phoneResult.error,
          })
          return
        }
        record.phones = phoneResult.phones
        record.phone = phoneResult.phones[0]
      }
      record.consentConfirmed = ['是', 'yes', 'true', '1'].includes(
        String(record.consentConfirmed || '').toLowerCase(),
      )
      record.status = normalizeStatus(record.status)

      const parsed = config.schema.safeParse(record)
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          result.issues.push({
            sheet: config.sheetName,
            row: rowNumber,
            field: issue.path.join('.'),
            message: issue.message,
          })
        })
        return
      }
      const sourceCode = String(record.sourceCode)
      if (sourceCodes.has(sourceCode)) {
        result.issues.push({
          sheet: config.sheetName,
          row: rowNumber,
          field: 'sourceCode',
          message: '编号在当前工作表重复',
        })
        return
      }
      sourceCodes.add(sourceCode)
      result.rows[type].push(record)
    })
  }
  return result
}

function normalizeStatus(value: unknown): string {
  const text = String(value || '').trim()
  const map: Record<string, string> = {
    草稿: 'draft',
    已发布: 'published',
    已下架: 'offline',
    已过期: 'expired',
  }
  return map[text] || (['draft', 'published', 'offline', 'expired'].includes(text) ? text : 'draft')
}

export async function parseImageZip(file: File): Promise<{
  images: ImportImage[]
  issues: ImportIssue[]
}> {
  const zip = await JSZip.loadAsync(file)
  const images: ImportImage[] = []
  const issues: ImportIssue[] = []
  const counts = new Map<string, number>()

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const name = entry.name.split('/').pop() || ''
    const match = name.match(/^([MJR][A-Z0-9_-]{3,29})_([1-3])\.(jpg|jpeg|png|webp)$/i)
    if (!match) {
      issues.push({ sheet: '图片ZIP', row: 0, field: name, message: '文件名不符合 编号_序号.jpg' })
      continue
    }
    const sourceCode = match[1].toUpperCase()
    const count = (counts.get(sourceCode) || 0) + 1
    counts.set(sourceCode, count)
    if (count > 3) {
      issues.push({ sheet: '图片ZIP', row: 0, field: name, message: '同一编号最多 3 张图片' })
      continue
    }
    const blob = await entry.async('blob')
    if (blob.size > 2 * 1024 * 1024) {
      issues.push({ sheet: '图片ZIP', row: 0, field: name, message: '单张图片不能超过 2MB' })
      continue
    }
    images.push({
      sourceCode,
      index: Number(match[2]),
      extension: match[3].toLowerCase() === 'jpeg' ? 'jpg' : match[3].toLowerCase(),
      blob,
      originalName: name,
    })
  }

  return { images, issues }
}

function normalizeCellValue(value: ExcelJS.CellValue): string {
  if (value === null || typeof value === 'undefined') return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text || '').trim()
    if ('result' in value) return String(value.result || '').trim()
    if ('richText' in value) return value.richText.map((item) => item.text).join('').trim()
  }
  return String(value).trim()
}
export type ImportEntryType = Extract<EntryType, 'merchant' | 'rental'>
