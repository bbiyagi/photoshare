<script setup lang="ts">
import { PhCaretDown, PhImage, PhMapPin, PhSignOut, PhX } from '@phosphor-icons/vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { formatShortDate } from '@/utils/format-date'
import type { EventItem } from '@/types/models'

// 전체 추억 목록(최신순). 왼쪽 띠의 번호는 "몇 번째 추억"인지(오래된 순 번호).
// 장소가 여러 곳인 추억은 펼쳐서 장소를 고를 수 있다(레퍼런스의 아코디언).
defineProps<{
  open: boolean
  events: EventItem[]
  numberOf: (eventId: string) => number
  selectedEventId: string | null
}>()

const emit = defineEmits<{
  select: [event: EventItem, placeIndex: number]
  close: []
  logout: []
}>()

const expandedId = ref<string | null>(null)
const toggle = (id: string) => (expandedId.value = expandedId.value === id ? null : id)
</script>

<template>
  <Transition name="fade">
    <button v-if="open" type="button" class="fixed inset-0 z-20 bg-[rgb(16_14_22/0.45)]" aria-label="목록 닫기" @click="emit('close')" />
  </Transition>
  <Transition name="slide">
    <aside
      v-if="open"
      class="fixed inset-y-0 left-0 z-30 flex w-[86%] max-w-sm flex-col bg-brand-strong text-white shadow-lift"
      role="dialog"
      aria-modal="true"
      aria-label="우리들의 추억 목록"
    >
      <div class="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 class="font-title text-xl">우리들의 추억 <span class="text-white/60">{{ events.length }}</span></h2>
        <button type="button" class="press flex size-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="닫기" @click="emit('close')">
          <PhX :size="20" weight="bold" />
        </button>
      </div>

      <ul v-if="events.length" class="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-4 pt-1">
        <li v-for="event in events" :key="event.id">
          <div class="flex overflow-hidden rounded-2xl bg-white/10" :class="event.id === selectedEventId ? 'ring-2 ring-accent' : ''">
            <button type="button" class="press flex min-w-0 flex-1 text-left hover:bg-white/5" :aria-current="event.id === selectedEventId" @click="emit('select', event, 0)">
              <span class="flex w-12 shrink-0 items-center justify-center bg-accent text-sm font-bold italic">#{{ numberOf(event.id) }}</span>
              <img v-if="event.coverUrl" :src="event.coverUrl" alt="" class="h-[76px] w-16 shrink-0 object-cover" />
              <span v-else class="flex h-[76px] w-16 shrink-0 items-center justify-center bg-white/5 text-white/50"><PhImage :size="22" /></span>
              <span class="min-w-0 flex-1 px-3 py-2.5">
                <span class="block truncate font-title text-base">{{ event.title }}</span>
                <span class="mt-0.5 block text-xs text-white/70">{{ formatShortDate(event.eventDate) }}</span>
                <span class="mt-0.5 flex items-center gap-1 text-xs text-white/85">
                  <PhMapPin :size="12" weight="fill" class="shrink-0" />
                  <span class="truncate">
                    {{ event.places.length === 1 && event.places[0]?.named ? event.places[0].name : `${event.places.length}곳, 사진 ${event.photoCount}장` }}
                  </span>
                </span>
              </span>
            </button>
            <button
              v-if="event.places.length > 1"
              type="button"
              class="press flex w-10 shrink-0 items-center justify-center hover:bg-white/5"
              :aria-expanded="expandedId === event.id"
              :aria-label="`${event.title} 장소 ${event.places.length}곳 ${expandedId === event.id ? '접기' : '펼치기'}`"
              @click="toggle(event.id)"
            >
              <PhCaretDown :size="18" weight="bold" class="transition-transform duration-200" :class="expandedId === event.id ? 'rotate-180' : ''" />
            </button>
          </div>

          <!-- 장소 목록 -->
          <ul v-if="expandedId === event.id" class="mt-1.5 space-y-1.5 pl-6">
            <li v-for="(place, i) in event.places" :key="place.id">
              <button type="button" class="press flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10" @click="emit('select', event, i)">
                <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold">{{ i + 1 }}</span>
                <span class="min-w-0 flex-1 truncate">{{ place.name }}</span>
                <span class="shrink-0 text-xs text-white/60">사진 {{ place.photoCount }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>

      <div v-else class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p class="text-white/70">아직 추억이 없어요</p>
        <RouterLink to="/upload" class="press rounded-full bg-white px-5 py-2.5 font-semibold text-brand-strong">첫 사진 올리기</RouterLink>
      </div>

      <div class="border-t border-white/10 px-4 py-3">
        <button type="button" class="press flex items-center gap-1.5 text-sm text-white/80 hover:text-white" @click="emit('logout')">
          <PhSignOut :size="16" /> 로그아웃
        </button>
      </div>
    </aside>
  </Transition>
</template>
