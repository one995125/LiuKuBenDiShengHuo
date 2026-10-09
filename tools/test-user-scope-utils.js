const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { getOfficialAppId } = require('./project-config')

const officialAppId = getOfficialAppId()

const sourcePath = path.resolve(
  __dirname,
  '../miniprogram/utils/user-data-scope.ts',
)
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
  },
  fileName: sourcePath,
})

const scopeModule = { exports: {} }
const loadModule = new Function(
  'exports',
  'module',
  'require',
  '__filename',
  '__dirname',
  compiled.outputText,
)
loadModule(
  scopeModule.exports,
  scopeModule,
  require,
  sourcePath,
  path.dirname(sourcePath),
)

const {
  filterUserScopedItems,
  matchesUserDataScope,
} = scopeModule.exports

const userA = {
  openid: 'openid-user-a',
  appid: officialAppId,
}
const userB = {
  openid: 'openid-user-b',
  appid: officialAppId,
}

assert.strictEqual(matchesUserDataScope({
  ownerOpenid: userA.openid,
  appid: userA.appid,
}, userA), true)
assert.strictEqual(matchesUserDataScope({
  ownerOpenid: userA.openid,
  appid: userA.appid,
}, userB), false)
assert.strictEqual(matchesUserDataScope({
  ownerOpenid: userA.openid,
  appid: 'another-appid',
}, userA), false)
assert.strictEqual(matchesUserDataScope({}, userA), false)

const visibleForA = filterUserScopedItems([
  { id: 'a', ownerOpenid: userA.openid, appid: userA.appid },
  { id: 'b', ownerOpenid: userB.openid, appid: userB.appid },
  { id: 'legacy' },
], userA)
assert.deepStrictEqual(visibleForA.map((item) => item.id), ['a'])

console.log('用户本地数据归属测试通过：缓存、草稿、旧无归属数据均不会跨账号展示。')
