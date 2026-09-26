import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 테스트 계정으로 로그인한 Supabase 클라이언트. secret 키는 쓰지 않는다.
// 이 계정은 멤버라 RLS 상 모든 추억을 볼 수 있으므로, 쓰기·삭제는 반드시 E2E 태그가 붙은 것만 한다.
export const E2E_TAG = '[E2E]'
export const fixture = (name: string) => path.join(import.meta.dirname, '..', 'fixtures', name)

let client: SupabaseClient | null = null
let userId = ''

export async function db() {
  if (client) return { client, userId }
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await c.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  if (error) throw new Error(`테스트 계정 로그인 실패: ${error.message} (.env.test 확인)`)
  client = c
  userId = data.user.id
  return { client, userId }
}

export interface SeedPlace {
  name: string
  latitude: number
  longitude: number
  photos: number // 올릴 사진 수 (fixtures 이미지 재사용)
}

// 추억 하나를 앱과 같은 구조로 만든다: events → places → photos(+Storage 원본·썸네일)
export async function seedEvent(title: string, eventDate: string, places: SeedPlace[]) {
  if (!title.startsWith(E2E_TAG)) throw new Error('테스트 데이터 제목은 [E2E] 로 시작해야 한다')
  const { client } = await db()
  const img = readFileSync(fixture('gps-seoul.jpg'))

  const { data: event, error } = await client.from('events').insert({ title, event_date: eventDate }).select('id').single()
  if (error) throw error
  const photoIds: string[] = []
  const placeIds: string[] = []
  for (const [i, p] of places.entries()) {
    const { data: place, error: placeError } = await client
      .from('places')
      .insert({ event_id: event.id, name: p.name, latitude: p.latitude, longitude: p.longitude, visit_order: i })
      .select('id')
      .single()
    if (placeError) throw placeError
    placeIds.push(place.id)
    for (let j = 0; j < p.photos; j++) {
      const main = `${event.id}/seed-${i}-${j}.jpg`
      const thumb = `${event.id}/thumb/seed-${i}-${j}.jpg`
      for (const key of [main, thumb]) {
        const { error: upError } = await client.storage.from('photos').upload(key, img, { contentType: 'image/jpeg' })
        if (upError) throw upError
      }
      const { data: photo, error: photoError } = await client
        .from('photos')
        .insert({ place_id: place.id, storage_path: main, thumbnail_path: thumb, taken_at: `${eventDate}T0${i}:0${j}:00Z` })
        .select('id')
        .single()
      if (photoError) throw photoError
      photoIds.push(photo.id)
    }
  }
  if (photoIds[0]) await client.from('events').update({ cover_photo_id: photoIds[0] }).eq('id', event.id)
  return { eventId: event.id as string, placeIds, photoIds }
}

// 테스트 계정이 만든 [E2E] 추억만 파일까지 지운다 (실제 추억은 건드리지 않음)
export async function cleanupE2E() {
  const { client, userId } = await db()
  const { data: events, error } = await client
    .from('events')
    .select('id, places ( photos ( storage_path, thumbnail_path ) )')
    .eq('created_by', userId)
    .like('title', `${E2E_TAG}%`)
  if (error) throw error
  const paths = events.flatMap((e) =>
    (e.places as { photos: { storage_path: string; thumbnail_path: string | null }[] }[]).flatMap((p) =>
      p.photos.flatMap((ph) => [ph.storage_path, ph.thumbnail_path]).filter((x): x is string => !!x),
    ),
  )
  if (paths.length) await client.storage.from('photos').remove(paths)
  if (events.length) await client.from('events').delete().in('id', events.map((e) => e.id))
  return { events: events.length, files: paths.length }
}

export async function findE2EEvent(title: string) {
  const { client } = await db()
  const { data } = await client.from('events').select('id, title, event_date').eq('title', title).maybeSingle()
  return data
}

export async function listFiles(prefix: string) {
  const { client } = await db()
  const [main, thumb] = await Promise.all([
    client.storage.from('photos').list(prefix),
    client.storage.from('photos').list(`${prefix}/thumb`),
  ])
  return [...(main.data ?? []), ...(thumb.data ?? [])].filter((f) => f.id).map((f) => f.name)
}
