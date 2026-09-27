import { useSupabase } from '@/composables/useSupabase'
import type { EventItem } from '@/types/models'
import { AUTO_PLACE_NAME, isAutoPlaceName, placeLabel } from '@/utils/place-name'

export const PHOTO_BUCKET = 'photos'
const SIGNED_URL_SECONDS = 60 * 60

interface EventRow {
  id: string
  title: string
  description: string | null
  event_date: string
  cover_photo_id: string | null
  cover: { storage_path: string; thumbnail_path: string | null } | null
  places: {
    id: string
    name: string
    latitude: number
    longitude: number
    visit_order: number
    photos: { id: string; storage_path: string; thumbnail_path: string | null; taken_at: string | null }[]
  }[]
}

// 모든 이벤트 + 장소 + 장소별 사진(수, 첫 사진) + 대표사진 경로를 한 번에 가져온다.
// 두 사람이 쓰는 규모라 전체 조회로 충분하다. 많아지면 places_in_bounds RPC 로 바꾼다.
export async function fetchEvents(): Promise<EventItem[]> {
  const supabase = useSupabase()
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, title, description, event_date, cover_photo_id,
       cover:photos!events_cover_photo_id_fkey ( storage_path, thumbnail_path ),
       places ( id, name, latitude, longitude, visit_order, photos ( id, storage_path, thumbnail_path, taken_at ) )`,
    )
    .order('event_date', { ascending: false })
    .returns<EventRow[]>()
  if (error) throw new Error(`이벤트를 불러오지 못했어요. (${error.message})`)

  // 장소 카드에 보여 줄 사진: 대표사진이 그 장소에 있으면 그것, 아니면 가장 먼저 찍은 사진
  const byTakenAt = (a: { taken_at: string | null }, b: { taken_at: string | null }) =>
    (a.taken_at ?? '9999').localeCompare(b.taken_at ?? '9999')
  const placeCover = (e: EventRow, p: EventRow['places'][number]) => {
    const photo = p.photos.find((ph) => ph.id === e.cover_photo_id) ?? [...p.photos].sort(byTakenAt)[0]
    return photo ? (photo.thumbnail_path ?? photo.storage_path) : null
  }

  const paths = new Set<string>()
  for (const e of data) {
    const cover = e.cover?.thumbnail_path ?? e.cover?.storage_path
    if (cover) paths.add(cover)
    for (const p of e.places) {
      const path = placeCover(e, p)
      if (path) paths.add(path)
    }
  }
  const urlByPath = new Map<string, string>()
  if (paths.size) {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS)
    signed?.forEach((s) => s.path && s.signedUrl && urlByPath.set(s.path, s.signedUrl))
  }
  const urlOf = (path: string | null | undefined) => (path ? (urlByPath.get(path) ?? null) : null)

  return data.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    eventDate: e.event_date,
    coverPhotoId: e.cover_photo_id,
    coverUrl: urlOf(e.cover?.thumbnail_path ?? e.cover?.storage_path),
    photoCount: e.places.reduce((sum, p) => sum + p.photos.length, 0),
    places: [...e.places]
      .sort((a, b) => a.visit_order - b.visit_order)
      .map((p, i) => ({
        id: p.id,
        eventId: e.id,
        name: placeLabel(p.name, i),
        named: !isAutoPlaceName(p.name),
        // numeric 컬럼은 문자열로 올 수 있어 숫자로 바꾼다
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        visitOrder: p.visit_order,
        photoCount: p.photos.length,
        coverUrl: urlOf(placeCover(e, p)),
      })),
  }))
}

// ---------------------------------------------------------------------------
// 쓰기 (업로드 화면에서 사용)
// ---------------------------------------------------------------------------

export async function createEvent(input: { title: string; eventDate: string; description: string | null }) {
  const { data, error } = await useSupabase()
    .from('events')
    .insert({ title: input.title, event_date: input.eventDate, description: input.description })
    .select('id')
    .single()
  if (error) throw new Error(`이벤트를 만들지 못했어요. (${error.message})`)
  return data.id as string
}

export async function fetchPlacesOfEvent(eventId: string) {
  const { data, error } = await useSupabase()
    .from('places')
    .select('id, name, latitude, longitude, visit_order')
    .eq('event_id', eventId)
  if (error) throw new Error(`장소를 불러오지 못했어요. (${error.message})`)
  return data.map((p) => ({ ...p, latitude: Number(p.latitude), longitude: Number(p.longitude) }))
}

// 추억 안의 장소 순서를 촬영 시각 순서로 다시 매긴다 (시간 정보가 없는 장소는 올린 순서대로 뒤에). 004_reorder_places.sql
export async function reorderPlaces(eventId: string) {
  const { error } = await useSupabase().rpc('reorder_places', { p_event_id: eventId })
  if (error) throw new Error(`장소 순서를 정리하지 못했어요. (${error.message})`)
}

export async function createPlace(input: { eventId: string; latitude: number; longitude: number; visitOrder: number }) {
  const { data, error } = await useSupabase()
    .from('places')
    .insert({
      event_id: input.eventId,
      name: AUTO_PLACE_NAME, // 이름은 나중에 사진 모아 보기에서 붙일 수 있다
      latitude: Number(input.latitude.toFixed(6)),
      longitude: Number(input.longitude.toFixed(6)),
      visit_order: input.visitOrder,
    })
    .select('id')
    .single()
  if (error) throw new Error(`장소를 저장하지 못했어요. (${error.message})`)
  return data.id as string
}

export async function insertPhoto(input: {
  placeId: string
  storagePath: string
  thumbnailPath: string | null
  takenAt: string | null
  latitude: number | null
  longitude: number | null
  width: number | null
  height: number | null
}) {
  const { data, error } = await useSupabase()
    .from('photos')
    .insert({
      place_id: input.placeId,
      storage_path: input.storagePath,
      thumbnail_path: input.thumbnailPath,
      taken_at: input.takenAt,
      latitude: input.latitude === null ? null : Number(input.latitude.toFixed(6)),
      longitude: input.longitude === null ? null : Number(input.longitude.toFixed(6)),
      width: input.width,
      height: input.height,
    })
    .select('id')
    .single()
  if (error) throw new Error(`사진 정보를 저장하지 못했어요. (${error.message})`)
  return data.id as string
}

// 대표사진이 비어 있을 때만 채운다
export async function setCoverIfEmpty(eventId: string, photoId: string) {
  const { error } = await useSupabase().from('events').update({ cover_photo_id: photoId }).eq('id', eventId).is('cover_photo_id', null)
  if (error) throw new Error(`대표사진을 지정하지 못했어요. (${error.message})`)
}

// ---------------------------------------------------------------------------
// 이벤트 사진 모아 보기
// ---------------------------------------------------------------------------

export interface GalleryPhoto {
  id: string
  storagePath: string
  thumbnailPath: string | null
  thumbUrl: string | null
  takenAt: string | null
  width: number | null
  height: number | null
}

export interface GalleryPlace {
  id: string
  name: string // 화면용 (이름이 없으면 "N번째 장소")
  named: boolean // 직접 붙인 이름인지
  visitOrder: number
  photos: GalleryPhoto[]
}

export interface EventGallery {
  id: string
  title: string
  eventDate: string
  description: string | null
  coverPhotoId: string | null
  places: GalleryPlace[]
}

interface GalleryRow {
  id: string
  title: string
  event_date: string
  description: string | null
  cover_photo_id: string | null
  places: {
    id: string
    name: string
    visit_order: number
    photos: {
      id: string
      storage_path: string
      thumbnail_path: string | null
      taken_at: string | null
      width: number | null
      height: number | null
    }[]
  }[]
}

// 장소는 방문 순서, 사진은 촬영 시각 순(시각이 없으면 뒤로)
export async function fetchEventGallery(eventId: string): Promise<EventGallery | null> {
  const supabase = useSupabase()
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, title, event_date, description, cover_photo_id,
       places ( id, name, visit_order, photos ( id, storage_path, thumbnail_path, taken_at, width, height ) )`,
    )
    .eq('id', eventId)
    .maybeSingle<GalleryRow>()
  if (error) throw new Error(`사진을 불러오지 못했어요. (${error.message})`)
  if (!data) return null

  const thumbPaths = data.places.flatMap((p) => p.photos.map((ph) => ph.thumbnail_path ?? ph.storage_path))
  const urlByPath = new Map<string, string>()
  if (thumbPaths.length) {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(thumbPaths, SIGNED_URL_SECONDS)
    signed?.forEach((s) => s.path && s.signedUrl && urlByPath.set(s.path, s.signedUrl))
  }

  const byTakenAt = (a: { taken_at: string | null }, b: { taken_at: string | null }) =>
    (a.taken_at ?? '9999').localeCompare(b.taken_at ?? '9999')

  return {
    id: data.id,
    title: data.title,
    eventDate: data.event_date,
    description: data.description,
    coverPhotoId: data.cover_photo_id,
    places: [...data.places]
      .sort((a, b) => a.visit_order - b.visit_order)
      .map((p, i) => ({
        id: p.id,
        name: placeLabel(p.name, i),
        named: !isAutoPlaceName(p.name),
        visitOrder: p.visit_order,
        photos: [...p.photos].sort(byTakenAt).map((ph) => ({
          id: ph.id,
          storagePath: ph.storage_path,
          thumbnailPath: ph.thumbnail_path,
          thumbUrl: urlByPath.get(ph.thumbnail_path ?? ph.storage_path) ?? null,
          takenAt: ph.taken_at,
          width: ph.width,
          height: ph.height,
        })),
      })),
  }
}

