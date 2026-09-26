<script setup lang="ts">
import { PhGlobeHemisphereEast, PhWifiSlash } from '@phosphor-icons/vue'

// 세계 지도 코드를 처음 받아오는 동안(loading) / 받지 못했을 때(error) 지도 자리에 보여 준다
defineProps<{ kind: 'loading' | 'error' }>()
defineOptions({ inheritAttrs: false }) // 지도에 넘기던 값(markers 등)이 속성으로 붙지 않게

const reload = () => window.location.reload()
</script>

<template>
  <div class="flex h-full w-full items-center justify-center bg-surface-2 p-6">
    <p
      v-if="kind === 'loading'"
      class="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm text-muted shadow-soft"
      role="status"
    >
      <PhGlobeHemisphereEast :size="18" weight="bold" class="animate-pulse text-brand" /> 세계 지도를 여는 중…
    </p>
    <div v-else class="max-w-xs rounded-2xl bg-surface p-5 text-center shadow-soft" role="alert">
      <PhWifiSlash :size="28" weight="bold" class="mx-auto mb-2 text-brand" />
      <p class="font-semibold">세계 지도를 열지 못했어요</p>
      <p class="mb-4 mt-1 text-sm text-muted">인터넷 연결을 확인하고 다시 시도해 주세요.</p>
      <!-- 한 번 실패한 코드는 브라우저가 기억해서, 페이지를 새로 불러와야 다시 받을 수 있다 -->
      <button type="button" class="press btn-primary" @click="reload">다시 시도</button>
    </div>
  </div>
</template>
