<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadNaverMaps } from '@/composables/useNaverMaps'

// 사진에 위치 정보가 없을 때 지도를 눌러 위치를 고르는 전체 화면 모달
const props = defineProps<{
  initial: { latitude: number; longitude: number } | null
}>()

const emit = defineEmits<{
  pick: [location: { latitude: number; longitude: number }]
  cancel: []
}>()

const DEFAULT_CENTER = { latitude: 35.8714, longitude: 128.6014 } // 대구시청

const container = ref<HTMLDivElement>()
const picked = ref(props.initial)
const errorMessage = ref('')

let map: naver.maps.Map | null = null
let marker: naver.maps.Marker | null = null

// 고른 위치 핀 (지도 화면의 강조 핀과 같은 모양)
const PIN_HTML = `<div style="position:relative;width:34px;height:34px;transform:translate(-50%,-100%)">
  <span style="position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--accent);border:2px solid #fff;box-shadow:0 3px 8px rgb(var(--shadow) / .35)"></span>
  <span style="position:absolute;left:12px;top:11px;width:10px;height:10px;border-radius:9999px;background:#fff"></span>
</div>`

onMounted(async () => {
  let maps: typeof naver.maps
  try {
    maps = await loadNaverMaps()
  } catch (e) {
    errorMessage.value = (e as Error).message
    return
  }
  if (!container.value) return

  const start = props.initial ?? DEFAULT_CENTER
  map = new maps.Map(container.value, {
    center: new maps.LatLng(start.latitude, start.longitude),
    zoom: props.initial ? 16 : 12,
    scaleControl: false,
    mapDataControl: false,
  })
  if (props.initial) marker = new maps.Marker({ map, position: map.getCenter(), icon: { content: PIN_HTML } })

  maps.Event.addListener(map, 'click', (e: { coord: naver.maps.LatLng }) => {
    picked.value = { latitude: e.coord.lat(), longitude: e.coord.lng() }
    if (marker) marker.setPosition(e.coord)
    else marker = new maps.Marker({ map: map!, position: e.coord, icon: { content: PIN_HTML } })
  })
})

onBeforeUnmount(() => {
  marker?.setMap(null)
  map?.destroy()
})
</script>

<template>
  <div class="fixed inset-0 z-30 flex flex-col bg-bg text-ink" role="dialog" aria-modal="true" aria-label="위치 고르기">
    <div class="flex h-14 items-center gap-1 bg-bar px-2 text-on-bar shadow-soft">
      <button type="button" class="press flex size-10 items-center justify-center rounded-full hover:bg-on-bar/10" aria-label="취소" @click="emit('cancel')">
        <PhX :size="22" weight="bold" />
      </button>
      <h2 class="font-title text-lg">지도를 눌러 위치 고르기</h2>
    </div>

    <div class="relative flex-1">
      <div ref="container" class="h-full w-full bg-surface-2" />
      <p v-if="errorMessage" class="alert absolute inset-x-4 top-4 bg-surface" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <div class="bg-surface px-4 pb-5 pt-3 shadow-lift">
      <p class="mb-2.5 text-sm text-muted">
        {{ picked ? `고른 위치: ${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}` : '아직 고르지 않았어요' }}
      </p>
      <button type="button" class="btn-primary press w-full py-3.5 text-base" :disabled="!picked" @click="picked && emit('pick', picked)">
        이 위치로 정하기
      </button>
    </div>
  </div>
</template>
