/**
 * 用户数据归属范围。
 *
 * openid 必须来自用户云函数的可信微信上下文；appid 用于共享云环境时继续隔离不同小程序。
 * 该结构只保存在当前小程序本地缓存中，不展示给用户，也不得由页面自行构造。
 */
export interface UserDataScope {
  ownerOpenid: string
  appid: string
}

export interface UserDataIdentity {
  openid: string
  appid: string
}

/**
 * 判断本地缓存或草稿是否属于当前微信用户。
 *
 * 旧版本没有归属字段的数据一律返回 false，防止切换账号后误读历史缓存。
 */
export function matchesUserDataScope(
  value: Partial<UserDataScope> | null | undefined,
  identity: UserDataIdentity,
): boolean {
  return Boolean(
    value &&
    value.ownerOpenid &&
    value.appid &&
    value.ownerOpenid === identity.openid &&
    value.appid === identity.appid,
  )
}

export function filterUserScopedItems<T extends Partial<UserDataScope>>(
  items: T[],
  identity: UserDataIdentity,
): T[] {
  return items.filter((item) => matchesUserDataScope(item, identity))
}
