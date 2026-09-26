<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadNaverMaps } from '@/composables/useNaverMaps'
import type { EventItem, MapMarker } from '@/types/models'
import { clusterHtml, FOCUS_OFFSET_PX, FOCUS_ZOOM, groupMarkers, markerHtml, pinTitle } from '@/utils/map-markers'

// 네이버 지도 + 마커
// - 화면에 보이는 범위(bounds) 안의 마커만 그린다
// - 화면상 가까운 마커(CLUSTER_PX 이내)는 클러스터로 묶고, 누르면 그 범위로 확대한다
// - 선택한 추억의 장소들을 방문 순서대로 포인트 색 선(polyline)으로 잇는다
// - focus 가 정해지면 그 장소로 부드럽게 확대·이동하고, 기본 슬롯(추억 카드/목록)을
//   그 장소 핀 바로 위에 말풍선처럼 붙인다. 지도를 끌면 같이 움직인다.
//   슬롯은 네이버 지도 DOM 밖(지도 위 레이어)에 두고 위치만 계산해 옮긴다.
//   (지도 내부 레이어에 넣으면 휴대폰에서 카드 안의 터치를 지도가 드래그로 이어받아
//    다음 탭에서 지도가 끌려가는 문제가 있었다)
// - 색은 style.css 의 디자인 토큰(CSS 변수)을 그대로 쓴다
const props = defineProps<{
  markers: MapMarker[]
  highlightKeys: string[] // 강조할 마커(선택한 추억의 장소들, 목록을 연 마커)
  routeEvent: EventItem | null
  focus: { latitude: number; longitude: number } | null
}>()

const emit = defineEmits<{ select: [marker: MapMarker]; mapClick: [] }>()

const DEFAULT_CENTER = { lat: 35.8714, lng: 128.6014 } // 대구시청

const container = ref<HTMLDivElement>()
const anchor = ref<HTMLDivElement>() // 슬롯 내용을 담아 지도 위 좌표에 붙일 요소
const errorMessage = ref('')

let maps: typeof naver.maps
let map: naver.maps.Map | null = null
let rendered: naver.maps.Marker[] = []
let route: naver.maps.Polyline | null = null
const listeners: naver.maps.MapEventListener[] = []

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const toLatLng = (lat: number, lng: number) => new maps.LatLng(lat, lng)

function clearMarkers() {
  rendered.forEach((m) => m.setMap(null))
  rendered = []
}

// bounds 안의 마커를 화면 좌표 기준으로 묶는다 (단순 그리디 그리드)
function renderMarkers() {
  if (!map) return
  clearMarkers()

  const bounds = map.getBounds() as naver.maps.LatLngBounds
  const projection = map.getProjection()
  const visible = props.markers.filter((m) => bounds.hasLatLng(toLatLng(m.latitude, m.longitude)))

  for (const g of groupMarkers(visible, props.highlightKeys, (m) => projection.fromCoordToOffset(toLatLng(m.latitude, m.longitude)))) {
    if (g.kind === 'pins') {
      for (const { marker: m, highlighted } of g.items) {
        const marker = new maps.Marker({
          map,
          position: toLatLng(m.latitude, m.longitude),
          icon: { content: markerHtml(m.events.length, highlighted) },
          title: pinTitle(m),
          zIndex: highlighted ? 100 : 10,
        })
        maps.Event.addListener(marker, 'click', () => emit('select', m))
        rendered.push(marker)
      }
      continue
    }

    const first = g.items[0]!
    const cluster = new maps.Marker({
      map,
      position: toLatLng(first.latitude, first.longitude),
      icon: { content: clusterHtml(g.eventCount) },
      title: `장소 ${g.items.length}곳, 추억 ${g.eventCount}개`,
      zIndex: 50,
    })
    maps.Event.addListener(cluster, 'click', () => {
      map!.fitBounds(
        g.items.map((m) => toLatLng(m.latitude, m.longitude)),
        { top: 80, right: 60, bottom: 80, left: 60, maxZoom: 17 },
      )
    })
    rendered.push(cluster)
  }
}

function renderRoute() {
  if (!map) return
  route?.setMap(null)
  route = null
  const places = props.routeEvent?.places ?? []
  if (places.length < 2) return
  route = new maps.Polyline({
    map,
    path: places.map((p) => toLatLng(p.latitude, p.longitude)),
    strokeColor: cssVar('--accent') || '#c7404f',
    strokeWeight: 4,
    strokeOpacity: 0.85,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
  })
}

