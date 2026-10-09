const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const miniprogramRoot = path.join(projectRoot, 'miniprogram')
const failures = []

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'miniprogram_npm') return []
      return walkFiles(fullPath)
    }
    return [fullPath]
  })
}

function assert(condition, message) {
  if (!condition) failures.push(message)
}

const projectConfig = readJson(path.join(projectRoot, 'project.config.json'))
const appConfig = readJson(path.join(miniprogramRoot, 'app.json'))
const sourceFiles = walkFiles(miniprogramRoot)
  .filter((filePath) => /\.(ts|js|wxml|json|less|wxss)$/.test(filePath))
const sourceText = sourceFiles
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n')

// 阶段 2 允许云基础设施，但业务页面仍不得直接访问数据库或云函数。
const pageScriptFiles = sourceFiles.filter((filePath) => (
  filePath.includes(`${path.sep}pages${path.sep}`) && /\.(ts|js)$/.test(filePath)
))
const pageScriptText = pageScriptFiles
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n')
assert(!/\bwx\.cloud\b/.test(pageScriptText), '阶段 2 业务页面不得直接调用 wx.cloud')
assert(!/\bwx\.cloud\.database\b/.test(sourceText), '小程序客户端不得直接访问云数据库')

// 所有 app.json 注册页面都必须具备完整的四件套，避免开发者工具出现缺页。
for (const pageRoute of appConfig.pages || []) {
  const pageBase = path.join(miniprogramRoot, pageRoute)
  for (const extension of ['.ts', '.json', '.wxml', '.less']) {
    assert(fs.existsSync(`${pageBase}${extension}`), `${pageRoute}${extension} 缺失`)
  }
}

// 小程序运行时禁止浏览器 DOM/BOM API，并确保旧远程字体地址未回流。
assert(!/\b(document|localStorage|sessionStorage)\b/.test(sourceText), '检测到浏览器专属 API')
assert(!/\bwindow\.(?!__)/.test(sourceText), '检测到 window 浏览器 API')
assert(!/tdesign\.gtimg\.com\/icon/.test(sourceText), '检测到 TDesign 远程字体引用')

if (failures.length > 0) {
  console.error('云迁移前基线检查失败：')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`阶段 2 基线检查通过：${appConfig.pages.length} 个页面未直接访问云端，未发现浏览器 API。`)
