import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') }

const productionCsp: Plugin = {
  name: 'ante-production-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace("connect-src 'self' ws:", "connect-src 'self'"),
}

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    build: {
      minify: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/preload/index.ts'),
          page: resolve(import.meta.dirname, 'src/preload/page.ts'),
          swipe: resolve(import.meta.dirname, 'src/preload/swipe.ts'),
          autofill: resolve(import.meta.dirname, 'src/preload/autofill.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), productionCsp],
    build: { minify: true },
  },
})
