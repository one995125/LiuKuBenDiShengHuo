const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(projectRoot, '.artifacts', 'miniprogram-smoke')
const defaultCliPath = 'D:\\Software\\微信web开发者工具\\cli.bat'
const devToolsCliPath = process.env.WECHAT_DEVTOOLS_CLI || defaultCliPath
const commandPath = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
const autoPort = Number(process.env.WECHAT_AUTO_PORT || 9420)
const automationTimeout = Number(process.env.WECHAT_AUTOMATION_TIMEOUT_MS || 120000)
const captureScreenshots = process.env.WECHAT_CAPTURE_SCREENSHOTS === '1'

const routes = [
  ['首页', '/pages/index/index'],
  ['商家列表', '/pages/merchant-list/index'],
  ['商家详情', '/pages/merchant-detail/index?id=merchant-001'],
  ['租房列表', '/pages/rental-list/index'],
  ['租房详情', '/pages/rental-detail/index?id=rental-001'],
  ['优惠活动详情', '/pages/offer-detail/index?id=offer-001'],
  ['维修列表', '/pages/repair-list/index'],
  ['购物零售', '/pages/shopping-list/index'],
  ['我的', '/pages/mine/index'],
  ['提交商家资料', '/pages/submit-entry/index?type=merchant'],
  ['发布出租房源', '/pages/submit-entry/index?type=rental'],
  ['我的投稿', '/pages/my-submissions/index'],
  ['纠错反馈', '/pages/feedback/index'],
  ['隐藏管理页', '/pages/admin/index'],
]

function routePath(url) {
  return url.split('?')[0].replace(/^\//, '')
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForPageData(page, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const data = await page.data()
    if (predicate(data)) return data
    await sleep(200)
  }
  throw new Error('等待页面异步数据超时')
}

async function waitForCurrentPage(miniProgram) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const page = await miniProgram.currentPage()
      if (page && page.path) return page
    } catch (error) {
      // 项目刚打开时 AppService 可能尚未就绪，继续等待。
    }
    await sleep(1000)
  }
  throw new Error('项目启动后 60 秒内未出现可用页面')
}

async function enableAutomation() {
  try {
    const miniProgram = await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${autoPort}`,
    })
    return { child: null, miniProgram }
  } catch (error) {
    // 端口尚未运行时再调用官方 CLI 启动自动化。
  }

  const output = []
  let servicePortDisabled = false
  let servicePortConfirmed = false
  const child = spawn(commandPath, [
    '/d',
    '/c',
    devToolsCliPath,
    'auto',
    '--project',
    projectRoot,
    '--auto-port',
    String(autoPort),
    '--trust-project',
  ], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const collectOutput = (chunk) => {
    const text = chunk.toString()
    output.push(text)
    if (/service port disabled|服务端口已关闭/i.test(text)) {
      servicePortDisabled = true
    }
    if (
      !servicePortConfirmed
      && /Enable IDE Service|开启.*服务|服务端口已关闭/i.test(text)
      && child.stdin.writable
    ) {
      // 官方 CLI 明确要求确认时自动输入 y，便于首次运行完成服务端口开启。
      servicePortConfirmed = true
      servicePortDisabled = false
      child.stdin.write('y\n')
    }
  }
  child.stdout.on('data', collectOutput)
  child.stderr.on('data', collectOutput)

  const deadline = Date.now() + automationTimeout
  while (Date.now() < deadline) {
    if (servicePortDisabled && !servicePortConfirmed) break
    try {
      const miniProgram = await automator.connect({
        wsEndpoint: `ws://127.0.0.1:${autoPort}`,
      })
      return { child, miniProgram }
    } catch (error) {
      await sleep(1000)
    }
  }

  if (child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  const detail = output.join('').trim()
  if (servicePortDisabled) {
    throw new Error(
      `微信开发者工具服务端口已关闭。请在“设置 -> 安全设置”开启服务端口后重试。${detail ? ` CLI：${detail}` : ''}`,
    )
  }
  throw new Error(
    `${Math.ceil(automationTimeout / 1000)} 秒内未连接自动化端口 ${autoPort}。请在微信开发者工具“设置 -> 安全设置”开启服务端口后重试。${detail ? ` CLI：${detail}` : ''}`,
  )
}

