import { expect, test as setup } from '@playwright/test'
import { cleanupE2E } from './support/db'

// 1) 지난 실행에서 남은 [E2E] 데이터를 지우고 2) 테스트 계정으로 한 번 로그인해 세션을 저장한다
setup('로그인 세션 저장', async ({ page }) => {
  await cleanupE2E()

  await page.goto('/login')
  await page.getByLabel('이메일').fill(process.env.E2E_EMAIL!)
  await page.getByLabel('비밀번호').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL('/')
  await page.context().storageState({ path: 'e2e/.auth/state.json' })
})
