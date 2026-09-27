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

  // 10분 안에 5번 틀리면 그 이메일은 10분 동안 막힌다 (횟수·잠금은 DB 함수가 관리: 003_login_lockout.sql)
  const lockedMessage = (until: string) =>
    `비밀번호를 5번 틀려서 잠시 막혔어요. ${Math.max(1, Math.round((new Date(until).getTime() - Date.now()) / 60000))}분 뒤에 다시 시도해 주세요.`

  async function signIn(email: string, password: string) {
    const supabase = useSupabase()
    const { data: lockedUntil } = await supabase.rpc('login_locked_until', { p_email: email })
    if (lockedUntil) throw new Error(lockedMessage(lockedUntil))

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.code === 'invalid_credentials') {
        const { data: fail } = await supabase.rpc('login_failed', { p_email: email }).single<{ lock_until: string | null; attempts_left: number }>()
        if (fail?.lock_until) throw new Error(lockedMessage(fail.lock_until))
        const left = fail ? ` (남은 기회 ${fail.attempts_left}번)` : ''
        throw new Error(`이메일 또는 비밀번호가 맞지 않아요.${left} 기억나지 않으면 상대에게 비밀번호 재설정을 부탁해 주세요.`)
      }
      console.error('signIn failed', error) // 원인은 콘솔에만 남기고, 화면에는 사람이 읽을 수 있는 문장만 보여 준다
      throw new Error('연결이 불안정해요. 잠시 후 다시 시도해 주세요.')
    }

    // 계정은 있지만 members 에 등록되지 않았으면 RLS 때문에 아무것도 볼 수 없으므로 바로 막는다
    const { data: member, error: memberError } = await supabase.rpc('is_member')
    if (memberError || !member) {
      await supabase.auth.signOut()
      throw new Error('아직 등록되지 않은 계정이에요. 상대에게 등록을 부탁해 주세요.')
    }
    await supabase.rpc('login_succeeded') // 실패 횟수 초기화
    session.value = data.session
  }

  async function signOut() {
    // 이 기기만 로그아웃 (기본값 global 은 같은 계정의 다른 기기까지 모두 로그아웃시킨다)
    await useSupabase().auth.signOut({ scope: 'local' })
    session.value = null
  }

  return { session, isLoggedIn, init, signIn, signOut }
})
