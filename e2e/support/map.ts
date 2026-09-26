import { expect, type Page } from '@playwright/test'

// 네이버 지도 마커는 title 속성을 가진 요소 안의 div 다.
// 실제 사용처럼 휴대폰(터치 기기)은 손가락 탭, 데스크톱은 마우스 클릭으로 누른다.
// (좌표 없는 가짜 마우스 이벤트를 보내면 네이버 지도가 드래그 시작으로 받아들여 이후 탭에서 지도가 끌려간다)
export async function tapMarker(page: Page, titleStart: string) {
  const pin = page.locator(`[title^="${titleStart}"] div[style*=cursor]`).first()
  await expect(pin, `마커 "${titleStart}" 를 찾지 못함`).toBeVisible()
  const box = (await pin.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  if (isTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

// 지도의 빈 곳 누르기 (터치 기기는 탭)
export async function tapMapAt(page: Page, x: number, y: number) {
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  if (isTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

// 카드(또는 목록)가 해당 핀 바로 위 가운데에 붙어 있는지: 가로 차이와 세로 간격(px)
export async function overlayVsPin(page: Page, overlaySelector: string, pinTitleStart: string) {
  return page.evaluate(
    ([sel, start]) => {
      const box = document.querySelector(sel)
      const pin = [...document.querySelectorAll('[title]')].find((e) => e.getAttribute('title')!.startsWith(start))
      const pinBody = pin?.querySelector('div[style*=cursor]')
      if (!box || !pinBody) return null
      const a = box.getBoundingClientRect()
      const b = pinBody.getBoundingClientRect()
      return { dx: Math.round(a.left + a.width / 2 - (b.left + b.width / 2)), gap: Math.round(b.top - a.bottom) }
    },
    [overlaySelector, pinTitleStart] as const,
  )
}

export async function expectAnchoredAbovePin(page: Page, overlaySelector: string, pinTitleStart: string) {
  // 지도가 부드럽게 이동하는 동안(0.5초)은 위치가 바뀌므로 자리 잡을 때까지 기다린다
  await expect
    .poll(async () => {
      const r = await overlayVsPin(page, overlaySelector, pinTitleStart)
      return !!r && Math.abs(r.dx) <= 3 && r.gap >= 0 && r.gap <= 20
    }, { message: `${overlaySelector} 가 "${pinTitleStart}" 핀 위에 붙어 있어야 함` })
    .toBe(true)
}

export async function openDrawer(page: Page) {
  await page.getByRole('button', { name: '추억 목록 열기' }).click()
  await expect(page.getByRole('dialog', { name: '우리들의 추억 목록' })).toBeVisible()
}

// 지도 위 추억 카드 (상세 창의 article 과 구분하려고 main 안에서 찾는다)
export const card = (page: Page) => page.locator('main article')
