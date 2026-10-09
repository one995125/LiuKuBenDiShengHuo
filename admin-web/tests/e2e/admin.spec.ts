import { expect, test } from '@playwright/test'

test('运营后台主要页面可以使用模拟数据打开', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByText('今日运营概览')).toBeVisible()
  await expect(page.getByText('已发布内容', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '投稿审核' })).toBeVisible()
  await expect(page.getByRole('button', { name: '招聘管理' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '评论管理' })).toHaveCount(0)

  await page.getByRole('button', { name: '商家管理' }).click()
  await expect(page.getByRole('heading', { name: '商家管理', level: 2 })).toBeVisible()
  await expect(page.getByText('六库阿丽小吃')).toBeVisible()

  await page.getByRole('button', { name: '投稿审核' }).click()
  await expect(page.getByRole('heading', { name: '投稿审核', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: '优惠活动' }).click()
  await expect(page.getByRole('heading', { name: '优惠活动', level: 2 })).toBeVisible()
  await expect(page.getByText('周末到店九折')).toBeVisible()

  await page.getByRole('button', { name: '纠错投诉' }).click()
  await expect(page.getByRole('heading', { name: '纠错与投诉', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: '批量导入' }).click()
  await expect(page.getByRole('heading', { name: 'Excel 批量导入', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: '客服配置' }).click()
  await expect(page.getByRole('heading', { name: '客服配置', level: 2 })).toBeVisible()
  await expect(page.locator('input[value="0876-1234567"]')).toBeVisible()

  await page.getByRole('button', { name: '操作日志' }).click()
  await expect(page.getByRole('heading', { name: '管理员操作日志', level: 2 })).toBeVisible()
  await expect(page.getByText('演示管理员')).toBeVisible()
})

test('运营概览桌面布局没有水平溢出', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByText('今日运营概览')).toBeVisible()
  await expect(page.getByText('近期纠错与投诉')).toBeVisible()
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  await page.screenshot({
    path: '../.artifacts/admin-web/dashboard.png',
    fullPage: true,
  })
})

test('商家编辑支持添加号码并设置主号码', async ({ page }) => {
  await page.goto('/#/merchants')
  await expect(page.getByRole('heading', { name: '商家管理', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: '编辑' }).first().click()

  await expect(page.getByText('第一个号码为主号码')).toBeVisible()
  await page.getByRole('button', { name: '添加号码' }).click()
  const phoneInputs = page.locator('.phone-editor input')
  await expect(phoneInputs).toHaveCount(2)
  await phoneInputs.nth(1).fill('0876-1234567')
  await page.getByRole('button', { name: '设为主号' }).click()

  await expect(phoneInputs.nth(0)).toHaveValue('0876-1234567')
  await expect(phoneInputs.nth(1)).toHaveValue('13900001111')
  await page.screenshot({
    path: '../.artifacts/admin-web/merchant-phone-editor.png',
    fullPage: true,
  })
})
