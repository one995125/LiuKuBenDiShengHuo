import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { parseImageZip, parseImportWorkbook } from './import-parser'

describe('parseImageZip', () => {
  it('accepts named images and rejects invalid names', async () => {
    const zip = new JSZip()
    zip.file('M0001_1.jpg', new Uint8Array([1, 2, 3]))
    zip.file('bad-name.jpg', new Uint8Array([1]))
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'images.zip', { type: 'application/zip' })
    const result = await parseImageZip(file)
    expect(result.images).toHaveLength(1)
    expect(result.images[0].sourceCode).toBe('M0001')
    expect(result.issues).toHaveLength(1)
  })
})

describe('parseImportWorkbook merchant phones', () => {
  async function buildWorkbook(phone: string) {
    const workbook = new ExcelJS.Workbook()
    const merchant = workbook.addWorksheet('商家')
    merchant.addRow(['编号', '商家名称', '分类', '二级分类', '联系电话', '地址', '简介'])
    merchant.addRow(['M0001', '示例商家', '生活服务', '水电维修', phone, '六库城区', '测试商家'])
    const job = workbook.addWorksheet('招聘')
    job.addRow(['编号'])
    const rental = workbook.addWorksheet('房源')
    rental.addRow(['编号'])
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      name: 'phones.xlsx',
      arrayBuffer: async () => buffer as unknown as ArrayBuffer,
    } as File
  }

  it('parses, trims and deduplicates up to three phone numbers', async () => {
    const result = await parseImportWorkbook(
      await buildWorkbook('13800000000 | 0876-1234567 | 13800000000'),
    )
    expect(result.issues).toHaveLength(0)
    expect(result.rows.merchant[0].phone).toBe('13800000000')
    expect(result.rows.merchant[0].phones).toEqual(['13800000000', '0876-1234567'])
  })

  it.each([
    ['13800000000||0876-1234567', '空号码'],
    ['13800000000|0876-1|0876-2|0876-3', '最多填写 3 个'],
    ['13800000000|老板电话', '只能包含数字'],
  ])('rejects invalid merchant phones: %s', async (phone, message) => {
    const result = await parseImportWorkbook(await buildWorkbook(phone))
    expect(result.rows.merchant).toHaveLength(0)
    expect(result.issues.some((issue) => issue.message.includes(message))).toBe(true)
  })
})
