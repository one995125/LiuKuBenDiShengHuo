import { defineStore } from 'pinia'
import { callAdminApi, hasSession, signIn, signOut } from '../services/cloudbase'
import type { AdminSession } from '../types/admin'

interface SessionResult {
  admin: AdminSession
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    admin: null as AdminSession | null,
    ready: false,
  }),
  actions: {
    async restore() {
      if (!(await hasSession())) {
        this.admin = null
        this.ready = true
        return false
      }
      try {
        const data = await callAdminApi<SessionResult>('adminSession')
        this.admin = data.admin
        this.ready = true
        return true
      } catch {
        await signOut()
        this.admin = null
        this.ready = true
        return false
      }
    },
    async login(username: string, password: string) {
      await signIn(username, password)
      const data = await callAdminApi<SessionResult>('adminSession')
      this.admin = data.admin
      // 登录链路已经完成会话和管理员白名单校验，避免路由守卫再次恢复会话。
      this.ready = true
    },
    async logout() {
      await signOut()
      this.admin = null
      this.ready = true
    },
  },
})
