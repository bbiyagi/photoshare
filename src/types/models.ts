// supabase/migrations/001_init.sql 과 맞춘 앱 모델

export interface Place {
  id: string
  eventId: string
  name: string // 화면용 (이름이 없으면 "N번째 장소")
  named: boolean // 직접 붙인 이름인지
  latitude: number
  longitude: number
  visitOrder: number
  photoCount: number
  coverUrl: string | null // 이 장소의 대표 썸네일 (카드에 표시)
}

export interface EventItem {
  id: string
  title: string
  description: string | null
  eventDate: string // YYYY-MM-DD
  coverPhotoId: string | null
  coverUrl: string | null // 대표사진 썸네일 signed URL (비공개 버킷)
  photoCount: number
  places: Place[]
}

// 지도에서 좌표가 거의 같은 장소들을 하나로 묶은 마커
// (한 장소에 여러 이벤트가 있는 경우 events.length > 1)
export interface MapMarker {
  key: string
  latitude: number
  longitude: number
  placeName: string
  events: EventItem[]
}
