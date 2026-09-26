<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PhCalendarBlank, PhCheckCircle, PhImage, PhImagesSquare, PhMapPin, PhX } from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LocationPicker from '@/components/location-picker.vue'
import PageHeader from '@/components/page-header.vue'
import { createEvent, createPlace, fetchPlacesOfEvent, insertPhoto, setCoverIfEmpty } from '@/composables/useEvents'
import {
  compressImage,
  distanceMeters,
  readMeta,
  removeFiles,
  uploadWithProgress,
  validateFile,
} from '@/composables/usePhotos'
import { useEventsStore } from '@/stores/events'
import { formatShortDate } from '@/utils/format-date'

// 흐름: 파일 선택 → EXIF(날짜·위치) 읽기 → 없으면 직접 입력 → 가까운 사진끼리 장소로 묶기
//       → 이벤트 지정 → 압축·업로드(진행률) → photos/places/events 저장
type Status = 'reading' | 'ready' | 'invalid' | 'uploading' | 'done' | 'failed'

interface Item {
  id: string
  file: File
  status: Status
  error: string
  takenAt: string // datetime-local 값 (YYYY-MM-DDTHH:mm), 없으면 ''
  dateFromExif: boolean
  latitude: number | null
  longitude: number | null
  locationFromExif: boolean
  progress: number // 0~1
  previewUrl: string
  previewFailed: boolean
}

const SAME_PLACE_METERS = 150 // 이 거리 안의 사진은 같은 장소로 본다

const store = useEventsStore()
const { sortedEvents } = storeToRefs(store)
const route = useRoute()
onMounted(() => {
  if (!store.loaded) store.load()
  // 사진 보기 화면의 "이 이벤트에 사진 추가"로 들어오면 그 이벤트를 미리 고른다
  if (typeof route.query.event === 'string') {
    eventMode.value = 'existing'
    existingEventId.value = route.query.event
  }
})

const items = ref<Item[]>([])
const pickerFor = ref<Item | null>(null)
const submitting = ref(false)
const formError = ref('')
const finished = ref(false)

const eventMode = ref<'new' | 'existing'>('new')
const existingEventId = ref('')
const newEvent = reactive({ title: '', eventDate: '', description: '' })
let eventDateTouched = false
const markDateTouched = () => (eventDateTouched = true)

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = '' // 같은 파일을 다시 고를 수 있게
  finished.value = false

  for (const file of files) {
    const duplicate = items.value.some(
      (i) => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified,
    )
    if (duplicate) continue

    const error = validateFile(file)
    items.value.push({
      id: crypto.randomUUID(),
      file,
      status: error ? 'invalid' : 'reading',
      error: error ?? '',
      takenAt: '',
      dateFromExif: false,
      latitude: null,
      longitude: null,
      locationFromExif: false,
      progress: 0,
      previewUrl: URL.createObjectURL(file),
      previewFailed: false,
    })
    if (error) continue

    // push 이후 반응형 프록시로 다시 찾아 수정한다
    const item = items.value[items.value.length - 1]!
    readMeta(file).then((meta) => {
      if (meta.takenAt) {
        item.takenAt = toLocalInput(meta.takenAt)
        item.dateFromExif = true
      }
      if (meta.latitude !== null && meta.longitude !== null) {
        item.latitude = meta.latitude
        item.longitude = meta.longitude
        item.locationFromExif = true
      }
      item.status = 'ready'
    })
  }
}

function removeItem(item: Item) {
  URL.revokeObjectURL(item.previewUrl)
  items.value = items.value.filter((i) => i !== item)
}
onBeforeUnmount(() => items.value.forEach((i) => URL.revokeObjectURL(i.previewUrl)))

function onPicked(location: { latitude: number; longitude: number }) {
  if (pickerFor.value) {
    pickerFor.value.latitude = location.latitude
    pickerFor.value.longitude = location.longitude
    pickerFor.value.locationFromExif = false
  }
  pickerFor.value = null
}

