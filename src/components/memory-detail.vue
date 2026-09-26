<script setup lang="ts">
import { PhCaretLeft, PhCaretRight, PhImages, PhMapPin, PhX } from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchEventGallery, getPhotoUrl, type GalleryPhoto } from '@/composables/useEvents'
import { formatShortDate } from '@/utils/format-date'
import type { EventItem, Place } from '@/types/models'

// 추억 카드를 누르면 뜨는 상세 창 (레퍼런스처럼 어두운 배경 위 큰 카드).
// 지금 장소의 사진을 넘겨 보고, 제목·날짜·장소·설명을 보여 준다.
const props = defineProps<{
  event: EventItem
  place: Place
  number: number
}>()

const emit = defineEmits<{ close: [] }>()

const photos = ref<GalleryPhoto[]>([])
const index = ref(0)
const loading = ref(true)
const errorMessage = ref('')
const urls = ref<Record<string, string>>({})

async function load() {
  loading.value = true
  errorMessage.value = ''
  index.value = 0
  try {
    const gallery = await fetchEventGallery(props.event.id)
    photos.value = gallery?.places.find((p) => p.id === props.place.id)?.photos ?? []
  } catch (e) {
    errorMessage.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => props.place.id, load, { immediate: true })

const current = computed(() => photos.value[index.value])

// 큰 사진은 볼 때만 받는다 (받는 동안은 썸네일)
watch(current, async (photo) => {
  if (!photo || urls.value[photo.id]) return
  try {
    const url = await getPhotoUrl(photo.storagePath)
    urls.value = { ...urls.value, [photo.id]: url }
  } catch {
    /* 썸네일로 계속 보여 준다 */
  }
})

const prev = () => index.value > 0 && index.value--
const next = () => index.value < photos.value.length - 1 && index.value++

let touchX: number | null = null
const onTouchStart = (e: TouchEvent) => (touchX = e.touches[0]?.clientX ?? null)
function onTouchEnd(e: TouchEvent) {
  if (touchX === null) return
  const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX
  touchX = null
  if (dx > 50) prev()
  else if (dx < -50) next()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}
const closeButton = ref<HTMLButtonElement>()
onMounted(() => {
  window.addEventListener('keydown', onKey)
  closeButton.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" :aria-label="`${event.title} 자세히 보기`">
    <button type="button" class="absolute inset-0 bg-[rgb(16_14_22/0.6)]" aria-label="닫기" tabindex="-1" @click="emit('close')" />

    <article class="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-lift">
      <!-- 사진 넘겨 보기 -->
      <div class="relative aspect-[4/3] w-full shrink-0 bg-[#100e16]" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
        <Transition name="fade" mode="out-in">
          <img
            v-if="current"
            :key="current.id"
            :src="urls[current.id] ?? current.thumbUrl ?? ''"
            :alt="`${place.name}에서 찍은 사진`"
            class="h-full w-full object-contain"
          />
        </Transition>
        <p v-if="loading" class="absolute inset-0 flex items-center justify-center text-sm text-white/60">불러오는 중…</p>
        <p v-else-if="!photos.length" class="absolute inset-0 flex items-center justify-center text-sm text-white/60">이 장소에는 사진이 없어요</p>

        <button
          v-if="index > 0"
          type="button"
          class="press absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm"
          aria-label="이전 사진"
          @click="prev"
        >
          <PhCaretLeft :size="18" weight="bold" />
        </button>
        <button
          v-if="index < photos.length - 1"
          type="button"
          class="press absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm"
          aria-label="다음 사진"
          @click="next"
        >
          <PhCaretRight :size="18" weight="bold" />
        </button>
        <div v-if="photos.length > 1" class="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
          <span v-for="(p, i) in photos" :key="p.id" class="size-1.5 rounded-full" :class="i === index ? 'bg-white' : 'bg-white/40'" />
        </div>

        <button
          ref="closeButton"
          type="button"
          class="press absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-overlay text-white"
          aria-label="닫기"
          @click="emit('close')"
        >
          <PhX :size="18" weight="bold" />
        </button>
      </div>

      <div class="overflow-y-auto px-5 pb-5 pt-4">
        <p class="text-xs text-muted">{{ number }}번째 우리들의 추억</p>
        <h2 class="mt-0.5 flex items-center gap-1 font-title text-xl">
          <PhCaretRight :size="18" weight="fill" class="shrink-0 text-brand" />
          <span class="break-words">{{ event.title }}</span>
        </h2>
        <p class="mt-1 text-sm text-muted">{{ formatShortDate(event.eventDate) }}</p>
        <p class="mt-0.5 flex items-center gap-1 text-sm">
          <PhMapPin :size="14" weight="fill" class="shrink-0 text-accent" />
          <span>{{ place.name }}<span v-if="photos.length" class="text-muted">, 사진 {{ index + 1 }}/{{ photos.length }}</span></span>
        </p>
        <p v-if="event.description" class="mt-3 whitespace-pre-line break-words text-sm leading-relaxed">{{ event.description }}</p>
        <p v-if="errorMessage" class="alert mt-3" role="alert">{{ errorMessage }}</p>

        <RouterLink :to="{ name: 'event-photos', params: { id: event.id } }" class="btn-ghost press mt-4 w-full">
          <PhImages :size="16" /> 사진 전체 보기 · 수정
        </RouterLink>
      </div>
    </article>
  </div>
</template>
