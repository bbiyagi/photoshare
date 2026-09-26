import type { MapMarker } from '@/types/models'

// 국내(네이버 지도)와 해외(세계 지도)가 함께 쓰는 핀 모양과 묶기 규칙

export const CLUSTER_PX = 48 // 화면에서 이만큼 가까운 핀은 하나로 묶는다
export const FOCUS_ZOOM = 16 // 장소를 고르면 이 정도(동네 골목)까지 확대
export const FOCUS_OFFSET_PX = 110 // 핀을 화면 가운데보다 이만큼 아래에 둬서 위쪽 카드가 화면 안에 들어오게

// 네이버 지도가 보여 줄 수 있는 범위(한국). 이 밖의 장소는 세계 지도에서 보여 준다
export const isInKorea = (lat: number, lng: number) => lat >= 32.1 && lat <= 38.6 && lng >= 124.3 && lng <= 132.0

const BADGE_STYLE =
  'position:absolute;border-radius:9999px;background:var(--accent);color:var(--on-accent);text-align:center;box-shadow:0 2px 6px rgb(var(--shadow) / .3);font-family:var(--font-sans);font-weight:700'

// 핀: 기본은 보라, 강조는 포인트 색. 한 장소에 추억이 여러 개면 숫자 배지를 단다
// (좌표 지점이 요소의 왼쪽 위라고 보고, 핀 끝이 그 지점에 오도록 옮겨 그린다)
export function markerHtml(count: number, highlighted: boolean) {
  const color = highlighted ? 'var(--accent)' : 'var(--brand)'
  const badge =
    count > 1
      ? `<span style="${BADGE_STYLE};top:-10px;right:-12px;min-width:20px;height:20px;padding:0 6px;font-size:12px;line-height:20px">${count}</span>`
      : ''
  return `<div style="position:relative;width:30px;height:30px;transform:translate(-50%,-100%);cursor:pointer">
    <span style="position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 3px 8px rgb(var(--shadow) / .35)"></span>
    <span style="position:absolute;left:10px;top:9px;width:10px;height:10px;border-radius:9999px;background:#fff"></span>
    ${badge}
  </div>`
}

// 클러스터: 반투명 보라 원 + 추억 개수 배지
export function clusterHtml(eventCount: number) {
  const size = eventCount >= 20 ? 60 : eventCount >= 5 ? 52 : 44
  return `<div style="position:relative;width:${size}px;height:${size}px;transform:translate(-50%,-50%);cursor:pointer">
    <span style="position:absolute;inset:0;border-radius:9999px;background:var(--brand-mid);opacity:.88;border:3px solid #fff;box-shadow:0 4px 12px rgb(var(--shadow) / .3)"></span>
    <span style="position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:9999px;background:#fff"></span>
    <span style="${BADGE_STYLE};top:-8px;right:-10px;min-width:24px;height:24px;padding:0 7px;font-size:13px;line-height:24px">${eventCount}</span>
  </div>`
}

export type MarkerGroup =
  | { kind: 'pins'; items: { marker: MapMarker; highlighted: boolean }[] }
  | { kind: 'cluster'; items: MapMarker[]; eventCount: number }

// 화면 좌표 기준으로 가까운 핀을 묶는다 (단순 그리디 그리드).
// 강조된 핀이 들어 있는 묶음은 클러스터에 묻히지 않게 핀으로 따로 그린다.
export function groupMarkers(markers: MapMarker[], highlightKeys: string[], toPixel: (m: MapMarker) => { x: number; y: number }) {
  const groups: { x: number; y: number; items: MapMarker[] }[] = []
  for (const m of markers) {
    const p = toPixel(m)
    const near = groups.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < CLUSTER_PX)
    if (near) near.items.push(m)
    else groups.push({ x: p.x, y: p.y, items: [m] })
  }

  return groups.map<MarkerGroup>((g) => {
    const highlightedInGroup = g.items.some((m) => highlightKeys.includes(m.key))
    if (g.items.length === 1 || highlightedInGroup) {
      const pins = highlightedInGroup ? g.items : [g.items[0]!]
      return { kind: 'pins', items: pins.map((marker) => ({ marker, highlighted: highlightKeys.includes(marker.key) })) }
    }
    return { kind: 'cluster', items: g.items, eventCount: new Set(g.items.flatMap((m) => m.events.map((e) => e.id))).size }
  })
}

export const pinTitle = (m: MapMarker) => `${m.placeName || '장소'}, 추억 ${m.events.length}개`
