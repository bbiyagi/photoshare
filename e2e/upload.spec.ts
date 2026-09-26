import { expect, test } from '@playwright/test'
import { cleanupE2E, findE2EEvent, fixture } from './support/db'
import { card } from './support/map'

// 사진 올리기: 장소 이름 없이 올리기, 위치 없는 사진은 지도에서 고르기,
// "지도에서 보기"로 방금 추억 열기, 같은 제목이면 기존 추억에 추가 제안
test.describe.configure({ mode: 'serial' })
test.afterAll(async () => {
  await cleanupE2E()
})

test('장소 이름 없이 올리고, 지도에서 방금 올린 추억이 바로 열린다', async ({ page }, testInfo) => {
  const title = `[E2E] 업로드 추억 ${testInfo.project.name}`
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles([fixture('gps-seoul.jpg'), fixture('no-gps.jpg')])
  await expect(page.getByText('사진 정보 읽는 중…')).toHaveCount(0)

  // 장소 이름 입력은 없다
  await expect(page.getByText('장소 이름')).toHaveCount(0)

  // 위치 정보가 없는 사진은 지도에서 고른다 (기본 위치: 대구)
  await page.getByRole('button', { name: '위치 고르기' }).click()
  const picker = page.getByRole('dialog', { name: '위치 고르기' })
  await expect(picker).toBeVisible()
  await page.waitForTimeout(1500) // 네이버 지도 타일이 뜰 때까지
  const box = (await picker.locator('div.relative.flex-1').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(picker.getByText(/고른 위치:/)).toBeVisible()
  await picker.getByRole('button', { name: '이 위치로 정하기' }).click()

  await expect(page.getByText('사진이 2곳에서 찍혔어요')).toBeVisible()
  await page.getByLabel('제목').fill(title)
  await page.getByRole('button', { name: '2장 올리기' }).click()
  await expect(page.getByText('2장을 올렸어요')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: '지도에서 보기' }).click()
  await expect(page).toHaveURL('/')
  await expect(card(page)).toContainText(title)
  await expect(card(page)).toContainText('2곳 중 1번째 장소')
})

test('같은 제목을 입력하면 기존 추억에 추가하도록 제안하고, 새 장소가 선으로 이어진다', async ({ page }, testInfo) => {
  const title = `[E2E] 업로드 추억 ${testInfo.project.name}`
  const existing = await findE2EEvent(title)
  expect(existing, '앞 테스트에서 만든 추억이 있어야 함').toBeTruthy()

  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles([fixture('gps-busan.jpg')])
  await expect(page.getByText('사진 정보 읽는 중…')).toHaveCount(0)

  // 띄어쓰기를 다르게 입력해도 같은 제목으로 본다
  await page.getByLabel('제목').fill(`[E2E]업로드추억${testInfo.project.name}`)
  await expect(page.getByText('같은 제목의 추억이 있어요. 여기에 추가할까요?')).toBeVisible()
  await page.getByRole('button', { name: '여기에 추가' }).click()
  await expect(page.locator('select')).toHaveValue(existing!.id)

  await page.getByRole('button', { name: '1장 올리기' }).click()
  await expect(page.getByText('1장을 올렸어요')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: '지도에서 보기' }).click()

  // 새 추억이 생기지 않고 장소가 3곳이 됐다
  await expect(card(page)).toContainText(title)
  await expect(card(page)).toContainText('3곳 중 1번째 장소')
  await page.locator('main').getByRole('button', { name: '다음 장소' }).click()
  await expect(card(page)).toContainText('3곳 중 2번째 장소')
  await page.locator('main').getByRole('button', { name: '다음 장소' }).click()
  await expect(card(page)).toContainText('3곳 중 3번째 장소')
})

test('제목이 다르면 제안하지 않는다', async ({ page }) => {
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles([fixture('gps-busan.jpg')])
  await page.getByLabel('제목').fill('[E2E] 전혀 다른 제목')
  await expect(page.getByText('같은 제목의 추억이 있어요')).toHaveCount(0)
})