async function run() {
  if (!fs.existsSync(devToolsCliPath)) {
    throw new Error(`未找到微信开发者工具 CLI：${devToolsCliPath}`)
  }
  fs.mkdirSync(outputRoot, { recursive: true })

  const exceptions = []
  const errorLogs = []
  let miniProgram
  let cliProcess

  try {
    const automation = await enableAutomation()
    cliProcess = automation.child
    miniProgram = automation.miniProgram
    console.log(`已连接微信开发者工具自动化端口：${autoPort}`)
    miniProgram.on('exception', (error) => exceptions.push(String(error)))
    miniProgram.on('console', (message) => {
      const type = String(message.type || '').toLowerCase()
      if (type === 'error') errorLogs.push(JSON.stringify(message))
    })

    let currentPage = await waitForCurrentPage(miniProgram)
    for (let index = 0; index < routes.length; index += 1) {
      const [name, url] = routes[index]
      console.log(`检查：${name}`)
      const expectedPath = routePath(url)
      const page = currentPage.path === expectedPath
        ? currentPage
        : await miniProgram.reLaunch(url)
      await page.waitFor(700)
      currentPage = await miniProgram.currentPage()
      const size = await currentPage.size()
      if (currentPage.path !== expectedPath) {
        throw new Error(`${name} 路由不匹配：${currentPage.path}`)
      }
      if (!size || size.width <= 0 || size.height <= 0) {
        throw new Error(`${name} 页面尺寸无效`)
      }
      const screenshotPath = path.join(
        outputRoot,
        `${String(index + 1).padStart(2, '0')}-${expectedPath.replace(/\//g, '-')}.png`,
      )
      if (captureScreenshots) {
        // 部分开发者工具版本在 Skyline 下不支持该接口，因此只在显式开启时执行。
        await miniProgram.screenshot({ path: screenshotPath })
      } else if (fs.existsSync(screenshotPath)) {
        // 删除旧窗口截图，避免把云开发控制台等错误画面当成当前页面证据。
        fs.unlinkSync(screenshotPath)
      }
      console.log(`通过：${name} ${size.width}x${size.height}`)
    }

    // 公开数据开关开启后必须确认真实来源为云端，不能把缓存或本地回退误判为通过。
    const homePage = await miniProgram.reLaunch('/pages/index/index')
    const homeData = await waitForPageData(
      homePage,
      (data) => (
        !data.loading
        && Array.isArray(data.carouselItems)
        && data.carouselItems.length > 0
      ),
    )
    if (homeData.dataSource !== 'cloud' || homeData.loadError) {
      throw new Error(`首页未使用云端公开数据：${homeData.dataSource} ${homeData.loadError || ''}`)
    }

    // 首页必须保持四个入口，且店、房、修、购分别进入独立板块。
    const quickCards = await homePage.$$('.quick-card')
    if (quickCards.length !== 4) {
      throw new Error(`首页快捷入口数量异常：${quickCards.length}`)
    }
    await homePage.callMethod('goConvenienceStoreList')
    await homePage.waitFor(700)
    const shoppingPage = await miniProgram.currentPage()
    if (shoppingPage.path !== 'pages/shopping-list/index') {
      throw new Error(`购物零售入口路由异常：${shoppingPage.path}`)
    }
    const shoppingBoard = await shoppingPage.$('merchant-board-list')
    if (!shoppingBoard) throw new Error('购物零售页面缺少共享商家板块组件')
    const shoppingData = await waitForPageData(shoppingBoard, (data) => !data.loading)
    if (shoppingData.config.board !== 'shopping') {
      throw new Error(`购物零售板块配置异常：${shoppingData.config.board}`)
    }

    const plainMerchantPage = await miniProgram.reLaunch('/pages/merchant-list/index')
    const merchantBoard = await plainMerchantPage.$('merchant-board-list')
    if (!merchantBoard) throw new Error('到店商家页面缺少共享商家板块组件')
    const plainMerchantData = await waitForPageData(merchantBoard, (data) => !data.loading)
    if (plainMerchantData.config.board !== 'store' || plainMerchantData.selectedCategory) {
      throw new Error('到店商家板块配置异常或残留购物筛选')
    }

    const servicePage = await miniProgram.reLaunch('/pages/repair-list/index')
    const serviceBoard = await servicePage.$('merchant-board-list')
    if (!serviceBoard) throw new Error('上门服务页面缺少共享商家板块组件')
    const serviceData = await waitForPageData(serviceBoard, (data) => !data.loading)
    if (serviceData.config.board !== 'service') throw new Error('上门服务板块配置异常')

    // 覆盖商家搜索和清空流程，防止标题及结果状态回归。
    const merchantPage = await miniProgram.reLaunch('/pages/merchant-list/index')
    const merchantList = await merchantPage.$('merchant-board-list')
    if (!merchantList) throw new Error('到店商家页面缺少共享商家板块组件')
    await waitForPageData(merchantList, (data) => !data.loading && data.merchants.length > 0)
    const initialMerchantData = await merchantList.data()
    const searchKeyword = initialMerchantData.merchants[0].name
    await merchantList.setData({ searchKeyword })
    await merchantList.callMethod('onSearchConfirm')
    let merchantData = await waitForPageData(
      merchantList,
      (data) => !data.loading && data.hasSearched,
    )
    if (
      merchantData.dataSource !== 'cloud'
      || merchantData.loadError
      || merchantData.merchants.length === 0
    ) {
      throw new Error('商家搜索状态或结果异常')
    }
    await merchantList.callMethod('clearSearch')
    merchantData = await waitForPageData(
      merchantList,
      (data) => !data.loading && !data.hasSearched,
    )
    if (merchantData.hasSearched || merchantData.searchKeyword) {
      throw new Error('商家搜索清空失败')
    }

    // 收藏和浏览足迹必须只写本机 storage，并能在“我的”页读取；测试结束后恢复原值。
    const favoritesKey = 'liuku_public_favorites_v1'
    const historyKey = 'liuku_public_history_v1'
    const originalFavorites = await miniProgram.callWxMethod('getStorageSync', favoritesKey)
    const originalHistory = await miniProgram.callWxMethod('getStorageSync', historyKey)
    try {
      await miniProgram.callWxMethod('removeStorageSync', favoritesKey)
      await miniProgram.callWxMethod('removeStorageSync', historyKey)
      const favoriteMerchant = merchantData.merchants[0]
      if (!favoriteMerchant || !favoriteMerchant.id) {
        throw new Error('商家列表缺少可用于收藏测试的数据')
      }
      let favoriteDetailPage = await miniProgram.reLaunch(`/pages/merchant-detail/index?id=${favoriteMerchant.id}`)
      await waitForPageData(favoriteDetailPage, (data) => !data.loading && data.merchant)
      await favoriteDetailPage.callMethod('toggleFavorite')
      await waitForPageData(favoriteDetailPage, (data) => data.isFavorite === true)

      const mineCollectionPage = await miniProgram.reLaunch('/pages/mine/index')
      const mineCollectionData = await waitForPageData(
        mineCollectionPage,
        (data) => data.favoriteCount === 1 && data.historyCount >= 1,
      )
      if (!mineCollectionData.visibleItems.some((item) => item.id === favoriteMerchant.id)) {
        throw new Error('“我的”页未展示刚刚收藏的商家')
      }

      favoriteDetailPage = await miniProgram.reLaunch(`/pages/merchant-detail/index?id=${favoriteMerchant.id}`)
      await waitForPageData(favoriteDetailPage, (data) => !data.loading && data.isFavorite === true)
      await favoriteDetailPage.callMethod('toggleFavorite')
      await waitForPageData(favoriteDetailPage, (data) => data.isFavorite === false)
    } finally {
      if (originalFavorites === '') await miniProgram.callWxMethod('removeStorageSync', favoritesKey)
      else await miniProgram.callWxMethod('setStorageSync', favoritesKey, originalFavorites)
      if (originalHistory === '') await miniProgram.callWxMethod('removeStorageSync', historyKey)
      else await miniProgram.callWxMethod('setStorageSync', historyKey, originalHistory)
    }

    // “我的”页保留头像昵称、私密反馈和规则入口，但不恢复历史投稿入口。
    const helpPage = await miniProgram.reLaunch('/pages/mine/index')
    await helpPage.waitFor(300)
    const operatorCard = await helpPage.$('.operator-card')
    if (!operatorCard) {
      throw new Error('“我的”页缺少运营者统一维护说明')
    }
    const collectionSummary = await helpPage.$('.collection-summary')
    if (!collectionSummary) {
      throw new Error('“我的”页缺少收藏与浏览足迹概览')
    }
    const helpData = await helpPage.data()
    if (!('profile' in helpData) || 'submissions' in helpData) {
      throw new Error('“我的”页头像昵称状态缺失，或误恢复了我的发布状态')
    }
    const profileCard = await helpPage.$('.profile-card')
    const profileEditor = await helpPage.$('user-profile-editor')
    if (!profileCard || !profileEditor) {
      throw new Error('“我的”页缺少头像昵称资料卡或编辑组件')
    }

    const merchantDetailPage = await miniProgram.reLaunch('/pages/merchant-detail/index?id=merchant-001')
    await waitForPageData(merchantDetailPage, (data) => !data.loading)
    const commentsCard = await merchantDetailPage.$('.comments-card')
    if (commentsCard) {
      throw new Error('商家详情仍展示公开评论区域')
    }

    if (exceptions.length > 0 || errorLogs.length > 0) {
      throw new Error(`运行期异常 ${exceptions.length} 个，错误日志 ${errorLogs.length} 条`)
    }
    const screenshotNote = captureScreenshots ? '，截图已生成' : '，截图未启用'
    console.log(`冒烟检查通过：${routes.length} 个页面，搜索、本机收藏、商家/房源投稿和招聘关闭边界正常${screenshotNote}。`)
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.disconnect()
      } catch (error) {
        console.warn('断开自动化连接失败，不覆盖页面验收结果', error)
      }
    }
    if (cliProcess && cliProcess.pid) {
      spawnSync('taskkill.exe', ['/PID', String(cliProcess.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  }
}

run().catch((error) => {
  console.error('微信开发者工具冒烟检查失败：', error)
  process.exit(1)
})
