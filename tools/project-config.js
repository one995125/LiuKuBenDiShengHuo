const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const configPath = path.join(projectRoot, 'config', 'liuku-app-config.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(`Invalid config/liuku-app-config.json: ${message}`)
  }
}

function loadProjectConfig() {
  const config = readJson(configPath)
  const cloud = config.cloud || {}
  const functionNames = cloud.functionNames || {}

  assertConfig(/^wx[a-z0-9]{16}$/.test(config.appId || ''), 'appId must be a WeChat AppID')
  assertConfig(typeof cloud.environmentId === 'string' && cloud.environmentId.length > 0, 'cloud.environmentId is required')
  assertConfig(
    /^[A-Z][A-Z0-9_]*$/.test(cloud.sourceAppIdEnvVar || ''),
    'cloud.sourceAppIdEnvVar must be an environment variable name',
  )
  for (const key of ['publicApi', 'userApi', 'adminApi', 'maintenance']) {
    assertConfig(typeof functionNames[key] === 'string' && functionNames[key].length > 0, `cloud.functionNames.${key} is required`)
  }

  return config
}

function getOfficialAppId() {
  return loadProjectConfig().appId
}

function getCloudConfig() {
  return loadProjectConfig().cloud
}

module.exports = {
  configPath,
  projectRoot,
  loadProjectConfig,
  getOfficialAppId,
  getCloudConfig,
}