// 올릴 사진: 아직 끝나지 않은 정상 파일 (실패한 것은 다시 시도)
const pending = computed(() => items.value.filter((i) => i.status === 'ready' || i.status === 'failed'))
const missingLocation = computed(() => pending.value.filter((i) => i.latitude === null))
const stillReading = computed(() => items.value.some((i) => i.status === 'reading'))

// 가까운 사진끼리 장소로 묶고, 가장 이른 촬영 시각 순으로 방문 순서를 정한다.
// 장소 이름은 받지 않는다(지도에는 "N번째 장소"로 보이고, 사진 모아 보기에서 이름을 붙일 수 있다).
const groups = computed(() => {
  const result: { key: string; latitude: number; longitude: number; items: Item[] }[] = []
  for (const item of pending.value) {
    if (item.latitude === null || item.longitude === null) continue
    const group = result.find((g) => distanceMeters(g.latitude, g.longitude, item.latitude!, item.longitude!) < SAME_PLACE_METERS)
    if (group) group.items.push(item)
    else
      result.push({
        key: `${item.latitude.toFixed(3)},${item.longitude.toFixed(3)}`,
        latitude: item.latitude,
        longitude: item.longitude,
        items: [item],
      })
  }
  const earliest = (g: { items: Item[] }) => g.items.map((i) => i.takenAt).filter(Boolean).sort()[0] ?? '9999'
  return result.sort((a, b) => earliest(a).localeCompare(earliest(b)))
})

// 새 이벤트 날짜는 가장 이른 촬영일로 채운다 (사용자가 직접 고치면 유지)
watch(
  () => pending.value.map((i) => i.takenAt).filter(Boolean).sort()[0],
  (first) => {
    if (first && !eventDateTouched) newEvent.eventDate = first.slice(0, 10)
  },
)

// 같은 제목의 추억이 이미 있으면 "거기에 추가할까요?"를 제안한다 (띄어쓰기·대소문자는 무시).
// 자동으로 합치지 않는 이유: "데이트"처럼 흔한 제목이면 다른 날 추억이 섞일 수 있어서.
const normalizeTitle = (t: string) => t.replace(/\s+/g, '').toLowerCase()
const dismissedTitle = ref('')
const titleMatches = computed(() => {
  const title = normalizeTitle(newEvent.title)
  if (eventMode.value !== 'new' || !title || title === dismissedTitle.value) return []
  return sortedEvents.value.filter((e) => normalizeTitle(e.title) === title)
})
function addToExisting(eventId: string) {
  eventMode.value = 'existing'
  existingEventId.value = eventId
}
const dismissMatches = () => (dismissedTitle.value = normalizeTitle(newEvent.title))

function validate(): string | null {
  if (!pending.value.length) return '올릴 사진을 선택해 주세요.'
  if (stillReading.value) return '사진 정보를 읽는 중이에요. 잠시 후 다시 눌러 주세요.'
  if (missingLocation.value.length) return `위치가 없는 사진 ${missingLocation.value.length}장의 위치를 지도에서 선택해 주세요.`
  if (eventMode.value === 'new') {
    if (!newEvent.title.trim()) return '이벤트 제목을 입력해 주세요.'
    if (!newEvent.eventDate) return '이벤트 날짜를 입력해 주세요.'
  } else if (!existingEventId.value) {
    return '사진을 추가할 이벤트를 선택해 주세요.'
  }
  return null
}

