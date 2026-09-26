<script setup lang="ts">
import { PhCaretRight, PhX } from '@phosphor-icons/vue'
import { computed } from 'vue'
import { formatShortDate } from '@/utils/format-date'
import type { EventItem, MapMarker } from '@/types/models'

// 한 장소에 추억이 여러 개인 마커 위에 붙는 목록: 시간순으로 하나를 고른다
const props = defineProps<{
  marker: MapMarker
  numberOf: (eventId: string) => number
}>()

const emit = defineEmits<{ select: [event: EventItem]; close: [] }>()

const items = computed(() =>
  props.marker.events.map((event) => ({ event, number: props.numberOf(event.id) })).sort((a, b) => a.number - b.number),
)
</script>

<template>
  <div class="relative w-[min(70vw,240px)]">
    <section
      class="overflow-hidden rounded-2xl bg-overlay text-white shadow-lift backdrop-blur-sm"
      :aria-label="`${marker.placeName || '이 장소'}의 추억 ${marker.events.length}개`"
    >
      <header class="flex items-center justify-between gap-2 border-b border-white/15 py-2 pl-3.5 pr-1.5">
        <p class="min-w-0 truncate text-sm">
          <span class="font-title">{{ marker.placeName || '이 장소의 추억' }}</span>
          <span class="ml-1 text-white/70">{{ marker.events.length }}개</span>
        </p>
        <button type="button" class="press flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="닫기" @click="emit('close')">
          <PhX :size="14" weight="bold" />
        </button>
      </header>
      <ul class="max-h-56 overflow-y-auto overscroll-contain">
        <li v-for="{ event, number } in items" :key="event.id" class="border-b border-white/10 last:border-b-0">
          <button type="button" class="press w-full px-3.5 py-2.5 text-left hover:bg-white/10" @click="emit('select', event)">
            <span class="flex items-center gap-1 font-title text-[15px]">
              <PhCaretRight :size="14" weight="fill" class="shrink-0 text-accent" />
              <span class="truncate">{{ event.title }}</span>
            </span>
            <span class="mt-0.5 block pl-[18px] text-xs text-white/70">{{ number }}번째 추억, {{ formatShortDate(event.eventDate) }}</span>
          </button>
        </li>
      </ul>
    </section>
    <span class="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-overlay" aria-hidden="true" />
  </div>
</template>
