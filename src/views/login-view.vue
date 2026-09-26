<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PhEye, PhEyeSlash } from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'

// 회원가입 화면은 없다. Supabase 대시보드에서 만든 계정 + members 등록된 계정만 로그인할 수 있다.
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const invalid = ref({ email: false, password: false }) // 어느 칸이 문제인지 (화면 읽기 프로그램에도 알려 준다)
const submitting = ref(false)

// 파비콘과 같은 모양 (public/favicon.svg)
const PIN = 'M32 55C26 47 15.5 37.5 15.5 26a16.5 16.5 0 0 1 33 0C48.5 37.5 38 47 32 55Z'
const HEART =
  'M32 34.5C25 29.6 22.6 25.8 22.6 22.9c0-2.8 2.2-5 4.9-5 2 0 3.6 1.1 4.5 2.8.9-1.7 2.5-2.8 4.5-2.8 2.7 0 4.9 2.2 4.9 5 0 2.9-2.4 6.7-9.4 11.6Z'
const ROUTE = 'M28 96C52 62 92 92 120 62C148 34 186 66 214 88'

// 다시 입력하기 시작하면 오류를 지운다
watch([email, password], () => {
  errorMessage.value = ''
  invalid.value = { email: false, password: false }
})

async function submit() {
  if (submitting.value) return
  errorMessage.value = ''
  if (!email.value || !password.value) {
    invalid.value = { email: !email.value, password: !password.value }
    errorMessage.value = '이메일과 비밀번호를 입력해 주세요.'
    return
  }

  submitting.value = true
  try {
    await auth.signIn(email.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    invalid.value = { email: true, password: true }
    errorMessage.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh flex-col bg-bg text-ink">
    <!-- 앱 화면과 같은 구성: 위는 보라 띠, 아래는 밝은 바탕. 로그인 카드가 경계에 걸친다 -->
    <section class="flex flex-col items-center bg-bar px-4 pt-[max(3rem,11dvh)] pb-28 text-center text-on-bar">
      <!-- 이 앱의 핵심 장면: 다녀온 장소(핀)들이 방문 순서대로 선으로 이어지고, 가운데가 우리 추억(하트 핀) -->
      <svg class="route mb-4 h-auto w-60" viewBox="0 0 240 104" aria-hidden="true">
        <defs>
          <mask id="route-reveal" maskUnits="userSpaceOnUse">
            <path class="route-draw" :d="ROUTE" pathLength="1" fill="none" stroke="#fff" stroke-width="8" />
          </mask>
        </defs>
        <path
          :d="ROUTE"
          fill="none"
          stroke="currentColor"
          stroke-opacity="0.7"
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray="0.5 8"
          mask="url(#route-reveal)"
        />
        <path :d="PIN" transform="translate(13.6 71.25) scale(0.45)" fill="currentColor" fill-opacity="0.55" />
        <path :d="PIN" transform="translate(199.6 63.25) scale(0.45)" fill="currentColor" fill-opacity="0.55" />
        <g transform="translate(97.5 2) scale(1.25) translate(-14 -7)">
          <path :d="PIN" fill="currentColor" />
          <path :d="HEART" fill="var(--accent)" />
        </g>
      </svg>
      <h1 class="mb-1 font-logo text-4xl">보충만의 추억</h1>
      <p class="text-sm opacity-80">우리 둘만의 지도</p>
    </section>

    <div class="-mt-20 flex justify-center px-4 pb-10">
    <form
      class="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-lift dark:bg-surface-2 dark:ring-1 dark:ring-white/10"
      novalidate
      :aria-busy="submitting"
      @submit.prevent="submit"
    >
      <label class="mb-4 block">
        <span class="mb-1.5 block text-sm font-semibold">이메일</span>
        <input
          v-model="email"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="off"
          spellcheck="false"
          required
          class="field"
          :aria-invalid="invalid.email"
          :aria-describedby="invalid.email ? 'login-error' : undefined"
        />
      </label>

      <label class="mb-4 block">
        <span class="mb-1.5 block text-sm font-semibold">비밀번호</span>
        <span class="relative block">
          <input
            v-model="password"
            name="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
            class="field pr-12"
            :aria-invalid="invalid.password"
            :aria-describedby="invalid.password ? 'login-error' : undefined"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-[10px] text-muted outline-none hover:text-ink focus-visible:text-brand focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            :aria-label="showPassword ? '비밀번호 숨기기' : '비밀번호 보기'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <component :is="showPassword ? PhEyeSlash : PhEye" :size="20" weight="bold" />
          </button>
        </span>
      </label>

      <p v-if="errorMessage" id="login-error" class="alert mb-4" role="alert">{{ errorMessage }}</p>

      <button
        type="submit"
        class="press btn-primary w-full py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        :disabled="submitting"
      >
        {{ submitting ? '로그인 중…' : '로그인' }}
      </button>
      <p class="mt-4 text-center text-xs text-muted">등록된 계정으로만 로그인할 수 있어요</p>
    </form>
    </div>
  </main>
</template>

<style scoped>
/* 경로 선이 왼쪽 장소에서 오른쪽 장소까지 한 번 그려진다. 동작 줄이기 설정이면 바로 다 그려진 상태로 보인다 */
.route-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: route-draw 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
}
@keyframes route-draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