async function uploadItem(item: Item, eventId: string, placeId: string): Promise<string> {
  item.status = 'uploading'
  item.error = ''
  item.progress = 0
  const uploaded: string[] = []
  try {
    const { main, thumb, original } = await compressImage(item.file)
    const id = crypto.randomUUID()
    const ext = original ? (item.file.name.split('.').pop()?.toLowerCase() ?? 'jpg') : 'jpg'
    const mainPath = `${eventId}/${id}.${ext}`
    const thumbPath = thumb ? `${eventId}/thumb/${id}.jpg` : null

    await uploadWithProgress(mainPath, main.blob, (r) => (item.progress = r * (thumb ? 0.9 : 1)))
    uploaded.push(mainPath)
    if (thumb && thumbPath) {
      await uploadWithProgress(thumbPath, thumb.blob, (r) => (item.progress = 0.9 + r * 0.1))
      uploaded.push(thumbPath)
    }

    const photoId = await insertPhoto({
      placeId,
      storagePath: mainPath,
      thumbnailPath: thumbPath,
      takenAt: item.takenAt ? new Date(item.takenAt).toISOString() : null,
      latitude: item.latitude,
      longitude: item.longitude,
      width: main.width || null,
      height: main.height || null,
    })
    item.progress = 1
    item.status = 'done'
    return photoId
  } catch (e) {
    await removeFiles(uploaded).catch(() => {}) // DB 저장에 실패하면 올린 파일을 지운다
    item.status = 'failed'
    item.error = (e as Error).message
    throw e
  }
}

