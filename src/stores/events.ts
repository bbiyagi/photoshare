import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchEvents } from '@/composables/useEvents'
import type { EventItem, MapMarker } from '@/types/models'

// 좌표를 소수 4자리(약 10m)로 반올림해 같은 지점으로 본다
export const markerKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`

export const useEventsStore = defineStore('events', () => {
  const events = ref<EventItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const errorMessage = ref('')

  async function load() {
    loading.value = true
    errorMessage.value = ''
    try {
      events.value = await fetchEvents()
      loaded.value = true
    } catch (e) {
      errorMessage.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  // 오래된 순. "N번째 우리들의 추억" 번호와 이전·다음 이동에 쓴다 (같은 날짜는 id 로 순서 고정)
  const chronological = computed(() =>
    [...events.value].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id)),
  )
  const numberOf = (eventId: string) => chronological.value.findIndex((e) => e.id === eventId) + 1

  // 최신순 목록은 번호 순서를 그대로 뒤집어서, 같은 날짜여도 #번호가 뒤섞이지 않게 한다
  const sortedEvents = computed(() => [...chronological.value].reverse())

  const markers = computed<MapMarker[]>(() => {
    const byKey = new Map<string, MapMarker>()
    for (const event of sortedEvents.value) {
      for (const place of event.places) {
        const key = markerKey(place.latitude, place.longitude)
        const marker = byKey.get(key) ?? {
          key,
          latitude: place.latitude,
          longitude: place.longitude,
          placeName: place.named ? place.name : '',
          events: [],
        }
        if (!marker.events.includes(event)) marker.events.push(event)
        byKey.set(key, marker)
      }
    }
    return [...byKey.values()]
  })

  return { events, sortedEvents, chronological, numberOf, markers, loading, loaded, errorMessage, load }
})