// 원본(압축본)은 크게 볼 때만 서명 URL 을 만든다
export async function getPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await useSupabase().storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS)
  if (error || !data) throw new Error('사진을 열지 못했어요.')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// 수정 · 삭제
// DB 행을 먼저 지우고 파일을 나중에 지운다. 파일 삭제가 실패해도 화면에는 영향이 없고
// (고아 파일만 남음), 반대 순서면 파일 없는 행이 남아 깨진 이미지가 보이기 때문.
// ---------------------------------------------------------------------------

export async function updateEvent(eventId: string, input: { title: string; eventDate: string; description: string | null }) {
  const { error } = await useSupabase()
    .from('events')
    .update({ title: input.title, event_date: input.eventDate, description: input.description })
    .eq('id', eventId)
  if (error) throw new Error(`이벤트를 수정하지 못했어요. (${error.message})`)
}

export async function updatePlaceName(placeId: string, name: string) {
  const { error } = await useSupabase().from('places').update({ name: name.trim() || AUTO_PLACE_NAME }).eq('id', placeId)
  if (error) throw new Error(`장소 이름을 바꾸지 못했어요. (${error.message})`)
}

export async function setCover(eventId: string, photoId: string) {
  const { error } = await useSupabase().from('events').update({ cover_photo_id: photoId }).eq('id', eventId)
  if (error) throw new Error(`대표사진을 바꾸지 못했어요. (${error.message})`)
}

