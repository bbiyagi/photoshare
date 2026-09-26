import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'map', component: () => import('@/views/map-view.vue') },
    { path: '/upload', name: 'upload', component: () => import('@/views/upload-view.vue') },
    { path: '/events/:id/photos', name: 'event-photos', component: () => import('@/views/event-photos-view.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/login-view.vue'), meta: { public: true } },
  ],
})

// 로그인하지 않으면 모든 화면이 로그인 페이지로 간다. 로그인 후 원래 가려던 곳으로 돌아간다.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'map' }
  }
})
