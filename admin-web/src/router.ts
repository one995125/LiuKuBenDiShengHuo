import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from './stores/session'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('./components/AppShell.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: '运营概览' } },
        { path: 'merchants', name: 'merchants', component: () => import('./views/EntriesView.vue'), props: { type: 'merchant' }, meta: { title: '商家管理' } },
        { path: 'rentals', name: 'rentals', component: () => import('./views/EntriesView.vue'), props: { type: 'rental' }, meta: { title: '房源管理' } },
        { path: 'submissions', name: 'submissions', component: () => import('./views/SubmissionsView.vue'), meta: { title: '投稿审核' } },
        { path: 'offers', name: 'offers', component: () => import('./views/EntriesView.vue'), props: { type: 'offer' }, meta: { title: '优惠活动' } },
        { path: 'feedbacks', name: 'feedbacks', component: () => import('./views/FeedbacksView.vue'), meta: { title: '纠错投诉' } },
        { path: 'imports', name: 'imports', component: () => import('./views/ImportView.vue'), meta: { title: '批量导入' } },
        { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: '客服配置' } },
        { path: 'logs', name: 'logs', component: () => import('./views/LogsView.vue'), meta: { title: '操作日志' } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const session = useSessionStore()
  if (!session.ready) await session.restore()
  if (!session.admin) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title || '运营台')} - 六库生活圈`
})
