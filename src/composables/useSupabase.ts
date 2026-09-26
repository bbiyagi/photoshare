import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// .env 가 없어도 와이어프레임 화면은 뜨도록 처음 호출될 때 만든다
export function useSupabase(): SupabaseClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 가 .env 에 없습니다. .env.example 을 참고하세요.')
  }

  client = createClient(url, publishableKey)
  return client
}
