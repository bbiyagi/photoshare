<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EventItem, MapMarker } from '@/types/models'
import { clusterHtml, FOCUS_OFFSET_PX, FOCUS_ZOOM, groupMarkers, isInKorea, markerHtml, pinTitle } from '@/utils/map-markers'

// 해외 추억용 세계 지도 (Leaflet + OpenStreetMap 타일, 무료)
// 네이버 지도는 한국 밖으로 움직이지 못해서 해외 장소는 이 지도로 보여 준다.
// 받는 값과 동작은 naver-map.vue 와 같다: 핀·클러스터, 경로 선, 고른 장소로 이동, 핀 위에 붙는 카드(슬롯).
const props = defineProps<{
  markers: MapMarker[]
  highlightKeys: string[]
  routeEvent: EventItem | null
  focus: { latitude: number; longitude: number } | null
}>()

const emit = defineEmits<{ select: [marker: MapMarker]; mapClick: [] }>()

const FIT_MAX_ZOOM = 10 // 처음 화면: 동네가 아니라 "어느 나라·섬인지" 보이게 (발리 섬 전체 정도)

const container = ref<HTMLDivElement>()
const anchor = ref<HTMLDivElement>()

let map: L.Map | null = null
const markerLayer = L.layerGroup()
let route: L.Polyline | null = null

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const toLatLng = (m: { latitude: number; longitude: number }) => L.latLng(m.latitude, m.longitude)
// 처음 화면에 모두 들어오게 맞출 핀: 해외 핀 (없으면 전체)
const fitTargets = () => {
  const overseas = props.markers.filter((m) => !isInKorea(m.latitude, m.longitude))
  return (overseas.length ? overseas : props.markers).map(toLatLng)
}
const htmlIcon = (html: string) => L.divIcon({ html, className: '', iconSize: [0, 0] })

function renderMarkers() {
  if (!map) return
  markerLayer.clearLayers()
  const bounds = map.getBounds().pad(0.1)
  const visible = props.markers.filter((m) => bounds.contains(toLatLng(m)))

  for (const g of groupMarkers(visible, props.highlightKeys, (m) => map!.latLngToLayerPoint(toLatLng(m)))) {
    if (g.kind === 'pins') {
      for (const { marker: m, highlighted } of g.items) {
        L.marker(toLatLng(m), {
          icon: htmlIcon(markerHtml(m.events.length, highlighted)),
          title: pinTitle(m),
          zIndexOffset: highlighted ? 1000 : 0,
        })
          .on('click', () => emit('select', m))
          .addTo(markerLayer)
      }
      continue
    }
    L.marker(toLatLng(g.items[0]!), {
      icon: htmlIcon(clusterHtml(g.eventCount)),
      title: `장소 ${g.items.length}곳, 추억 ${g.eventCount}개`,
      zIndexOffset: 500,
    })
      .on('click', () => map!.fitBounds(L.latLngBounds(g.items.map(toLatLng)), { padding: [60, 60], maxZoom: 17 }))
      .addTo(markerLayer)
  }
}

function renderRoute() {
  if (!map) return
  route?.remove()
  route = null
  const places = props.routeEvent?.places ?? []
  if (places.length < 2) return
  route = L.polyline(places.map(toLatLng), {
    color: cssVar('--accent') || '#c7404f',
    weight: 4,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map)
}

// 핀이 화면 가운데보다 FOCUS_OFFSET_PX 아래에 오는 중심 좌표 (naver-map.vue 와 같은 규칙)
function focusView() {
  const focus = props.focus!
  const zoom = Math.max(map!.getZoom() || 0, FOCUS_ZOOM)
  const point = map!.project(toLatLng(focus), zoom).subtract([0, FOCUS_OFFSET_PX])
  return { center: map!.unproject(point, zoom), zoom }
}

function flyToFocus() {
  placeAnchor()
  if (!map || !props.focus) return
  const { center, zoom } = focusView()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.setView(center, zoom, { animate: false })
  else map.flyTo(center, zoom, { duration: 0.6 })
}

function fitAll() {
  if (!map || props.focus || !props.markers.length) return
  map.fitBounds(L.latLngBounds(fitTargets()), { padding: [60, 60], maxZoom: FIT_MAX_ZOOM })
}

function placeAnchor() {
  const el = anchor.value
  if (!el) return
  if (!map || !props.focus) {
    el.style.display = 'none'
    return
  }
  const p = map.latLngToContainerPoint(toLatLng(props.focus))
  el.style.display = ''
  el.style.transform = `translate(${p.x}px, ${p.y}px)`
}

onMounted(() => {
  if (!container.value) return
  map = L.map(container.value, { zoomControl: false, worldCopyJump: true, minZoom: 2 })
  map.attributionControl.setPrefix(false)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map)
  markerLayer.addTo(map)

  // 첫 화면: 고른 장소가 있으면 바로 그 자리, 없으면 해외 핀이 모두 보이게
  if (props.focus) {
    map.setView([props.focus.latitude, props.focus.longitude], FOCUS_ZOOM)
    const { center, zoom } = focusView()
    map.setView(center, zoom, { animate: false })
  } else if (props.markers.length) {
    map.fitBounds(L.latLngBounds(fitTargets()), { padding: [60, 60], maxZoom: FIT_MAX_ZOOM, animate: false })
  } else {
    map.setView([20, 120], 3)
  }

  map.on('moveend', renderMarkers)
  map.on('click', () => emit('mapClick'))
  // 끌기·확대 중에도 카드가 핀을 따라가게 한다. 손가락 확대(애니메이션) 중에는 잠시 숨긴다
  map.on('move zoom resize viewreset', placeAnchor)
  map.on('zoomanim', () => anchor.value && (anchor.value.style.visibility = 'hidden'))
  map.on('zoomend', () => {
    anchor.value && (anchor.value.style.visibility = '')
    placeAnchor()
  })

  renderMarkers()
  renderRoute()
  placeAnchor()
})

watch(() => props.markers, () => { fitAll(); renderMarkers() })
watch(() => props.highlightKeys, renderMarkers)
watch(() => props.routeEvent, renderRoute)
watch(() => props.focus, flyToFocus)

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="relative h-full w-full bg-surface-2">
    <!-- isolate: Leaflet 레이어(z-index 400~1000)가 카드·버튼 위로 올라오지 않게 가둔다 -->
    <div ref="container" class="isolate h-full w-full" />
    <div ref="anchor" class="pointer-events-none absolute left-0 top-0 z-10 will-change-transform" style="display: none">
      <div class="pointer-events-auto absolute bottom-[42px] left-0 -translate-x-1/2">
        <slot />
      </div>
    </div>
  </div>
</template>
