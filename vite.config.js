import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path'; // path 모듈 임포트 (Node.js 22+ 권장)


export default defineConfig({
  // Relative asset paths keep the app working under /<repository-name>/ on GitHub Pages.
  base: './',
  root: '.',
  publicDir: 'public',
  
  // 🔥 Node.js 호환성 문제 (process, util.debuglog 등) 완전 방지
  define: {
    'process.env': {},
    'process.versions': { node: '18.0.0' },
    // 'util' 모듈은 resolve.alias를 통해 더 강력하게 대체합니다.
    // define은 전역 변수나 속성 대체에 더 적합합니다.
    global: 'window',
  },

  // Node.js 내장 모듈을 브라우저 호환 버전으로 대체
  resolve: {
    alias: {
      // 'util' 모듈은 index.html에서 전역적으로 폴리필되므로 여기서 제거
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      // Node.js 내장 모듈 외부화 관련 경고 무시 (jsdom/undici 등에서 발생)
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_EXTERNAL_EXTERNALIZED' && warning.message.includes('node:')) {
          return;
        }
        warn(warning); // 그 외 경고는 정상적으로 출력
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/dexie')) return 'dexie';
          // cropperjs와 jscanify는 더 이상 번들되지 않으므로 관련 청크 분리 설정은 제거합니다.
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // main.js registers the worker so it can activate an update immediately.
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Moji - 일본 간판 수집 도감',
        short_name: 'Moji',
        description: '일본 현지 간판의 글자를 수집하고 나만의 도감을 만드는 앱',
        theme_color: '#f4efe4',
        background_color: '#f4efe4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // PWA 캐시 제한을 50MB로 늘려 대형 청크도 캐시될 수 있도록 합니다.
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    port: 3000,
    open: true,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
