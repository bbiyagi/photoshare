<script setup lang="ts">
import { PhArrowLeft } from '@phosphor-icons/vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

// 지도 외 화면의 상단바: 뒤로 가기 + 화면 제목
withDefaults(defineProps<{ title: string; back?: RouteLocationRaw; backLabel?: string }>(), {
  back: '/',
  backLabel: '지도로 돌아가기',
})
</script>

<template>
  <header class="sticky top-0 z-10 flex h-14 items-center gap-1 bg-bar px-2 text-on-bar shadow-soft">
    <RouterLink :to="back" class="press flex size-10 items-center justify-center rounded-full hover:bg-on-bar/10" :aria-label="backLabel">
      <PhArrowLeft :size="22" weight="bold" />
    </RouterLink>
    <h1 class="font-title text-lg">{{ title }}</h1>
  </header>
</template>
