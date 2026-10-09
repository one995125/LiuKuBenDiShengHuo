#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const {
  configPath,
  loadProjectConfig,
  projectRoot,
} = require('./project-config')

const appConfig = loadProjectConfig()
const officialAppId = appConfig.appId
const sourceAppIdEnvVar = appConfig.cloud.sourceAppIdEnvVar
const failures = []

const allowedLiteralFiles = new Set([
  rel(configPath),
  'project.config.json',
])

const ignoredPathParts = [
  '/node_modules/',
  '/miniprogram/miniprogram_npm/',
  '/admin-web/node_modules/',
  '/admin-web/dist/',
  '/.artifacts/',
  '/.codex-figma-screens/',
]

function rel(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/')
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(path.join(projectRoot, relativePath)))
}

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function shouldScan(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  if (ignoredPathParts.some((part) => normalized.includes(part))) return false
  if (/\.(png|jpg|jpeg|gif|webp|xlsx|ico|map)$/i.test(filePath)) return false
  if (/\.tsbuildinfo$/i.test(filePath)) return false
  return fs.statSync(filePath).isFile()
}

function walkFiles(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    const normalized = fullPath.replace(/\\/g, '/')
    if (ignoredPathParts.some((part) => normalized.includes(part))) continue
    if (entry.isDirectory()) {
      walkFiles(fullPath, results)
      continue
    }
    if (shouldScan(fullPath)) results.push(fullPath)
  }
  return results
}

function assertNoUnexpectedAppIdLiterals() {
  for (const filePath of walkFiles(projectRoot)) {
    const relativePath = rel(filePath)
    const content = readText(filePath)
    if (!content.includes(officialAppId)) continue
    assert(
      allowedLiteralFiles.has(relativePath),
      `${relativePath} 不得硬编码正式 AppID，请改为读取 config/liuku-app-config.json 或使用 ${sourceAppIdEnvVar}`,
    )
  }
}

function assertProjectConfigMirror() {
  const projectConfig = readJson('project.config.json')
  assert(projectConfig.appid === officialAppId, 'project.config.json 的 appid 必须与 config/liuku-app-config.json 保持一致')
}

function assertCloudFunctionGuard(functionName, options = {}) {
  const sourcePath = path.join(projectRoot, 'cloudfunctions', functionName, 'index.js')
  const source = readText(sourcePath)
  assert(source.includes('cloud.getWXContext()'), `${functionName} 必须从 cloud.getWXContext() 获取可信来源`)
  assert(source.includes(sourceAppIdEnvVar), `${functionName} 必须使用 ${sourceAppIdEnvVar} 做来源 AppID 校验`)
  assert(source.includes('process.env[APP_ID_ENV_NAME]'), `${functionName} 必须从环境变量读取来源 AppID`)
  assert(!source.includes(officialAppId), `${functionName} 不得硬编码正式 AppID`)
  assert(!/ALLOWED_APP_ID\s*=\s*['"]wx[a-z0-9]{16}['"]/.test(source), `${functionName} 不得重新引入 ALLOWED_APP_ID 硬编码`)
  if (options.admin) {
    assert(source.includes('context.allowedAppId'), `${functionName} 写入业务 appid 时必须使用通过校验的配置 AppID`)
  }
}

function assertToolingUsesConfig() {
  const stage2 = readText(path.join(projectRoot, 'tools', 'check-cloud-stage2.js'))
  const isolation = readText(path.join(projectRoot, 'tools', 'test-user-isolation.js'))
  assert(stage2.includes("require('./project-config')"), 'tools/check-cloud-stage2.js 必须读取统一配置')
  assert(isolation.includes('process.env[appConfig.cloud.sourceAppIdEnvVar]'), 'tools/test-user-isolation.js 必须为本地云函数测试注入来源 AppID 环境变量')
}

assertProjectConfigMirror()
assertCloudFunctionGuard(appConfig.cloud.functionNames.publicApi)
assertCloudFunctionGuard(appConfig.cloud.functionNames.userApi)
assertCloudFunctionGuard(appConfig.cloud.functionNames.adminApi, { admin: true })
assertToolingUsesConfig()
assertNoUnexpectedAppIdLiterals()

if (failures.length > 0) {
  console.error('AppID 与来源校验本地检查失败：')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`AppID 与来源校验检查通过：正式 AppID 仅保留在统一配置和 project.config.json，云函数使用 ${sourceAppIdEnvVar} 校验来源。`)
