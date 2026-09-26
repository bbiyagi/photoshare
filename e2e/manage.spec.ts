import { expect, test } from '@playwright/test'
import { cleanupE2E, db, findE2EEvent, listFiles, seedEvent } from './support/db'

// 사진 모아 보기에서 수정·삭제: 이벤트 수정, 장소 이름 붙이기, 대표사진 변경,
// 대표사진 삭제 시 자동 재지정, 마지막 사진 삭제 시 장소 정리, 이벤트 삭제 시 파일까지 삭제
test.afterAll(async () => {
  await cleanupE2E()
})

test('추억·장소 수정과 사진·추억 삭제', async ({ page }, testInfo) => {
  const title = `[E2E] 관리 ${testInfo.project.name}`
  const { eventId, photoIds } = await seedEvent(title, '2000-02-01', [
    { name: '[E2E] 첫 장소', latitude: 35.869, longitude: 128.596, photos: 2 },
    { name: '장소', latitude: 35.8601, longitude: 128.6069, photos: 1 }, // 이름 없는 장소
  ])
  const { client } = await db()
  page.on('dialog', (d) => d.accept()) // 삭제 확인창은 모두 승인

  await page.goto(`/events/${eventId}/photos`)
  const headings = page.locator('main h3')
  await expect(headings).toHaveCount(2)

  await test.step('추억 제목·날짜 수정', async () => {
    await page.getByRole('button', { name: '이벤트 수정' }).click()
    await page.getByLabel('제목').fill(`${title} 수정됨`)
    await page.getByLabel('날짜').fill('2000-02-02')
    await page.getByRole('button', { name: '저장' }).click()
    await expect(page.locator('main h2')).toHaveText(`${title} 수정됨`)
    const { data } = await client.from('events').select('event_date').eq('id', eventId).single()
    expect(data?.event_date).toBe('2000-02-02')
  })

  await test.step('이름 없는 장소는 번호로 보이고, 이름을 붙이거나 비울 수 있다', async () => {
    await expect(headings.nth(1)).toContainText('2번째 장소')
    await headings.nth(1).getByRole('button', { name: '이름 붙이기' }).click()
    await page.getByLabel('2번째 장소 이름').fill('[E2E] 둘째 장소')
    await page.getByRole('button', { name: '저장' }).click()
    await expect(headings.nth(1)).toContainText('[E2E] 둘째 장소')

    await headings.nth(1).getByRole('button', { name: '이름 수정' }).click()
    await page.getByLabel('2번째 장소 이름').fill('')
    await page.getByRole('button', { name: '저장' }).click()
    await expect(headings.nth(1)).toContainText('2번째 장소')
  })

  const thumbs = page.locator('main ul button')
  const viewer = page.getByRole('dialog', { name: '사진 크게 보기' })

  await test.step('두 번째 사진을 대표사진으로', async () => {
    await thumbs.nth(1).click()
    await viewer.getByRole('button', { name: '대표사진으로' }).click()
    await expect(viewer.getByText('대표사진', { exact: true })).toBeVisible()
    const { data } = await client.from('events').select('cover_photo_id').eq('id', eventId).single()
    expect(data?.cover_photo_id).toBe(photoIds[1])
  })

  await test.step('대표사진을 지우면 남은 사진이 대표가 된다', async () => {
    await viewer.getByRole('button', { name: '삭제' }).click()
    await expect(viewer).toContainText('/ 2')
    await expect
      .poll(async () => (await client.from('events').select('cover_photo_id').eq('id', eventId).single()).data?.cover_photo_id)
      .toBe(photoIds[0])
    await page.keyboard.press('Escape')
  })

  await test.step('장소의 마지막 사진을 지우면 장소도 정리된다', async () => {
    await thumbs.nth(1).click() // 이제 두 번째 칸 = 2번째 장소의 사진
    await viewer.getByRole('button', { name: '삭제' }).click()
    await expect(viewer).toContainText('1 / 1')
    await page.keyboard.press('Escape')
    await expect(headings).toHaveCount(1)
  })

  await test.step('추억을 지우면 지도로 가고, 행과 파일이 모두 지워진다', async () => {
    await page.getByRole('button', { name: '이 이벤트 삭제' }).click()
    await expect(page).toHaveURL('/')
    expect(await findE2EEvent(`${title} 수정됨`)).toBeNull()
    expect(await listFiles(eventId)).toEqual([])
  })
})
