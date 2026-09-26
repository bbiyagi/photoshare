<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { PhImage, PhPencilSimple, PhPlus, PhTrash } from '@phosphor-icons/vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/page-header.vue'
import PhotoViewer, { type ViewerPhoto } from '@/components/photo-viewer.vue'
import {
  deleteEvent,
  deletePhoto,
  fetchEventGallery,
  setCover,
  updateEvent,
  updatePlaceName,
  type EventGallery,
} from '@/composables/useEvents'
import { useEventsStore } from '@/stores/events'
import { formatDate } from '@/utils/format-date'

// 이벤트 사진 모아 보기 + 관리(이벤트 수정·삭제, 장소 이름 수정, 사진 삭제·대표사진 지정)
const route = useRoute()
const router = useRouter()
const eventsStore = useEventsStore()
// "N번째 우리들의 추억" 번호 (지도에서 바로 들어온 게 아니면 목록을 먼저 불러온다)
if (!eventsStore.loaded) eventsStore.load()

const gallery = ref<EventGallery | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const actionError = ref('')
const busy = ref(false)
const viewerIndex = ref<number | null>(null)

async function load() {
  errorMessage.value = ''
  try {
    gallery.value = await fetchEventGallery(String(route.params.id))
    if (!gallery.value) errorMessage.value = '이벤트를 찾을 수 없어요. 삭제되었을 수 있어요.'
  } catch (e) {
    errorMessage.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(
  () => route.params.id,
  () => {
    loading.value = true
    load()
  },
  { immediate: true },
)

// 수정·삭제 공통: 한 번에 하나만 실행하고, 끝나면 다시 불러온다
async function run(action: () => Promise<void>, reload = true) {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await action()
    if (reload) await load()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// 뷰어에서 장소를 넘나들며 넘길 수 있도록 한 줄로 편다
const flatPhotos = computed<ViewerPhoto[]>(() =>
  (gallery.value?.places ?? []).flatMap((p) => p.photos.map((photo) => ({ ...photo, placeId: p.id, placeName: p.name }))),
)
const totalCount = computed(() => flatPhotos.value.length)

function open(photoId: string) {
  viewerIndex.value = flatPhotos.value.findIndex((p) => p.id === photoId)
}

const onSetCover = (photo: ViewerPhoto) => run(() => setCover(gallery.value!.id, photo.id))
const onDeletePhoto = (photo: ViewerPhoto) => run(() => deletePhoto(gallery.value!.id, photo))

// ---- 이벤트 수정 ----
const editingEvent = ref(false)
const eventForm = reactive({ title: '', eventDate: '', description: '' })

function startEditEvent() {
  if (!gallery.value) return
  eventForm.title = gallery.value.title
  eventForm.eventDate = gallery.value.eventDate
  eventForm.description = gallery.value.description ?? ''
  editingEvent.value = true
}

function saveEvent() {
  if (!eventForm.title.trim()) return (actionError.value = '제목을 입력해 주세요.')
  if (!eventForm.eventDate) return (actionError.value = '날짜를 입력해 주세요.')
  run(async () => {
    await updateEvent(gallery.value!.id, {
      title: eventForm.title.trim(),
      eventDate: eventForm.eventDate,
      description: eventForm.description.trim() || null,
    })
    editingEvent.value = false
  })
}

function removeEvent() {
  const count = totalCount.value
  const message = count
    ? `'${gallery.value!.title}' 이벤트와 사진 ${count}장을 모두 삭제할까요? 되돌릴 수 없어요.`
    : `'${gallery.value!.title}' 이벤트를 삭제할까요?`
  if (!window.confirm(message)) return
  run(async () => {
    await deleteEvent(gallery.value!.id)
    await router.replace({ name: 'map' })
  }, false)
}

// ---- 장소 이름 수정 ----
const editingPlaceId = ref<string | null>(null)
const placeNameDraft = ref('')

function startEditPlace(place: { id: string; name: string; named: boolean }) {
  editingPlaceId.value = place.id
  placeNameDraft.value = place.named ? place.name : ''
}

function savePlace() {
  const name = placeNameDraft.value.trim() // 비우면 "N번째 장소"로 돌아간다
  const placeId = editingPlaceId.value!
  run(async () => {
    await updatePlaceName(placeId, name)
    editingPlaceId.value = null
  })
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-ink">
    <PageHeader title="추억 보기" />

    <p v-if="loading" class="p-4 text-sm text-muted">불러오는 중…</p>

    <div v-else-if="errorMessage" class="alert m-4" role="alert">
      {{ errorMessage }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">다시 시도</button>
    </div>

    <main v-else-if="gallery" class="mx-auto max-w-lg px-4 pb-10 pt-4">
      <p v-if="actionError" class="alert mb-3" role="alert">{{ actionError }}</p>

      <!-- 이벤트 정보 / 수정 -->
      <section class="rounded-2xl bg-surface p-4 shadow-soft">
        <form v-if="editingEvent" class="flex flex-col gap-3 text-sm" novalidate @submit.prevent="saveEvent">
          <label>
            <span class="mb-1.5 block font-semibold">제목</span>
            <input v-model="eventForm.title" type="text" maxlength="100" class="field" />
          </label>
          <label>
            <span class="mb-1.5 block font-semibold">날짜</span>
            <input v-model="eventForm.eventDate" type="date" class="field" />
          </label>
          <label>
            <span class="mb-1.5 block font-semibold">설명 (선택)</span>
            <textarea v-model="eventForm.description" rows="3" class="field" />
          </label>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary press flex-1" :disabled="busy">저장</button>
            <button type="button" class="btn-ghost press flex-1" :disabled="busy" @click="editingEvent = false">취소</button>
          </div>
        </form>

        <template v-else>
          <p v-if="eventsStore.numberOf(gallery.id)" class="text-xs text-muted">{{ eventsStore.numberOf(gallery.id) }}번째 우리들의 추억</p>
          <h2 class="mt-0.5 break-words font-title text-2xl">{{ gallery.title }}</h2>
          <p class="mt-1 text-sm text-muted">{{ formatDate(gallery.eventDate) }}, 사진 {{ totalCount }}장</p>
          <p v-if="gallery.description" class="mt-2 break-words text-sm leading-relaxed">{{ gallery.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <RouterLink :to="{ name: 'upload', query: { event: gallery.id } }" class="btn-primary press">
              <PhPlus :size="16" weight="bold" /> 사진 추가
            </RouterLink>
            <button type="button" class="btn-ghost press" :disabled="busy" @click="startEditEvent">
              <PhPencilSimple :size="16" /> 이벤트 수정
            </button>
          </div>
        </template>
      </section>

      <!-- 장소별 사진 -->
      <p v-if="!gallery.places.length" class="mt-8 text-center text-sm text-muted">아직 사진이 없어요.</p>

      <section v-for="(place, i) in gallery.places" :key="place.id" class="mt-7">
        <form v-if="editingPlaceId === place.id" class="mb-2.5 flex gap-2 text-sm" novalidate @submit.prevent="savePlace">
          <input
            v-model="placeNameDraft"
            type="text"
            maxlength="100"
            class="field min-w-0 flex-1 py-1.5"
            :aria-label="`${i + 1}번째 장소 이름`"
            placeholder="비우면 번호로 표시돼요"
          />
          <button type="submit" class="btn-primary press py-1.5" :disabled="busy">저장</button>
          <button type="button" class="btn-ghost press py-1.5" :disabled="busy" @click="editingPlaceId = null">취소</button>
        </form>
        <h3 v-else class="mb-2.5 flex items-center gap-2">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand">{{ i + 1 }}</span>
          <span class="min-w-0 truncate font-title text-lg">{{ place.name }}</span>
          <span class="text-sm text-muted">{{ place.photos.length }}</span>
          <button type="button" class="press ml-auto flex shrink-0 items-center gap-1 text-xs text-muted hover:text-brand" :disabled="busy" @click="startEditPlace(place)">
            <PhPencilSimple :size="14" /> {{ place.named ? '이름 수정' : '이름 붙이기' }}
          </button>
        </h3>

        <ul class="grid grid-cols-3 gap-1.5">
          <li v-for="photo in place.photos" :key="photo.id" class="relative">
            <button
              type="button"
              class="press block aspect-square w-full overflow-hidden rounded-lg bg-surface-2"
              :aria-label="`${place.name} 사진 크게 보기`"
              @click="open(photo.id)"
            >
              <img v-if="photo.thumbUrl" :src="photo.thumbUrl" alt="" loading="lazy" class="h-full w-full object-cover" />
              <PhImage v-else :size="24" class="m-auto text-muted" />
            </button>
            <span v-if="photo.id === gallery.coverPhotoId" class="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">
              대표
            </span>
          </li>
        </ul>
      </section>

      <div class="mt-12 border-t border-line pt-4">
        <button type="button" class="press flex items-center gap-1.5 text-sm text-accent" :disabled="busy" @click="removeEvent">
          <PhTrash :size="16" /> 이 이벤트 삭제
        </button>
      </div>
    </main>

    <PhotoViewer
      v-if="viewerIndex !== null && viewerIndex >= 0 && flatPhotos.length"
      :photos="flatPhotos"
      :start-index="viewerIndex"
      :cover-photo-id="gallery?.coverPhotoId ?? null"
      :busy="busy"
      @close="viewerIndex = null"
      @set-cover="onSetCover"
      @delete="onDeletePhoto"
    />
  </div>
</template>
