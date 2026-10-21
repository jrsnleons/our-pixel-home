import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: '/',
        lang: 'en',
        dir: 'ltr',
        name: 'Our Pixel Home',
        short_name: 'Pixel Home',
        description: 'A cozy pixel apartment for two, wherever you are.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        categories: ['games', 'lifestyle', 'social'],
        launch_handler: { client_mode: 'focus-existing' },
        orientation: 'portrait',
        background_color: '#1E140D',
        theme_color: '#1E140D',
        prefer_related_applications: false,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // iPhones fetch their start-up picture themselves when the app is added; no need to keep eleven.
        globIgnores: ['splash/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        // Bible text is never kept (see src/net/passage.ts); it always comes fresh from the network.
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: {
      // Same shape as the Vercel function in api/passage.ts, for local development.
      '/api/passage': {
        target: 'https://bolls.life',
        changeOrigin: true,
        rewrite: (path) => {
          const u = new URL(path, 'http://x');
          return `/get-text/ESV/${u.searchParams.get('book')}/${u.searchParams.get('chapter')}/`;
        },
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
