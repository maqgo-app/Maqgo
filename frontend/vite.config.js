import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { normalizeBackendBase } from './src/utils/apiNormalize.js'
import react from '@vitejs/plugin-react'
import * as esbuild from 'esbuild'
import { E2E_PREVIEW_HOST, E2E_PREVIEW_PORT } from './scripts/e2ePreviewConstants.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin: transform JSX in .js files during load so Rollup can parse them
function jsxInJs() {
  return {
    name: 'jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.includes('src/') || !/\.js$/.test(id) || id.includes('node_modules')) return null
      if (!code.includes('<') || !code.includes('>')) return null
      try {
        const result = await esbuild.transform(code, {
          loader: 'jsx',
          jsx: 'automatic',
          format: 'esm',
        })
        return { code: result.code }
      } catch {
        return null
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Normalizado (sin `/api` final) para no generar `/api/api/...` en el bundle. */
  const backendUrl = normalizeBackendBase(env.REACT_APP_BACKEND_URL || env.VITE_BACKEND_URL || '')
  /** Solo para proxy del dev server (no se embebe en el bundle como sustituto de REACT_APP_BACKEND_URL) */
  const proxyTarget = backendUrl || 'http://localhost:8000'
  const backendIsLocal = String(backendUrl).includes('localhost')
  const prodLike = mode === 'production' && !backendIsLocal
  /** Debe ser string 'true' | 'false' — el código compara === 'true' (p. ej. CardPaymentScreen). */
  const viteIsProduction =
    env.VITE_IS_PRODUCTION === 'true'
      ? true
      : env.VITE_IS_PRODUCTION === 'false'
        ? false
        : prodLike
  const viteMaqgoEnv =
    (env.VITE_MAQGO_ENV && String(env.VITE_MAQGO_ENV).trim()) ||
    (prodLike ? 'production' : 'development')
  const viteEnableDemoMode = env.VITE_ENABLE_DEMO_MODE === 'true'
  if (mode === 'production' && viteEnableDemoMode) {
    throw new Error(
      '[MAQGO] Build producción bloqueado: VITE_ENABLE_DEMO_MODE=true. Desactívalo en el entorno de build (Vercel/Railway).'
    )
  }
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    plugins: [jsxInJs(), react()],
    test: {
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
      exclude: ['qa-artifacts/**', 'node_modules/**', 'dist/**'],
    },
    define: {
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_IS_PRODUCTION': JSON.stringify(viteIsProduction ? 'true' : 'false'),
      'import.meta.env.VITE_MAQGO_ENV': JSON.stringify(viteMaqgoEnv),
      'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify(viteEnableDemoMode ? 'true' : 'false'),
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: { '.js': 'jsx' },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      open: '/',  // Abre la primera pantalla (Welcome) al iniciar
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: E2E_PREVIEW_PORT,
      strictPort: true,
      host: E2E_PREVIEW_HOST,
    },
  }
})
