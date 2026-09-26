<script setup lang="ts">
import { PhArrowLeft, PhArrowRight, PhList, PhPlus } from '@phosphor-icons/vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EventListDrawer from '@/components/event-list-drawer.vue'
import MemoryCard from '@/components/memory-card.vue'
import MemoryDetail from '@/components/memory-detail.vue'
import MemoryList from '@/components/memory-list.vue'
import NaverMap from '@/components/naver-map.vue'
import { useAuthStore } from '@/stores/auth'
import { markerKey, useEventsStore } from '@/stores/events'
import type { EventItem, MapMarker } from '@/types/models'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const store = useEventsStore()
const { sortedEvents, chronological, markers, loading, loaded, errorMessage } = storeToRefs(store)

async function logout() {
  await auth.signOut()
  await router.replace({ name: 'login' })
}

const drawerOpen = ref(false)
const detailOpen = ref(false)
const selectedEvent = ref<EventItem | null>(null) // 카드에 보이는 추억
const placeIndex = ref(0) // 그 추억 안에서 보고 있는 장소
const listMarker = ref<MapMarker | null>(null) // 추억이 여러 개인 마커를 눌렀을 때의 목록

const selectedPlace = computed(() => selectedEvent.value?.places[placeIndex.value] ?? null)

// 시간순 이전·다음 추억
const selectedIndex = computed(() => (selectedEvent.value ? chronological.value.findIndex((e) => e.id === selectedEvent.value!.id) : -1))
const hasPrev = computed(() => selectedIndex.value > 0)
const hasNext = computed(() => selectedIndex.value >= 0 && selectedIndex.value < chronological.value.length - 1)

function showEvent(event: EventItem, atPlace = 0) {
  selectedEvent.value = event
  placeIndex.value = Math.min(Math.max(atPlace, 0), Math.max(event.places.length - 1, 0))
  listMarker.value = null
}

// 마커를 눌렀으면 그 추억 안에서 "그 장소"부터 보여 준다
const placeIndexAt = (event: EventItem, key: string) =>
  Math.max(event.places.findIndex((p) => markerKey(p.latitude, p.longitude) === key), 0)

function selectMarker(marker: MapMarker) {
  if (marker.events.length === 1) return showEvent(marker.events[0]!, placeIndexAt(marker.events[0]!, marker.key))
  selectedEvent.value = null
  listMarker.value = marker
}

function selectFromList(event: EventItem) {
  const key = listMarker.value?.key
  showEvent(event, key ? placeIndexAt(event, key) : 0)
}

const prev = () => hasPrev.value && showEvent(chronological.value[selectedIndex.value - 1]!)
const next = () => hasNext.value && showEvent(chronological.value[selectedIndex.value + 1]!)

function closeOverlay() {
  selectedEvent.value = null
  listMarker.value = null
}

function selectFromDrawer(event: EventItem, atPlace: number) {
  showEvent(event, atPlace)
  drawerOpen.value = false
}

// 목록을 새로 불러오면 선택된 추억도 새 객체로 바꾼다(삭제됐으면 닫는다)
watch(chronological, (list) => {
  if (!selectedEvent.value) return
  const fresh = list.find((e) => e.id === selectedEvent.value!.id) ?? null
  if (fresh) showEvent(fresh, placeIndex.value)
  else closeOverlay()
})

// 지도에 넘길 값: 강조할 핀, 카드를 붙일 위치
const highlightKeys = computed(() => {
  if (listMarker.value) return [listMarker.value.key]
  return selectedEvent.value?.places.map((p) => markerKey(p.latitude, p.longitude)) ?? []
})
const focus = computed(() => {
  const p = selectedPlace.value ?? listMarker.value
  return p ? { latitude: p.latitude, longitude: p.longitude } : null
})

// 화면에 들어올 때마다 새로 불러오고, ?event=<id> 로 들어오면(업로드 후 "지도에서 보기") 그 추억을 바로 연다
onMounted(async () => {
  await store.load()
  const target = typeof route.query.event === 'string' ? route.query.event : null
  if (!target) return
  const event = chronological.value.find((e) => e.id === target)
  if (event) showEvent(event)
  router.replace({ name: 'map' }) // 새로고침해도 다시 열리지 않게 주소에서 지운다
})
</script>

