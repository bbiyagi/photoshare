import { expect, test } from '@playwright/test'
import { openDrawer } from './support/map'

// 로그인 흐름은 저장된 세션 없이 확인한다
test.use({ storageState: { cookies: [], origins: [] } })

test('로그인하지 않으면 로그인 화면으로 보낸다', async ({ page }) => {
  await page.goto('/upload')
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)upload$/)
  await expect(page.getByText('보충만의 추억')).toBeVisible()
})

test('비밀번호가 틀리면 안내한다', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('이메일').fill(process.env.E2E_EMAIL!)
  await page.getByLabel('비밀번호').fill('wrong-password')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toHaveText('이메일 또는 비밀번호가 맞지 않아요.')
  await expect(page).toHaveURL(/\/login/)
})

test('로그인하면 원래 가려던 곳으로 가고, 로그아웃하면 로그인 화면으로 간다', async ({ page }) => {
  await page.goto('/upload')
  await page.getByLabel('이메일').fill(process.env.E2E_EMAIL!)
  await page.getByLabel('비밀번호').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL('/upload')

  await page.goto('/')
  await openDrawer(page)
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page).toHaveURL('/login')
})
