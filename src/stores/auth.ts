import type { Session } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

// 로그인 상태. 세션 저장과 자동 갱신은 supabase-js 가 처리한다(localStorage).
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const isLoggedIn = computed(() => !!session.value)
  let ready: Promise<void> | null = null

  // 라우터 가드에서 매번 호출하지만 실제 초기화는 한 번만 한다
  function init() {
    if (ready) return ready
    const supabase = useSupabase()
    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next
    })
    ready = supabase.auth.getSession().then(({ data }) => {
      session.value = data.session
    })
    return ready
  }

  async function signIn(email: string, password: string) {
    const supabase = useSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.code === 'invalid_credentials' ? '이메일 또는 비밀번호가 맞지 않아요.' : `로그인하지 못했어요. (${error.message})`,
      )
    }

    // 계정은 있지만 members 에 등록되지 않았으면 RLS 때문에 아무것도 볼 수 없으므로 바로 막는다
    const { data: member, error: memberError } = await supabase.rpc('is_member')
    if (memberError || !member) {
      await supabase.auth.signOut()
      throw new Error('앱 사용자로 등록되지 않은 계정이에요. 관리자에게 등록을 요청하세요.')
    }
    session.value = data.session
  }

  async function signOut() {
    // 이 기기만 로그아웃 (기본값 global 은 같은 계정의 다른 기기까지 모두 로그아웃시킨다)
    await useSupabase().auth.signOut({ scope: 'local' })
    session.value = null
  }

  return { session, isLoggedIn, init, signIn, signOut }
})
