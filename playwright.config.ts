import { defineConfig, devices } from '@playwright/test'

// Supabase URL/키(.env)와 테스트 계정(.env.test)을 읽는다
process.loadEnvFile('.env')
process.loadEnvFile('.env.test')

const BASE_URL = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // 같은 테스트 계정·DB 를 쓰므로 한 번에 하나씩 실행한다 (모바일 → 데스크톱 순)
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    // 버튼 등을 못 찾으면 테스트 제한시간(60초)까지 기다리지 않고 15초 만에 실패시킨다
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // 로그인을 한 번만 해서 세션(storageState)을 저장하고, 끝나면 테스트 데이터를 지운다
    { name: 'setup', testMatch: /global\.setup\.ts/, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: /global\.teardown\.ts/ },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        storageState: 'e2e/.auth/state.json',
      },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, storageState: 'e2e/.auth/state.json' },
    },
  ],
  // 이미 npm run dev 가 켜져 있으면 그대로 쓰고, 없으면 켠다
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
