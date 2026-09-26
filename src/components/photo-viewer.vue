<script setup lang="ts">
import { PhCaretLeft, PhCaretRight, PhStar, PhTrash, PhX } from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPhotoUrl, type GalleryPhoto } from '@/composables/useEvents'

// 전체 화면 사진 보기: 좌우 버튼·키보드 화살표·스와이프로 넘기고 Esc 로 닫는다.
// 대표사진 지정·삭제는 부모가 처리하고 photos 를 새로 내려준다.
export type ViewerPhoto = GalleryPhoto & { placeId: string; placeName: string }

const props = defineProps<{
  photos: ViewerPhoto[]
  startIndex: number
  coverPhotoId: string | null
  busy: boolean
}>()

const emit = defineEmits<{
  close: []
  setCover: [photo: ViewerPhoto]
  delete: [photo: ViewerPhoto]
}>()

const index = ref(props.startIndex)
const url = ref('')
const loading = ref(false)
const errorMessage = ref('')
const cache = new Map<string, string>()

const current = computed(() => props.photos[Math.min(index.value, props.photos.length - 1)]!)
const hasPrev = computed(() => index.value > 0)
const hasNext = computed(() => index.value < props.photos.length - 1)

const takenLabel = computed(() => {
  if (!current.value.takenAt) return '촬영 시각 없음'
  const d = new Date(current.value.takenAt)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

async function load() {
  const photo = current.value
  errorMessage.value = ''
  // 원본을 받는 동안 썸네일을 먼저 보여 준다
  url.value = cache.get(photo.storagePath) ?? photo.thumbUrl ?? ''
  if (cache.has(photo.storagePath)) return
  loading.value = true
  try {
    const full = await getPhotoUrl(photo.storagePath)
    cache.set(photo.storagePath, full)
    if (current.value === photo) url.value = full
  } catch (e) {
    errorMessage.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => current.value?.id, () => current.value && load(), { immediate: true })

// 삭제로 목록이 줄면 위치를 맞추고, 다 지워지면 닫는다
watch(
  () => props.photos.length,
  (length) => {
    if (length === 0) emit('close')
    else if (index.value >= length) index.value = length - 1
  },
)

function confirmDelete() {
  if (window.confirm('이 사진을 삭제할까요? 되돌릴 수 없어요.')) emit('delete', current.value)
}

const prev = () => hasPrev.value && index.value--
const next = () => hasNext.value && index.value++

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

let touchX: number | null = null
const onTouchStart = (e: TouchEvent) => (touchX = e.touches[0]?.clientX ?? null)
function onTouchEnd(e: TouchEvent) {
  if (touchX === null) return
  const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX
  if (dx > 50) prev()
  else if (dx < -50) next()
  touchX = null
}

const closeButton = ref<HTMLButtonElement>()
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="fixed inset-0 z-40 flex flex-col bg-[#100e16] text-white" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
    <div class="flex items-center justify-between px-3 py-2">
      <span class="pl-1 text-sm text-white/70">{{ index + 1 }} / {{ photos.length }}</span>
      <button ref="closeButton" type="button" class="press flex size-10 items-center justify-center rounded-full hover:bg-white/10" aria-label="닫기" @click="emit('close')">
        <PhX :size="22" weight="bold" />
      </button>
    </div>

    <div class="relative flex min-h-0 flex-1 items-center justify-center" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
      <Transition name="fade" mode="out-in">
        <img v-if="url" :key="current.id" :src="url" :alt="`${current.placeName}에서 찍은 사진`" class="max-h-full max-w-full object-contain" />
      </Transition>
      <p v-if="loading && !url" class="text-sm text-white/60">불러오는 중…</p>
      <p v-if="errorMessage" class="absolute bottom-4 rounded-full bg-accent px-3 py-1 text-sm" role="alert">{{ errorMessage }}</p>

      <button
        v-if="hasPrev"
        type="button"
        class="press absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/25"
        aria-label="이전 사진"
        @click="prev"
      >
        <PhCaretLeft :size="22" weight="bold" />
      </button>
      <button
        v-if="hasNext"
        type="button"
        class="press absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/25"
        aria-label="다음 사진"
        @click="next"
      >
        <PhCaretRight :size="22" weight="bold" />
      </button>
    </div>

    <div class="flex items-end justify-between gap-3 px-4 pb-5 pt-3 text-sm">
      <div class="min-w-0">
        <p class="truncate font-title text-base">{{ current.placeName }}</p>
        <p class="text-white/60">{{ takenLabel }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <span v-if="current.id === coverPhotoId" class="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold">
          <PhStar :size="14" weight="fill" /> 대표사진
        </span>
        <button
          v-else
          type="button"
          class="press flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 disabled:opacity-50"
          :disabled="busy"
          @click="emit('setCover', current)"
        >
          <PhStar :size="14" /> 대표사진으로
        </button>
        <button
          type="button"
          class="press flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
          :disabled="busy"
          @click="confirmDelete"
        >
          <PhTrash :size="14" /> 삭제
        </button>
      </div>
    </div>
  </div>
</template>
