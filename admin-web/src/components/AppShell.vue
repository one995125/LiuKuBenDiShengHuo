<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppIcon,
  ShopIcon,
  CloudUploadIcon,
  HomeIcon,
  RootListIcon,
  LogoutIcon,
  NotificationIcon,
  ServiceIcon,
  SettingIcon,
} from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { cloudbaseEnvironmentId, isMockMode } from '../services/cloudbase'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const active = computed(() => String(route.name || 'dashboard'))

const menuItems = [
  { value: 'dashboard', label: '运营概览', icon: HomeIcon },
  { value: 'merchants', label: '商家管理', icon: ShopIcon },
  { value: 'rentals', label: '房源管理', icon: AppIcon },
  { value: 'submissions', label: '投稿审核', icon: NotificationIcon },
  { value: 'offers', label: '优惠活动', icon: AppIcon },
  { value: 'feedbacks', label: '纠错投诉', icon: NotificationIcon },
  { value: 'imports', label: '批量导入', icon: CloudUploadIcon },
  { value: 'settings', label: '客服配置', icon: ServiceIcon },
  { value: 'logs', label: '操作日志', icon: RootListIcon },
]

async function logout() {
  await session.logout()
  MessagePlugin.success('已退出登录')
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><ShopIcon /></div>
        <div>
          <strong>六库生活圈</strong>
          <span>运营管理后台</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="后台主导航">
        <button
          v-for="item in menuItems"
          :key="item.value"
          class="nav-item"
          :class="{ active: active === item.value }"
          type="button"
          @click="router.push({ name: item.value })"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-meta">
        <span class="env-dot"></span>
        <div>
          <small>{{ isMockMode ? '本地模拟' : '开发环境' }}</small>
          <span>{{ cloudbaseEnvironmentId }}</span>
        </div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div>
          <h1>{{ route.meta.title }}</h1>
          <span class="environment-label">{{ isMockMode ? '模拟数据' : '开发环境' }}</span>
        </div>
        <div class="admin-actions">
          <SettingIcon class="muted-icon" />
          <div class="admin-name">
            <strong>{{ session.admin?.displayName }}</strong>
            <span>超级管理员</span>
          </div>
          <t-button theme="default" variant="text" shape="square" title="退出登录" @click="logout">
            <LogoutIcon />
          </t-button>
        </div>
      </header>

      <main class="page-body">
        <router-view />
      </main>
    </div>
  </div>
</template>
