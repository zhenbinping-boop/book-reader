import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
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

export default defineConfig(async ({ mode }) => {
  const nativeBuild = mode === 'android' || mode === 'native'
  const plugins = [
    ...(await optionalReact()),
    VitePWA({
      disable: nativeBuild,
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: '栖读',
        short_name: '栖读',
        description: '本地导入 PDF、TXT、EPUB，离线阅读与标注',
        lang: 'zh-CN',
        // 全部用相对路径：manifest 在 /book-reader/manifest.webmanifest 时，
        // '.' 会解析成 /book-reader/，这样部署在子路径或根路径都成立。
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f0e3',
        theme_color: '#f6f0e3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // worker 是 .mjs；CMap / 字体也必须随安装缓存，才能离线首次打开 PDF。
        globPatterns: ['**/*.{js,mjs,css,html,png,webp,svg,woff2,bcmap,pfb,ttf}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // pdf.js 的 CMap / worker 会超过 workbox 默认 2MB 上限
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // 兼容旧版运行时缓存；当前版本的 CMap / 字体由预缓存覆盖。
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
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version) },
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
      outDir: nativeBuild ? 'dist-android' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
    },
  }
})
