const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadProjectConfig } = require('./project-config')

const projectRoot = path.resolve(__dirname, '..')
const appConfig = loadProjectConfig()
const expectedEnvironmentId = appConfig.cloud.environmentId
const expectedAppId = appConfig.appId
const sourceAppIdEnvVar = appConfig.cloud.sourceAppIdEnvVar
const expectedFunctions = [
  appConfig.cloud.functionNames.publicApi,
  appConfig.cloud.functionNames.userApi,
  appConfig.cloud.functionNames.adminApi,
  appConfig.cloud.functionNames.maintenance,
]
const wxContextFunctions = new Set([
  appConfig.cloud.functionNames.publicApi,
  appConfig.cloud.functionNames.userApi,
  appConfig.cloud.functionNames.adminApi,
])
const expectedCollections = [
  'liuku_merchants',
  'liuku_jobs',
  'liuku_rentals',
  'liuku_offers',
  'liuku_submissions',
  'liuku_feedbacks',
  'liuku_users',
  'liuku_admins',
  'liuku_admin_logs',
  'liuku_configs',
]
const failures = []

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function assert(condition, message) {
  if (!condition) failures.push(message)
}

const projectConfig = readJson(path.join(projectRoot, 'project.config.json'))
const cloudConfigText = readText(path.join(
  projectRoot,
  'miniprogram',
  'constants',
  'cloud-base.ts',
))
const appText = readText(path.join(projectRoot, 'miniprogram', 'app.ts'))
const collectionsManifest = readJson(path.join(
  projectRoot,
  'cloudfunctions',
  'database-collections.json',
))
const functionManifest = readJson(path.join(
  projectRoot,
  'cloudfunctions',
  'functions-manifest.json',
))
const cloudbaseConfig = readJson(path.join(projectRoot, 'cloudbaserc.json'))
const indexManifest = readJson(path.join(
  projectRoot,
  'cloudfunctions',
  'database-indexes.json',
))

assert(projectConfig.appid === expectedAppId, `AppID 应为 ${expectedAppId}`)
assert(projectConfig.cloudfunctionRoot === 'cloudfunctions/', 'project.config.json 缺少 cloudfunctionRoot')
assert(cloudConfigText.includes(expectedEnvironmentId), '小程序云配置缺少正确环境 ID')
assert(appText.includes('initCloudBase()'), 'App.onLaunch 未初始化 CloudBase')
assert(functionManifest.environmentId === expectedEnvironmentId, '云函数清单环境 ID 不正确')
assert(functionManifest.runtime === 'Nodejs18.15', '云函数运行时应为 Nodejs18.15')
assert(cloudbaseConfig.envId === expectedEnvironmentId, 'cloudbaserc.json 环境 ID 不正确')
assert(cloudbaseConfig.functionRoot === './cloudfunctions', 'cloudbaserc.json 云函数根目录不正确')

const manifestFunctionNames = new Set(
  Array.isArray(functionManifest.functions)
    ? functionManifest.functions.map((item) => item.name)
    : [],
)
const deployFunctionNames = new Set(
  Array.isArray(cloudbaseConfig.functions)
    ? cloudbaseConfig.functions.map((item) => item.name)
    : [],
)

for (const functionName of expectedFunctions) {
  const functionRoot = path.join(projectRoot, 'cloudfunctions', functionName)
  const indexPath = path.join(functionRoot, 'index.js')
  const packagePath = path.join(functionRoot, 'package.json')
  const configPath = path.join(functionRoot, 'config.json')

  assert(manifestFunctionNames.has(functionName), `云函数清单缺少 ${functionName}`)
  assert(deployFunctionNames.has(functionName), `cloudbaserc.json 缺少 ${functionName}`)
  assert(fs.existsSync(indexPath), `${functionName}/index.js 缺失`)
  assert(fs.existsSync(packagePath), `${functionName}/package.json 缺失`)
  assert(fs.existsSync(configPath), `${functionName}/config.json 缺失`)

  if (fs.existsSync(indexPath)) {
    const source = readText(indexPath)
    if (wxContextFunctions.has(functionName)) {
      assert(source.includes('cloud.getWXContext()'), `${functionName} 未使用可信微信调用上下文`)
      assert(source.includes(sourceAppIdEnvVar), `${functionName} 未使用统一来源 AppID 环境变量`)
      assert(!source.includes(expectedAppId), `${functionName} 不得硬编码正式 AppID`)
    }
    const check = spawnSync(process.execPath, ['--check', indexPath], { encoding: 'utf8' })
    assert(check.status === 0, `${functionName}/index.js 语法检查失败：${check.stderr}`)
  }

  if (fs.existsSync(packagePath)) {
    const packageJson = readJson(packagePath)
    assert(
      Boolean(packageJson.dependencies && packageJson.dependencies['wx-server-sdk']),
      `${functionName} 缺少 wx-server-sdk 依赖`,
    )
    assert(
      String(packageJson.engines?.node || '').includes('18'),
      `${functionName} package.json 未声明 Node.js 18`,
    )
  }
}

const adminSource = readText(path.join(
  projectRoot,
  'cloudfunctions',
  'liuku-admin-api',
  'index.js',
))
assert(adminSource.includes('getEndUserInfo'), '管理员 API 未读取 CloudBase Auth v2 用户身份')
assert(adminSource.includes('reviewSubmission'), '管理员 API 缺少审核动作')
assert(adminSource.includes('importEntries'), '管理员 API 缺少批量导入动作')
assert(adminSource.includes('listAdminLogs'), '管理员 API 缺少操作日志动作')

const maintenanceConfig = readJson(path.join(
  projectRoot,
  'cloudfunctions',
  'liuku-maintenance',
  'config.json',
))
assert(
  Array.isArray(maintenanceConfig.triggers) && maintenanceConfig.triggers.length === 1,
  '维护云函数缺少定时触发器',
)

const manifestNames = new Set(
  Array.isArray(collectionsManifest.collections)
    ? collectionsManifest.collections.map((item) => item.name)
    : [],
)
const indexedCollections = new Set(
  Array.isArray(indexManifest.indexes)
    ? indexManifest.indexes.map((item) => item.collection)
    : [],
)

for (const collectionName of expectedCollections) {
  assert(manifestNames.has(collectionName), `集合清单缺少 ${collectionName}`)
  const rulePath = path.join(
    projectRoot,
    'cloudfunctions',
    'database-rules',
    `${collectionName}.json`,
  )
  assert(fs.existsSync(rulePath), `${collectionName} 权限规则缺失`)
  if (fs.existsSync(rulePath)) {
    const rule = readJson(rulePath)
    assert(
      rule.read === false && rule.write === false,
      `${collectionName} 必须默认拒绝客户端直接读写`,
    )
  }
}

for (const collectionName of [
  'liuku_merchants',
  'liuku_jobs',
  'liuku_rentals',
  'liuku_offers',
  'liuku_submissions',
  'liuku_feedbacks',
  'liuku_users',
  'liuku_admin_logs',
]) {
  assert(indexedCollections.has(collectionName), `索引清单缺少 ${collectionName}`)
}

if (failures.length > 0) {
  console.error('CloudBase 本地基础设施检查失败：')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(
  `CloudBase 本地基础设施检查通过：${expectedFunctions.length} 个云函数，`
  + `${expectedCollections.length} 个集合规则，环境 ${expectedEnvironmentId}。`,
)
