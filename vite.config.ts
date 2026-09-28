import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // 휴대폰 홈 화면 설치(PWA). 새 버전을 배포하면 설치된 앱도 자동으로 바뀐다.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: '보충만의 추억',
        short_name: '보충만의 추억',
        description: '우리 둘만의 지도',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#6b5b95',
        background_color: '#f6f5fa',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 정적 파일(HTML·JS·CSS·아이콘)만 미리 저장한다.
        // 글꼴 조각(100여 개)과 2MB 넘는 HEIC 변환기는 설치 때 받지 않고 필요할 때 받는다.
        // Supabase(데이터·사진)와 네이버 지도·OpenStreetMap 요청은 저장하지 않고 항상 네트워크로 받는다
        // (네이버 지도 약관의 저장·캐싱 금지, 사진은 비공개 서명 URL).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['**/heic-to-*.js'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          { urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'), handler: 'NetworkOnly' },
          { urlPattern: ({ url }) => /(^|\.)(naver\.com|pstatic\.net|navercorp\.com)$/.test(url.hostname), handler: 'NetworkOnly' },
          { urlPattern: ({ url }) => url.hostname.endsWith('openstreetmap.org'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
