// 네이버 지도 JS API v3 스크립트를 한 번만 불러온다.
// 신규 콘솔 키는 ncpKeyId 파라미터를 쓴다 (예전 ncpClientId 로는 인증 실패).
// 인증은 콘솔의 Web 서비스 URL 기준이므로, 새 도메인에 배포하면 콘솔에 먼저 등록해야 한다.

declare global {
  interface Window {
    navermap_authFailure?: () => void
  }
}

let loading: Promise<typeof naver.maps> | null = null

export function loadNaverMaps(): Promise<typeof naver.maps> {
  if (loading) return loading

  const keyId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID
  if (!keyId) return Promise.reject(new Error('VITE_NAVER_MAP_CLIENT_ID 가 .env 에 없습니다.'))

  loading = new Promise((resolve, reject) => {
    window.navermap_authFailure = () =>
      reject(new Error('네이버 지도 인증에 실패했어요. 콘솔의 Web 서비스 URL에 현재 주소가 등록되어 있는지 확인하세요.'))

    const script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(keyId)}`
    script.async = true
    script.onload = () => resolve(window.naver.maps)
    script.onerror = () => {
      loading = null // 네트워크 오류는 다시 시도할 수 있게
      reject(new Error('네이버 지도 스크립트를 불러오지 못했어요. 네트워크를 확인하세요.'))
    }
    document.head.appendChild(script)
  })
  return loading
}
