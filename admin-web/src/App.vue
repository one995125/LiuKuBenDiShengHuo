<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from './stores/session'

const router = useRouter()
const session = useSessionStore()

function handleInvalidSession() {
  session.admin = null
  router.replace({ name: 'login' })
}

onMounted(() => window.addEventListener('liuku-auth-invalid', handleInvalidSession))
onBeforeUnmount(() => window.removeEventListener('liuku-auth-invalid', handleInvalidSession))
</script>

<template>
  <router-view />
</template>
