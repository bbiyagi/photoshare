import { test as teardown } from '@playwright/test'
import { cleanupE2E } from './support/db'

// 모든 테스트가 끝나면 테스트가 만든 [E2E] 추억과 사진 파일을 지운다
teardown('테스트 데이터 정리', async () => {
  const removed = await cleanupE2E()
  console.log(`E2E 정리: 추억 ${removed.events}개, 파일 ${removed.files}개 삭제`)
})
