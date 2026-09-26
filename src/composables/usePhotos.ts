import exifr from 'exifr'
import { PHOTO_BUCKET } from '@/composables/useEvents'
import { useSupabase } from '@/composables/useSupabase'

export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024 // 선택 가능한 원본 최대 크기
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 버킷 file_size_limit 과 같게 유지
const MAX_SIDE = 2048
const THUMB_SIDE = 400
const JPEG_QUALITY = 0.85

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i

export interface PhotoMeta {
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
}

// Windows 등에서는 HEIC 의 file.type 이 비어 있을 수 있어 확장자도 본다
export function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.test(file.name)) {
    return '지원하지 않는 파일 형식이에요 (jpg, png, webp, heic만 가능)'
  }
  if (file.size > MAX_ORIGINAL_BYTES) return '사진 한 장은 20MB까지 올릴 수 있어요'
  return null
}

// 리사이징하면 EXIF 가 사라지므로 반드시 압축 전에 원본에서 읽는다
export async function readMeta(file: File): Promise<PhotoMeta> {
  try {
    const exif = await exifr.parse(file, { tiff: true, exif: true, gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
    const takenAt = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null
    const lat = Number(exif?.latitude)
    const lng = Number(exif?.longitude)
    const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
    return {
      takenAt: takenAt instanceof Date && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
      latitude: hasGps ? lat : null,
      longitude: hasGps ? lng : null,
    }
  } catch {
    return { takenAt: null, latitude: null, longitude: null } // EXIF 없음/손상 → 수동 입력
  }
}

interface Encoded {
  blob: Blob
  width: number
  height: number
}

async function encodeJpeg(bitmap: ImageBitmap, maxSide: number): Promise<Encoded> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('이미지를 변환하지 못했어요')
  return { blob, width, height }
}

// 클라이언트에서 긴 변 2048px JPEG + 400px 썸네일로 줄인다.
// 브라우저가 디코딩하지 못하는 형식(예: Chrome 의 HEIC)은 원본을 그대로 올리고 썸네일은 생략한다.
export async function compressImage(file: File): Promise<{ main: Encoded; thumb: Encoded | null; original: boolean }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('이 형식은 브라우저에서 줄일 수 없어 10MB 이하만 올릴 수 있어요')
    return { main: { blob: file, width: 0, height: 0 }, thumb: null, original: true }
  }
  try {
    const main = await encodeJpeg(bitmap, MAX_SIDE)
    const thumb = await encodeJpeg(bitmap, THUMB_SIDE)
    if (main.blob.size > MAX_UPLOAD_BYTES) throw new Error('압축 후에도 10MB를 넘어요')
    return { main, thumb, original: false }
  } finally {
    bitmap.close()
  }
}

// supabase-js 의 upload 는 진행률을 주지 않아 Storage REST 를 XHR 로 직접 호출한다
export async function uploadWithProgress(path: string, blob: Blob, onProgress: (ratio: number) => void): Promise<void> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = xhr.responseText
      try {
        message = JSON.parse(xhr.responseText).message ?? message
      } catch {
        /* 본문이 JSON 이 아니면 그대로 쓴다 */
      }
      reject(new Error(xhr.status === 413 ? '파일이 너무 커요 (최대 10MB)' : `업로드 실패 (${xhr.status}: ${message})`))
    }
    xhr.onerror = () => reject(new Error('네트워크 오류로 업로드하지 못했어요'))
    xhr.send(blob)
  })
}

export async function removeFiles(paths: string[]) {
  if (paths.length) await useSupabase().storage.from(PHOTO_BUCKET).remove(paths)
}

// 두 좌표 사이 거리(m)
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}
