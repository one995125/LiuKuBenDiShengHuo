#!/usr/bin/env node

/**
 * 微信小程序本地质量检查脚本。
 * 作用：在没有打开微信开发者工具前，先检查常见的静态问题：
 * 1. project.config.json / app.json / 页面 JSON 是否能解析。
 * 2. app.json 中声明的页面文件是否齐全。
 * 3. 页面 WXML 绑定的事件处理函数是否能在对应 TS/JS 中找到。
 * 4. 业务代码是否误用了浏览器 DOM/BOM API。
 * 5. TDesign npm 构建产物是否存在。
 *
 * 注意：它不能替代微信开发者工具编译和真机预览，只用于提前发现低级问题。
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || process.cwd())
const typeArg = process.argv.includes('--type')
  ? process.argv[process.argv.indexOf('--type') + 1]
  : 'miniprogram'

const state = {
  errors: [],
  warnings: [],
  checked: [],
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function addError(message) {
  state.errors.push(message)
}

function addWarning(message) {
  state.warnings.push(message)
}

function addChecked(message) {
  state.checked.push(message)
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath))
  } catch (error) {
    addError(`${rel(filePath)} JSON 解析失败：${error.message}`)
    return null
  }
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function walk(dir, predicate, results = []) {
  if (!exists(dir)) {
    return results
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const normalized = fullPath.replace(/\\/g, '/')
    if (normalized.includes('/node_modules/') || normalized.includes('/miniprogram_npm/')) {
      continue
    }
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results)
      continue
    }
    if (!predicate || predicate(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

function getMiniProgramRoot(projectConfig) {
  const configured = projectConfig && (projectConfig.miniprogramRoot || projectConfig.srcMiniprogramRoot)
  return path.resolve(root, configured || 'miniprogram')
}

function checkJsonFiles(miniprogramRoot) {
  const files = [
    path.join(root, 'project.config.json'),
    ...walk(miniprogramRoot, (filePath) => filePath.endsWith('.json')),
  ]
  for (const file of files) {
    readJson(file)
  }
  addChecked(`JSON 配置检查完成：${files.length} 个文件`)
}

function checkAppPages(miniprogramRoot, appJson) {
  if (!appJson || !Array.isArray(appJson.pages)) {
    addError('miniprogram/app.json 缺少 pages 数组')
    return
  }

  for (const pagePath of appJson.pages) {
    const base = path.join(miniprogramRoot, pagePath)
    const required = [`${base}.wxml`, `${base}.json`]
    const hasScript = exists(`${base}.ts`) || exists(`${base}.js`)
    const hasStyle = exists(`${base}.less`) || exists(`${base}.wxss`)

    for (const file of required) {
      if (!exists(file)) {
        addError(`页面缺少必要文件：${rel(file)}`)
      }
    }
    if (!hasScript) {
      addError(`页面缺少脚本文件：${rel(`${base}.ts`)} 或 ${rel(`${base}.js`)}`)
    }
    if (!hasStyle) {
      addWarning(`页面缺少样式文件：${rel(`${base}.less`)} 或 ${rel(`${base}.wxss`)}`)
    }
  }

  const pages = new Set(appJson.pages)
  const tabs = (appJson.tabBar && appJson.tabBar.list) || []
  for (const tab of tabs) {
    if (!pages.has(tab.pagePath)) {
      addError(`tabBar 页面未出现在 pages 中：${tab.pagePath}`)
    }
  }

  addChecked(`页面文件检查完成：${appJson.pages.length} 个页面，${tabs.length} 个 tab`)
}

function extractEventHandlers(wxml) {
  const handlers = new Set()
  const eventPattern = /\b(?:bind|catch)(?::?[\w-]+)?="([A-Za-z_$][\w$]*)"/g
  let match = eventPattern.exec(wxml)
  while (match) {
    handlers.add(match[1])
    match = eventPattern.exec(wxml)
  }
  return [...handlers]
}

function extractPageMethods(scriptText) {
  const methods = new Set()
  const methodPattern = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm
  const propertyPattern = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:function\s*)?\(/gm

  for (let match = methodPattern.exec(scriptText); match; match = methodPattern.exec(scriptText)) {
    methods.add(match[1])
  }
  for (let match = propertyPattern.exec(scriptText); match; match = propertyPattern.exec(scriptText)) {
    methods.add(match[1])
  }
  return methods
}

function checkWxmlBindings(miniprogramRoot, appJson) {
  if (!appJson || !Array.isArray(appJson.pages)) {
    return
  }

  for (const pagePath of appJson.pages) {
    const base = path.join(miniprogramRoot, pagePath)
    const wxmlPath = `${base}.wxml`
    const scriptPath = exists(`${base}.ts`) ? `${base}.ts` : `${base}.js`
    if (!exists(wxmlPath) || !exists(scriptPath)) {
      continue
    }

    const wxml = readText(wxmlPath)
    const script = readText(scriptPath)
    const handlers = extractEventHandlers(wxml)
    const methods = extractPageMethods(script)

    for (const handler of handlers) {
      if (!methods.has(handler)) {
        addError(`${rel(wxmlPath)} 绑定了 ${handler}，但 ${rel(scriptPath)} 中未找到同名方法`)
      }
    }

    const openMustaches = (wxml.match(/{{/g) || []).length
    const closeMustaches = (wxml.match(/}}/g) || []).length
    if (openMustaches !== closeMustaches) {
      addError(`${rel(wxmlPath)} 的 {{ }} 数量不匹配`)
    }
  }

  addChecked('WXML 事件绑定检查完成')
}

function normalizeRouteUrl(url) {
  if (!url || typeof url !== 'string') {
    return ''
  }

  // 小程序路由 API 接收的是页面路径，静态检查时只取问号前的真实页面。
  const route = url.split('?')[0].replace(/^\//, '')
  if (!route || route.includes('${')) {
    return ''
  }
  return route
}

function extractRouteCalls(scriptText, apiName) {
  const calls = []
  const callPattern = new RegExp(`wx\\.${apiName}\\s*\\(\\s*\\{[\\s\\S]*?url\\s*:\\s*([\\\`'"])([\\s\\S]*?)\\1`, 'g')
  let match = callPattern.exec(scriptText)
  while (match) {
    const route = normalizeRouteUrl(match[2])
    if (route) {
      calls.push(route)
    }
    match = callPattern.exec(scriptText)
  }
  return calls
}

function checkRouteApis(miniprogramRoot, appJson) {
  if (!appJson || !Array.isArray(appJson.pages)) {
    return
  }

  const pages = new Set(appJson.pages)
  const tabs = new Set(((appJson.tabBar && appJson.tabBar.list) || []).map((item) => item.pagePath))
  const scriptFiles = walk(miniprogramRoot, (filePath) => /\.(ts|js)$/.test(filePath))

  for (const file of scriptFiles) {
    const script = readText(file)

    for (const route of extractRouteCalls(script, 'navigateTo')) {
      if (!pages.has(route)) {
        addError(`${rel(file)} wx.navigateTo 指向未在 app.json.pages 声明的页面：${route}`)
        continue
      }
      if (tabs.has(route)) {
        addError(`${rel(file)} wx.navigateTo 指向 tabBar 页面：${route}，请改用 wx.switchTab`)
      }
    }

    for (const route of extractRouteCalls(script, 'switchTab')) {
      if (!pages.has(route)) {
        addError(`${rel(file)} wx.switchTab 指向未在 app.json.pages 声明的页面：${route}`)
        continue
      }
      if (!tabs.has(route)) {
        addError(`${rel(file)} wx.switchTab 指向非 tabBar 页面：${route}，请改用 wx.navigateTo 或 wx.redirectTo`)
      }
    }
  }

  addChecked(`路由 API 检查完成：${scriptFiles.length} 个业务脚本`)
}

function checkForbiddenApis(miniprogramRoot) {
  const forbidden = [
    /\bdocument\b/,
    /\bwindow\b/,
    /\blocalStorage\b/,
    /getElementById/,
  ]
  const files = walk(miniprogramRoot, (filePath) => /\.(ts|js)$/.test(filePath))
  for (const file of files) {
    const content = readText(file)
    for (const pattern of forbidden) {
      if (pattern.test(content)) {
        addError(`${rel(file)} 命中小程序禁用/不推荐浏览器 API：${pattern}`)
      }
    }
  }
  addChecked(`禁用浏览器 API 检查完成：${files.length} 个业务脚本`)
}

function checkUsingComponents(miniprogramRoot) {
  const jsonFiles = walk(miniprogramRoot, (filePath) => filePath.endsWith('.json'))
  for (const file of jsonFiles) {
    const json = readJson(file)
    if (!json || !json.usingComponents) {
      continue
    }
    for (const [name, componentPath] of Object.entries(json.usingComponents)) {
      if (!componentPath || componentPath.startsWith('tdesign-miniprogram/')) {
        continue
      }
      const resolved = componentPath.startsWith('/')
        ? path.join(miniprogramRoot, componentPath)
        : path.resolve(path.dirname(file), componentPath)
      const hasComponent = exists(`${resolved}.json`) || exists(path.join(resolved, 'index.json'))
      if (!hasComponent) {
        addError(`${rel(file)} 的 usingComponents.${name} 指向不存在：${componentPath}`)
      }
    }
  }
  addChecked('usingComponents 路径检查完成')
}

function checkTDesign(projectConfig, miniprogramRoot) {
  const packageJsonPath = path.join(root, 'package.json')
  const packageJson = exists(packageJsonPath) ? readJson(packageJsonPath) : null
  const hasTDesign = Boolean(packageJson && packageJson.dependencies && packageJson.dependencies['tdesign-miniprogram'])
  if (!hasTDesign) {
    return
  }

  const builtPath = path.join(miniprogramRoot, 'miniprogram_npm', 'tdesign-miniprogram')
  if (!exists(builtPath)) {
    addWarning('检测到 tdesign-miniprogram 依赖，但 miniprogram/miniprogram_npm/tdesign-miniprogram 不存在；请在微信开发者工具中执行“工具 -> 构建 npm”。')
  }

  const packList = projectConfig && projectConfig.setting && projectConfig.setting.packNpmRelationList
  if (!Array.isArray(packList) || packList.length === 0) {
    addWarning('project.config.json 未配置 packNpmRelationList；TDesign 构建 npm 可能不可用。')
  }

  addChecked('TDesign npm 检查完成')
}

function main() {
  if (typeArg !== 'miniprogram') {
    addWarning(`当前脚本主要面向 miniprogram，收到 --type ${typeArg}`)
  }

  const projectConfigPath = path.join(root, 'project.config.json')
  const projectConfig = readJson(projectConfigPath)
  const miniprogramRoot = getMiniProgramRoot(projectConfig)
  const appJsonPath = path.join(miniprogramRoot, 'app.json')
  const appJson = readJson(appJsonPath)

  if (!exists(miniprogramRoot)) {
    addError(`小程序根目录不存在：${rel(miniprogramRoot)}`)
  }
  if (!exists(appJsonPath)) {
    addError(`app.json 不存在：${rel(appJsonPath)}`)
  }

  checkJsonFiles(miniprogramRoot)
  checkAppPages(miniprogramRoot, appJson)
  checkWxmlBindings(miniprogramRoot, appJson)
  checkRouteApis(miniprogramRoot, appJson)
  checkForbiddenApis(miniprogramRoot)
  checkUsingComponents(miniprogramRoot)
  checkTDesign(projectConfig, miniprogramRoot)

  console.log('微信小程序质量检查')
  console.log(`项目目录：${root}`)
  console.log('')
  for (const item of state.checked) {
    console.log(`✓ ${item}`)
  }
  for (const warning of state.warnings) {
    console.log(`! ${warning}`)
  }
  for (const error of state.errors) {
    console.log(`✗ ${error}`)
  }
  console.log('')
  console.log(`结果：${state.errors.length} 个错误，${state.warnings.length} 个提醒`)

  if (state.errors.length > 0) {
    process.exit(1)
  }
}

main()
