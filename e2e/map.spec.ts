import { expect, test } from '@playwright/test'
import { cleanupE2E, seedEvent } from './support/db'
import { card, expectAnchoredAbovePin, openDrawer, tapMapAt, tapMarker } from './support/map'

// 지도: 핀 위 카드, 같은 추억 안 장소 넘기기, 이전·다음 추억, 상세 창, 여러 추억 마커 목록, 목록 메뉴
// 가장 오래된 날짜(2000년)로 만들어 "1번째 우리들의 추억" 번호가 항상 같게 한다
const A = '[E2E] 동성로 데이트'
const B = '[E2E] 수성못 산책'
const C = '[E2E] 수성못 야경'

test.beforeAll(async () => {
  await cleanupE2E()
  await seedEvent(A, '2000-01-01', [
    { name: '[E2E] 동성로 카페', latitude: 35.869, longitude: 128.596, photos: 2 },
    { name: '[E2E] 김광석 거리', latitude: 35.8601, longitude: 128.6069, photos: 1 },
  ])
  await seedEvent(B, '2000-01-02', [{ name: '[E2E] 수성못', latitude: 35.8283, longitude: 128.6179, photos: 1 }])
  await seedEvent(C, '2000-01-03', [{ name: '[E2E] 수성못', latitude: 35.8283, longitude: 128.6179, photos: 1 }])
})
test.afterAll(async () => {
  await cleanupE2E()
})

test('레퍼런스처럼 카드·목록이 핀 위에 붙고 장소·추억을 넘길 수 있다', async ({ page }) => {
  await page.goto('/')

  await test.step('목록 메뉴: 장소가 여러 곳인 추억을 펼쳐 2번째 장소로 이동', async () => {
    await openDrawer(page)
    await page.getByRole('button', { name: `${A} 장소 2곳 펼치기` }).click()
    await page.getByRole('dialog', { name: '우리들의 추억 목록' }).getByRole('button', { name: /\[E2E\] 김광석 거리/ }).click()
    await expect(card(page)).toContainText('1번째 우리들의 추억')
    await expect(card(page)).toContainText('[E2E] 김광석 거리 (2/2)')
    await expectAnchoredAbovePin(page, 'main article', '[E2E] 김광석 거리')
  })

  await test.step('카드 옆 ‹ 로 같은 추억의 이전 장소', async () => {
    await page.locator('main').getByRole('button', { name: '이전 장소' }).click()
    await expect(card(page)).toContainText('[E2E] 동성로 카페 (1/2)')
    await expectAnchoredAbovePin(page, 'main article', '[E2E] 동성로 카페')
    // 첫 번째 추억이라 "이전 추억" 버튼은 없고 "다음 추억"만 있다
    await expect(page.getByRole('button', { name: '이전 추억' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '다음 추억' })).toBeVisible()
  })

  await test.step('카드를 누르면 상세 창에서 사진을 넘겨 본다', async () => {
    await card(page).getByRole('button', { name: `${A} 자세히 보기` }).click()
    const detail = page.getByRole('dialog', { name: `${A} 자세히 보기` })
    await expect(detail).toContainText('사진 1/2')
    await detail.getByRole('button', { name: '다음 사진' }).click()
    await expect(detail).toContainText('사진 2/2')
    await page.keyboard.press('Escape')
    await expect(detail).toHaveCount(0)
    await expect(card(page)).toBeVisible() // 카드는 그대로
  })

  await test.step('화면 끝 → 로 다음 추억', async () => {
    await page.getByRole('button', { name: '다음 추억' }).click()
    await expect(card(page)).toContainText(B)
    await expect(card(page)).toContainText('2번째 우리들의 추억')
    await expectAnchoredAbovePin(page, 'main article', '[E2E] 수성못')
  })

  await test.step('추억이 2개인 마커를 누르면 핀 위에 목록이 뜨고, 고르면 카드로 바뀐다', async () => {
    await card(page).getByRole('button', { name: '닫기' }).click()
    await expect(card(page)).toHaveCount(0)
    await tapMarker(page, '[E2E] 수성못, 추억 2개')
    await expect(page.locator('main section')).toContainText('[E2E] 수성못')
    await expectAnchoredAbovePin(page, 'main section', '[E2E] 수성못, 추억 2개')
    await page.locator('main section').getByRole('button', { name: new RegExp(C.replace(/[[\]]/g, '\\$&')) }).click()
    await expect(card(page)).toContainText(C)
  })

  await test.step('지도를 끌어도 카드가 핀을 따라간다', async () => {
    const before = (await card(page).boundingBox())!
    const main = (await page.locator('main').boundingBox())!
    const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
    const from = { x: main.x + main.width - 30, y: main.y + main.height - 60 }
    if (isTouch) {
      // 한 손가락 드래그 (CDP 터치 이벤트)
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: string, x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
      await touch('touchStart', from.x, from.y)
      for (let i = 1; i <= 8; i++) await touch('touchMove', from.x - i * 10, from.y - i * 5)
      await touch('touchEnd', 0, 0)
    } else {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x - 80, from.y - 40, { steps: 8 })
      await page.mouse.up()
    }
    await expect.poll(async () => Math.round((await card(page).boundingBox())!.x - before.x)).toBeLessThan(-40)
    await expectAnchoredAbovePin(page, 'main article', '[E2E] 수성못')
  })

  await test.step('지도의 빈 곳을 누르면 카드가 닫힌다', async () => {
    const main = (await page.locator('main').boundingBox())!
    await tapMapAt(page, main.x + 20, main.y + 40)
    await expect(card(page)).toHaveCount(0)
  })
})