// 이벤트 삭제: places/photos 행은 FK cascade 로 함께 지워지고, Storage 파일은 직접 지운다
export async function deleteEvent(eventId: string) {
  const supabase = useSupabase()
  const { data: photos, error: listError } = await supabase
    .from('photos')
    .select('storage_path, thumbnail_path, places!inner ( event_id )')
    .eq('places.event_id', eventId)
  if (listError) throw new Error(`삭제할 사진을 확인하지 못했어요. (${listError.message})`)

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw new Error(`이벤트를 삭제하지 못했어요. (${error.message})`)

  const paths = photos.flatMap((p) => [p.storage_path, p.thumbnail_path]).filter((p): p is string => !!p)
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths)
}

// 사진 삭제: 장소에 사진이 더 없으면 장소도 지우고, 대표사진이 비면 남은 사진 중 첫 장으로 채운다
export async function deletePhoto(eventId: string, photo: { id: string; placeId: string; storagePath: string; thumbnailPath: string | null }) {
  const supabase = useSupabase()
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) throw new Error(`사진을 삭제하지 못했어요. (${error.message})`)

  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storagePath, ...(photo.thumbnailPath ? [photo.thumbnailPath] : [])])

  const { count } = await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('place_id', photo.placeId)
  if (count === 0) await supabase.from('places').delete().eq('id', photo.placeId)

  // cover_photo_id 는 FK(on delete set null)로 이미 비워졌을 수 있다
  const { data: event } = await supabase.from('events').select('cover_photo_id').eq('id', eventId).maybeSingle()
  if (event && !event.cover_photo_id) {
    const { data: next } = await supabase
      .from('photos')
      .select('id, taken_at, places!inner ( event_id )')
      .eq('places.event_id', eventId)
      .order('taken_at', { ascending: true, nullsFirst: false })
      .limit(1)
    if (next?.[0]) await setCover(eventId, next[0].id)
  }
}
