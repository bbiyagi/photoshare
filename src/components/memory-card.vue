<script setup lang="ts">
import { PhCaretLeft, PhCaretRight, PhImage, PhX } from '@phosphor-icons/vue'
import { formatShortDate } from '@/utils/format-date'
import type { EventItem, Place } from '@/types/models'

// 지도 핀 위에 붙는 추억 카드 (레퍼런스의 InfoWindow).
// - 양옆 띠(‹ ›): 같은 추억 안의 이전·다음 장소
// - 카드를 누르면 상세 창(사진 넘겨 보기)을 연다
// - 이전·다음 "추억" 이동은 화면 양끝 원형 버튼(지도 화면)이 맡는다
const props = defineProps<{
  event: EventItem
  place: Place
  placeIndex: number
  number: number
}>()

const emit = defineEmits<{ prevPlace: []; nextPlace: []; open: []; close: [] }>()

const hasPrevPlace = () => props.placeIndex > 0
const hasNextPlace = () => props.placeIndex < props.event.places.length - 1

let touchX: number | null = null
const onTouchStart = (e: TouchEvent) => (touchX = e.touches[0]?.clientX ?? null)
function onTouchEnd(e: TouchEvent) {
  if (touchX === null) return
  const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX
  touchX = null
  if (dx > 50 && hasPrevPlace()) emit('prevPlace')
  else if (dx < -50 && hasNextPlace()) emit('nextPlace')
}
</script>

<template>
  <div class="relative w-[min(72vw,260px)]" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
    <!-- 같은 추억의 이전·다음 장소 -->
    <button
      v-if="hasPrevPlace()"
      type="button"
      class="press absolute inset-y-5 -left-7 flex w-9 items-center justify-start rounded-l-2xl bg-accent/35 pl-1 text-white"
      aria-label="이전 장소"
      @click="emit('prevPlace')"
    >
      <PhCaretLeft :size="18" weight="bold" />
    </button>
    <button
      v-if="hasNextPlace()"
      type="button"
      class="press absolute inset-y-5 -right-7 flex w-9 items-center justify-end rounded-r-2xl bg-accent/35 pr-1 text-white"
      aria-label="다음 장소"
      @click="emit('nextPlace')"
    >
      <PhCaretRight :size="18" weight="bold" />
    </button>

    <article class="relative overflow-hidden rounded-2xl bg-surface shadow-lift">
      <button type="button" class="block w-full text-left" :aria-label="`${event.title} 자세히 보기`" @click="emit('open')">
        <img v-if="place.coverUrl ?? event.coverUrl" :src="place.coverUrl ?? event.coverUrl ?? ''" alt="" class="aspect-[16/10] w-full object-cover" />
        <div v-else class="flex aspect-[16/10] w-full items-center justify-center bg-brand-soft text-brand">
          <PhImage :size="32" />
        </div>
        <div class="px-3.5 pb-3 pt-2.5">
          <p class="text-[11px] text-muted">{{ number }}번째 우리들의 추억</p>
          <h2 class="flex items-center gap-1 font-title text-base leading-snug text-ink">
            <PhCaretRight :size="15" weight="fill" class="shrink-0 text-brand" />
            <span class="truncate">{{ event.title }}</span>
          </h2>
          <p class="mt-1 text-xs text-muted">{{ formatShortDate(event.eventDate) }}</p>
          <p class="truncate text-sm text-ink">
            <!-- 이름이 없는 장소는 "3곳 중 2번째 장소", 이름이 있으면 "김광석 거리 (2/3)" -->
            <template v-if="place.named">
              {{ place.name }}
              <span v-if="event.places.length > 1" class="text-xs text-muted">({{ placeIndex + 1 }}/{{ event.places.length }})</span>
            </template>
            <template v-else-if="event.places.length > 1">{{ event.places.length }}곳 중 {{ place.name }}</template>
            <template v-else>사진 {{ place.photoCount }}장</template>
          </p>
        </div>
      </button>

      <button
        type="button"
        class="press absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-overlay text-white"
        aria-label="닫기"
        @click="emit('close')"
      >
        <PhX :size="14" weight="bold" />
      </button>
    </article>

    <!-- 말풍선 꼬리: 카드가 핀을 가리키게 -->
    <span class="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-surface" aria-hidden="true" />
  </div>
</template>
