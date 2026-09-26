import ExifReader from 'exifreader'
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

// EXIF 날짜 "2025:04:05 14:30:00" → 기기 시간대 기준 Date (사진을 찍은 현지 시각)
function parseExifDate(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const date = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)
  return Number.isNaN(date.getTime()) ? null : date
}

// 리사이징하면 EXIF 가 사라지므로 반드시 압축 전에 원본에서 읽는다.
// ExifReader 를 쓰는 이유: exifr 는 아이폰 HEIC 의 EXIF 를 읽지 못하는 경우가 있었다.
export async function readMeta(file: File): Promise<PhotoMeta> {
  try {
    const tags = await ExifReader.load(await file.arrayBuffer(), { expanded: true })
    const takenAt =
      parseExifDate(tags.exif?.DateTimeOriginal?.description) ?? parseExifDate(tags.exif?.DateTimeDigitized?.description)
    const lat = Number(tags.gps?.Latitude)
    const lng = Number(tags.gps?.Longitude)
    const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
    return { takenAt, latitude: hasGps ? lat : null, longitude: hasGps ? lng : null }
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

const isHeicFile = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)

// HEIC → JPEG 변환 결과. 미리보기에서 한 번 변환하면 업로드 때 다시 변환하지 않는다.
const convertedHeic = new WeakMap<File, Blob>()

// 사진을 그릴 수 있는 비트맵으로 연다.
// 대부분의 브라우저(Chrome·Edge·삼성 인터넷 등)는 아이폰 HEIC 를 읽지 못해서 JPEG 로 변환한다.
// 변환기(libheif, 약 3MB)는 HEIC 를 골랐을 때만 불러온다. Safari 처럼 직접 읽을 수 있으면 변환하지 않는다.
async function openImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    if (!isHeicFile(file)) throw new Error('사진을 읽지 못했어요. 파일이 손상됐을 수 있어요.')
  }
  let jpeg = convertedHeic.get(file)
  if (!jpeg) {
    try {
      const { heicTo } = await import('heic-to')
      jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
    } catch {
      throw new Error('HEIC 사진을 변환하지 못했어요. 사진 앱에서 JPG로 내보내 다시 올려 주세요.')
    }
    convertedHeic.set(file, jpeg)
  }
  return createImageBitmap(jpeg)
}

// 클라이언트에서 긴 변 2048px JPEG + 400px 썸네일로 줄인다 (HEIC 도 JPEG 로 저장된다)
export async function compressImage(file: File): Promise<{ main: Encoded; thumb: Encoded }> {
  const bitmap = await openImage(file)
  try {
    const main = await encodeJpeg(bitmap, MAX_SIDE)
    const thumb = await encodeJpeg(bitmap, THUMB_SIDE)
    if (main.blob.size > MAX_UPLOAD_BYTES) throw new Error('압축 후에도 10MB를 넘어요')
    return { main, thumb }
  } finally {
    bitmap.close()
  }
}

// 브라우저가 바로 못 보여 주는 사진(HEIC)의 미리보기 이미지 주소. 실패하면 null
export async function makePreviewUrl(file: File): Promise<string | null> {
  try {
    const bitmap = await openImage(file)
    try {
      return URL.createObjectURL((await encodeJpeg(bitmap, 240)).blob)
    } finally {
      bitmap.close()
    }
  } catch {
    return null
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
