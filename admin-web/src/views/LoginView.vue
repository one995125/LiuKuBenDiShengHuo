<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LockOnIcon, ShopIcon, UserIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSessionStore } from '../stores/session'

const username = ref('')
const password = ref('')
const loading = ref(false)
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

async function submit() {
  if (!username.value.trim() || !password.value) {
    MessagePlugin.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await session.login(username.value.trim(), password.value)
    await router.replace(String(route.query.redirect || '/'))
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="login-brand">
        <ShopIcon size="46" />
        <h1>六库生活圈</h1>
        <p>审核本地信息，维护真实、清晰、及时的便民内容。</p>
      </div>
      <div class="login-form">
        <h2>运营后台登录</h2>
        <p>仅限已加入管理员白名单的账号</p>
        <t-form layout="vertical">
          <t-form-item label="用户名">
            <t-input v-model="username" size="large" placeholder="CloudBase Auth 用户名">
              <template #prefix-icon><UserIcon /></template>
            </t-input>
          </t-form-item>
          <t-form-item label="密码">
            <t-input v-model="password" type="password" size="large" placeholder="请输入密码" @enter="submit">
              <template #prefix-icon><LockOnIcon /></template>
            </t-input>
          </t-form-item>
          <t-button type="button" theme="primary" size="large" block :loading="loading" @click="submit">
            登录运营台
          </t-button>
        </t-form>
        <div class="helper-text">
          账号由 CloudBase 控制台创建，不开放注册。首次使用需将账号 UID 写入
          <code>liuku_admins</code> 且设置 <code>enabled=true</code>。
        </div>
      </div>
    </section>
  </main>
</template>