async function submit() {
  formError.value = validate() ?? ''
  if (formError.value || submitting.value) return
  submitting.value = true

  try {
    const eventId =
      eventMode.value === 'existing'
        ? existingEventId.value
        : await createEvent({
            title: newEvent.title.trim(),
            eventDate: newEvent.eventDate,
            description: newEvent.description.trim() || null,
          })
    // 이후 재시도가 같은 이벤트에 붙도록 전환한다 (이벤트 중복 생성 방지)
    eventMode.value = 'existing'
    existingEventId.value = eventId

    const places = await fetchPlacesOfEvent(eventId)
    let nextOrder = places.reduce((max, p) => Math.max(max, p.visit_order + 1), 0)
    let coverSet = false

    for (const group of groups.value) {
      const reuse =
        places.find((p) => distanceMeters(p.latitude, p.longitude, group.latitude, group.longitude) < SAME_PLACE_METERS) ?? null
      const placeId =
        reuse?.id ??
        (await createPlace({
          eventId,
          latitude: group.latitude,
          longitude: group.longitude,
          visitOrder: nextOrder++,
        }))

      for (const item of group.items) {
        try {
          const photoId = await uploadItem(item, eventId, placeId)
          if (!coverSet) {
            await setCoverIfEmpty(eventId, photoId)
            coverSet = true
          }
        } catch {
          /* 사진별 오류는 목록에 표시하고 나머지는 계속 올린다 */
        }
      }
    }

    const failed = items.value.filter((i) => i.status === 'failed').length
    formError.value = failed ? `${failed}장을 올리지 못했어요. 오류를 확인하고 다시 눌러 주세요.` : ''
    finished.value = !failed
    await store.load()
  } catch (e) {
    formError.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

const doneCount = computed(() => items.value.filter((i) => i.status === 'done').length)
</script>

<template>
  <div class="min-h-dvh bg-bg text-ink">
    <PageHeader title="사진 올리기" />

    <form class="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-4 pt-4" novalidate @submit.prevent="submit">
      <!-- 1. 파일 선택 -->
      <label
        class="press flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-mid bg-brand-soft text-center text-brand"
        :class="submitting ? 'pointer-events-none opacity-50' : ''"
      >
        <PhImagesSquare :size="30" />
        <span class="font-semibold">사진 고르기</span>
        <span class="text-xs text-muted">여러 장 한 번에, 한 장 최대 20MB (jpg, png, webp, heic)</span>
        <input type="file" accept="image/*,.heic,.heif" multiple class="sr-only" :disabled="submitting" @change="onFilesSelected" />
      </label>

      <!-- 2. 사진별 날짜·위치 -->
      <section v-if="items.length" class="rounded-2xl bg-surface p-4 shadow-soft">
        <h2 class="mb-3 font-title text-lg">날짜와 위치 <span class="text-sm text-muted">{{ items.length }}장</span></h2>
        <ul class="space-y-4">
          <li v-for="item in items" :key="item.id" class="flex gap-3">
            <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
              <img v-if="!item.previewFailed" :src="item.previewUrl" alt="" class="h-full w-full object-cover" @error="item.previewFailed = true" />
              <PhImage v-else :size="24" class="text-muted" />
            </div>

            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-semibold">{{ item.file.name }} <span class="font-normal text-muted">{{ formatSize(item.file.size) }}</span></p>

              <p v-if="item.status === 'invalid'" class="alert mt-1" role="alert">{{ item.error }}</p>
              <p v-else-if="item.status === 'reading'" class="mt-1 text-muted">사진 정보 읽는 중…</p>

              <template v-else>
                <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PhCalendarBlank :size="16" class="shrink-0 text-muted" />
                  <span v-if="item.dateFromExif">{{ item.takenAt.replace('T', ' ') }}</span>
                  <input
                    v-else
                    v-model="item.takenAt"
                    type="datetime-local"
                    class="field w-auto px-2 py-1"
                    :aria-label="`${item.file.name} 촬영 날짜 (선택)`"
                    :disabled="item.status === 'done' || item.status === 'uploading'"
                  />
                </p>
                <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PhMapPin :size="16" class="shrink-0" :class="item.latitude === null ? 'text-accent' : 'text-muted'" />
                  <span v-if="item.locationFromExif">사진에 위치 정보가 있어요</span>
                  <template v-else>
                    <span v-if="item.latitude !== null">지도에서 고른 위치</span>
                    <button
                      v-if="item.status !== 'done' && item.status !== 'uploading'"
                      type="button"
                      class="press rounded-full px-3 py-1 text-xs font-semibold"
                      :class="item.latitude === null ? 'bg-accent text-on-accent' : 'border border-line text-muted'"
                      @click="pickerFor = item"
                    >
                      {{ item.latitude === null ? '위치 고르기' : '다시 고르기' }}
                    </button>
                  </template>
                </p>

                <div v-if="item.status === 'uploading' || item.status === 'done'" class="mt-2 flex items-center gap-2">
                  <div
                    class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    :aria-valuenow="Math.round(item.progress * 100)"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-label="`${item.file.name} 업로드 진행률`"
                  >
                    <div class="h-full rounded-full bg-brand transition-[width] duration-200" :style="{ width: `${item.progress * 100}%` }" />
                  </div>
                  <PhCheckCircle v-if="item.status === 'done'" :size="18" weight="fill" class="text-brand" aria-label="완료" />
                  <span v-else class="w-9 text-right text-xs text-muted">{{ Math.round(item.progress * 100) }}%</span>
                </div>
                <p v-if="item.status === 'failed'" class="alert mt-1.5" role="alert">{{ item.error }}</p>
              </template>
            </div>

            <button
              v-if="item.status !== 'uploading' && item.status !== 'done'"
              type="button"
              class="press flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              :aria-label="`${item.file.name} 빼기`"
              :disabled="submitting"
              @click="removeItem(item)"
            >
              <PhX :size="16" />
            </button>
          </li>
        </ul>
      </section>

      <!-- 3. 이벤트 -->
      <section v-if="items.length" class="rounded-2xl bg-surface p-4 shadow-soft">
        <h2 class="mb-3 font-title text-lg">어떤 추억인가요?</h2>
        <div class="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-sm" role="radiogroup" aria-label="이벤트 선택 방식">
          <label class="press cursor-pointer rounded-full py-2 text-center font-semibold" :class="eventMode === 'new' ? 'bg-brand text-on-brand shadow-soft' : 'text-muted'">
            <input v-model="eventMode" type="radio" value="new" class="sr-only" :disabled="submitting" />새 추억
          </label>
          <label class="press cursor-pointer rounded-full py-2 text-center font-semibold" :class="eventMode === 'existing' ? 'bg-brand text-on-brand shadow-soft' : 'text-muted'">
            <input v-model="eventMode" type="radio" value="existing" class="sr-only" :disabled="submitting" />기존 추억에 추가
          </label>
        </div>

        <div v-if="eventMode === 'new'" class="flex flex-col gap-3 text-sm">
          <label>
            <span class="mb-1.5 block font-semibold">제목</span>
            <input v-model="newEvent.title" type="text" maxlength="100" class="field" placeholder="예: 제주 여행 첫째 날" />
          </label>

          <!-- 같은 제목의 추억이 있으면 거기에 추가하도록 제안 -->
          <div v-if="titleMatches.length" class="rounded-[10px] bg-brand-soft p-3" role="status">
            <p class="mb-2 font-semibold text-brand">같은 제목의 추억이 있어요. 여기에 추가할까요?</p>
            <ul class="space-y-1.5">
              <li v-for="match in titleMatches" :key="match.id" class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate">
                  {{ match.title }} <span class="text-muted">{{ formatShortDate(match.eventDate) }}, 사진 {{ match.photoCount }}장</span>
                </span>
                <button type="button" class="btn-primary press shrink-0 px-3 py-1.5 text-xs" @click="addToExisting(match.id)">여기에 추가</button>
              </li>
            </ul>
            <button type="button" class="press mt-2 text-xs text-muted underline" @click="dismissMatches">아니요, 새 추억으로 만들게요</button>
          </div>
          <label>
            <span class="mb-1.5 block font-semibold">날짜</span>
            <input v-model="newEvent.eventDate" type="date" class="field" @input="markDateTouched" />
            <span class="mt-1 block text-xs text-muted">가장 먼저 찍은 사진 날짜로 채워져요</span>
          </label>
          <label>
            <span class="mb-1.5 block font-semibold">설명 (선택)</span>
            <textarea v-model="newEvent.description" rows="3" class="field" />
          </label>
        </div>

        <label v-else class="block text-sm">
          <span class="mb-1.5 block font-semibold">추억 선택</span>
          <select v-model="existingEventId" class="field" :disabled="submitting">
            <option value="" disabled>선택해 주세요</option>
            <option v-for="event in sortedEvents" :key="event.id" :value="event.id">{{ event.eventDate }} {{ event.title }}</option>
          </select>
          <span v-if="!sortedEvents.length" class="mt-1 block text-xs text-muted">아직 추억이 없어요. 새 추억으로 만들어 주세요.</span>
        </label>
      </section>

      <!-- 장소 안내: 이름은 받지 않고, 찍은 위치별로 나눠 선으로 잇는다 -->
      <p v-if="groups.length > 1" class="rounded-[10px] bg-surface-2 px-3 py-2.5 text-sm text-muted">
        사진이 {{ groups.length }}곳에서 찍혔어요. 지도에서 찍은 순서대로 선으로 이어져요.
      </p>

      <p v-if="formError" class="alert" role="alert">{{ formError }}</p>

      <div v-if="finished" class="rounded-2xl bg-surface p-6 text-center shadow-soft">
        <PhCheckCircle :size="40" weight="fill" class="mx-auto text-brand" />
        <p class="mb-4 mt-2 font-title text-xl">{{ doneCount }}장을 올렸어요</p>
        <!-- 방금 올린 추억을 지도에서 바로 연다 -->
        <RouterLink :to="{ name: 'map', query: { event: existingEventId } }" class="btn-primary press">지도에서 보기</RouterLink>
      </div>

      <div v-if="items.length && !finished" class="sticky bottom-0 -mx-4 bg-bg/90 px-4 pb-4 pt-3 backdrop-blur-sm">
        <button type="submit" class="btn-primary press w-full py-3.5 text-base" :disabled="submitting || !pending.length">
          {{ submitting ? '올리는 중…' : `${pending.length}장 올리기` }}
        </button>
      </div>
    </form>

    <LocationPicker
      v-if="pickerFor"
      :initial="pickerFor.latitude !== null && pickerFor.longitude !== null ? { latitude: pickerFor.latitude, longitude: pickerFor.longitude } : null"
      @pick="onPicked"
      @cancel="pickerFor = null"
    />
  </div>
</template>
