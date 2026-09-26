<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 회원가입 화면은 없다. Supabase 대시보드에서 만든 계정 + members 등록된 계정만 로그인할 수 있다.
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const submitting = ref(false)

async function submit() {
  if (submitting.value) return
  errorMessage.value = ''
  if (!email.value || !password.value) {
    errorMessage.value = '이메일과 비밀번호를 입력해 주세요.'
    return
  }

  submitting.value = true
  try {
    await auth.signIn(email.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    errorMessage.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-brand-strong px-4 py-10 text-ink">
    <p class="mb-1 font-logo text-4xl text-white">보충만의 추억</p>
    <p class="mb-8 text-sm text-white/70">우리 둘만의 지도</p>

    <form class="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-lift" novalidate @submit.prevent="submit">
      <label class="mb-4 block">
        <span class="mb-1.5 block text-sm font-semibold">이메일</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
          :aria-invalid="!!errorMessage"
        />
      </label>

      <label class="mb-4 block">
        <span class="mb-1.5 block text-sm font-semibold">비밀번호</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
          :aria-invalid="!!errorMessage"
        />
      </label>

      <p v-if="errorMessage" class="mb-4 rounded-[10px] bg-accent/10 px-3 py-2 text-sm text-accent" role="alert">
        {{ errorMessage }}
      </p>

      <button type="submit" class="press w-full rounded-full bg-brand py-3 font-semibold text-on-brand disabled:opacity-60" :disabled="submitting">
        {{ submitting ? '로그인 중…' : '로그인' }}
      </button>
      <p class="mt-4 text-center text-xs text-muted">등록된 계정으로만 로그인할 수 있어요</p>
    </form>
  </div>
</template>