// 고른 장소로 부드럽게 확대·이동한다. 핀이 화면 가운데보다 FOCUS_OFFSET_PX 아래에 오도록
// 도착할 중심 좌표를 미리 계산해 한 번에 이동한다.
// (이동 후 'idle' 에서 panBy 로 보정하면 panBy 가 곧바로 idle 을 다시 일으켜 무한 반복된다)
function flyToFocus() {
  if (!map) return
  const focus = props.focus
  placeAnchor()
  if (!focus) return

  const target = toLatLng(focus.latitude, focus.longitude)
  const zoom = Math.max(map.getZoom(), FOCUS_ZOOM)
  const projection = map.getProjection()
  const point = projection.fromCoordToPoint(target)
  const dy = projection.scaleDown(FOCUS_OFFSET_PX, zoom) as number
  const center = projection.fromPointToCoord(new maps.Point(point.x, point.y - dy))

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    map.setZoom(zoom)
    map.setCenter(center)
  } else {
    map.morph(center, zoom, { duration: 500, easing: 'easeOutCubic' })
  }
}

function fitAll() {
  if (!map || !props.markers.length || props.focus) return
  map.fitBounds(
    props.markers.map((m) => toLatLng(m.latitude, m.longitude)),
    { top: 60, right: 60, bottom: 60, left: 60, maxZoom: 15 },
  )
}

// 슬롯(카드/목록)을 focus 좌표의 화면 위치로 옮긴다. 지도 중심 기준 픽셀 차이로 계산한다.
function placeAnchor() {
  const el = anchor.value
  if (!el) return
  const focus = props.focus
  if (!map || !focus) {
    el.style.display = 'none'
    return
  }
  const projection = map.getProjection()
  const p = projection.fromCoordToOffset(toLatLng(focus.latitude, focus.longitude))
  const c = projection.fromCoordToOffset(map.getCenter())
  const size = map.getSize()
  el.style.display = ''
  el.style.transform = `translate(${p.x - c.x + size.width / 2}px, ${p.y - c.y + size.height / 2}px)`
}

onMounted(async () => {
  try {
    maps = await loadNaverMaps()
  } catch (e) {
    errorMessage.value = (e as Error).message
    return
  }
  if (!container.value || !anchor.value) return

  map = new maps.Map(container.value, {
    center: toLatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
    zoom: 12,
    scaleControl: false,
    mapDataControl: false,
    logoControlOptions: { position: maps.Position.BOTTOM_LEFT },
  })
  listeners.push(maps.Event.addListener(map, 'idle', renderMarkers))
  listeners.push(maps.Event.addListener(map, 'click', () => emit('mapClick')))
  // 끌기·확대·부드러운 이동 중에도 카드가 핀을 따라가게 한다
  for (const type of ['bounds_changed', 'center_changed', 'zoom_changed', 'size_changed', 'idle']) {
    listeners.push(maps.Event.addListener(map, type, placeAnchor))
  }

  fitAll()
  renderMarkers()
  renderRoute()
  flyToFocus()
})

watch(() => props.markers, () => { fitAll(); renderMarkers() })
watch(() => props.highlightKeys, renderMarkers)
watch(() => props.routeEvent, renderRoute)
watch(() => props.focus, flyToFocus)

onBeforeUnmount(() => {
  listeners.forEach((l) => maps?.Event.removeListener(l))
  clearMarkers()
  route?.setMap(null)
  map?.destroy()
  map = null
})
</script>

<template>
  <div class="relative h-full w-full bg-surface-2">
    <div ref="container" class="h-full w-full" />
    <!-- 지도 위 좌표에 붙는 말풍선 자리(지도 DOM 밖): 아래쪽 가운데가 핀 끝(위로 42px)에 오도록 -->
    <div ref="anchor" class="pointer-events-none absolute left-0 top-0 z-10 will-change-transform" style="display: none">
      <div class="pointer-events-auto absolute bottom-[42px] left-0 -translate-x-1/2">
        <slot />
      </div>
    </div>
    <p v-if="errorMessage" class="absolute inset-x-4 top-4 rounded-2xl bg-surface px-4 py-3 text-sm text-ink shadow-soft" role="alert">
      {{ errorMessage }}
    </p>
  </div>
</template>