<template>
  <div class="flex h-dvh flex-col bg-bg text-ink">
    <header class="relative z-10 flex h-14 shrink-0 items-center gap-2 bg-bar px-2 text-on-bar shadow-soft">
      <button type="button" class="press flex size-10 items-center justify-center rounded-full hover:bg-on-bar/10" aria-label="추억 목록 열기" @click="drawerOpen = true">
        <PhList :size="24" weight="bold" />
      </button>
      <h1 class="min-w-0 flex-1 truncate font-logo text-2xl leading-none">보충만의 추억</h1>
      <RouterLink to="/upload" class="press flex h-9 shrink-0 items-center gap-1 rounded-full bg-on-bar/15 pl-2.5 pr-3.5 text-sm font-semibold">
        <PhPlus :size="16" weight="bold" /> 사진
      </RouterLink>
    </header>

    <!-- isolate: 네이버 지도 내부 z-index(로고 등)가 목록 위로 올라오지 않게 가둔다 -->
    <main class="relative isolate flex-1 overflow-hidden">
      <NaverMap
        :markers="markers"
        :highlight-keys="highlightKeys"
        :route-event="selectedEvent"
        :focus="focus"
        @select="selectMarker"
        @map-click="closeOverlay"
      >
        <!-- 핀 위에 붙는 말풍선 -->
        <Transition name="rise" mode="out-in">
          <MemoryCard
            v-if="selectedEvent && selectedPlace"
            :key="`${selectedEvent.id}-${selectedPlace.id}`"
            :event="selectedEvent"
            :place="selectedPlace"
            :place-index="placeIndex"
            :number="store.numberOf(selectedEvent.id)"
            @prev-place="placeIndex--"
            @next-place="placeIndex++"
            @open="detailOpen = true"
            @close="closeOverlay"
          />
          <MemoryList
            v-else-if="listMarker"
            :key="listMarker.key"
            :marker="listMarker"
            :number-of="store.numberOf"
            @select="selectFromList"
            @close="closeOverlay"
          />
        </Transition>
      </NaverMap>

      <!-- 화면 양끝: 시간순 이전·다음 추억 -->
      <Transition name="fade">
        <button
          v-if="selectedEvent && hasPrev"
          type="button"
          class="press absolute left-3 top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-on-brand shadow-lift"
          aria-label="이전 추억"
          @click="prev"
        >
          <PhArrowLeft :size="22" weight="bold" />
        </button>
      </Transition>
      <Transition name="fade">
        <button
          v-if="selectedEvent && hasNext"
          type="button"
          class="press absolute right-3 top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-on-brand shadow-lift"
          aria-label="다음 추억"
          @click="next"
        >
          <PhArrowRight :size="22" weight="bold" />
        </button>
      </Transition>

      <p v-if="loading && !loaded" class="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-surface px-4 py-1.5 text-sm text-muted shadow-soft">
        불러오는 중…
      </p>
      <div v-if="errorMessage" class="absolute inset-x-4 top-4 z-10 rounded-2xl bg-surface px-4 py-3 text-sm shadow-soft" role="alert">
        {{ errorMessage }}
        <button type="button" class="ml-2 font-semibold text-brand underline" @click="store.load()">다시 시도</button>
      </div>

      <!-- 빈 상태: 사진 0장 -->
      <div v-if="loaded && !sortedEvents.length" class="absolute inset-0 z-10 flex items-center justify-center p-6">
        <div class="w-full max-w-xs rounded-2xl bg-surface p-6 text-center shadow-lift">
          <p class="font-title text-xl">첫 추억을 남겨 볼까요?</p>
          <p class="mb-5 mt-1 text-sm text-muted">사진을 올리면 찍은 장소에 표시돼요</p>
          <RouterLink to="/upload" class="press inline-block rounded-full bg-brand px-5 py-2.5 font-semibold text-on-brand">첫 사진 올리기</RouterLink>
        </div>
      </div>
    </main>

    <EventListDrawer
      :open="drawerOpen"
      :events="sortedEvents"
      :number-of="store.numberOf"
      :selected-event-id="selectedEvent?.id ?? null"
      @select="selectFromDrawer"
      @close="drawerOpen = false"
      @logout="logout"
    />

    <Transition name="fade">
      <MemoryDetail
        v-if="detailOpen && selectedEvent && selectedPlace"
        :event="selectedEvent"
        :place="selectedPlace"
        :number="store.numberOf(selectedEvent.id)"
        @close="detailOpen = false"
      />
    </Transition>
  </div>
</template>
