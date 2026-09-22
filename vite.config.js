import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * @vitejs/plugin-react 是可选的：装了就有 React Fast Refresh，
 * 没装 Vite 内置的 esbuild 也能正确转换 .jsx，构建不受影响。
 */
async function optionalReact() {
  try {
    const mod = await import('@vitejs/plugin-react')
    return [mod.default()]
  } catch {
    return []
  }
}

export default defineConfig(async () => {
  const plugins = [
    ...(await optionalReact()),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: '阅读器',
        short_name: '阅读器',
        description: '导入 PDF 到手机，离线阅读',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f5f0',
        theme_color: '#f7f5f0',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // pdf.js 的 CMap / worker 会超过 workbox 默认 2MB 上限
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // cmaps 是按需拉取的，不进预缓存清单，但要能被离线缓存兜住
        runtimeCaching: [
          {
            urlPattern: /\/(cmaps|standard_fonts)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ]

  return {
    plugins,
    // 没有 plugin-react 时，esbuild 默认走 classic JSX（React.createElement），
    // 会直接报 "React is not defined"。显式指定 automatic runtime。
    esbuild: {
      jsx: 'automatic',
    },
    server: {
      host: true,
      port: 5173,
      // .tmp 里放的是无头浏览器的临时 profile，别让它触发 HMR
      watch: { ignored: ['**/.tmp/**', '**/dist/**', '**/samples/**'] },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
    },
  }
})
