import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import * as esbuild from 'esbuild'

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
  const backendUrl = env.REACT_APP_BACKEND_URL || env.VITE_BACKEND_URL || 'http://localhost:8000'
  const isProduction = mode === 'production' && !backendUrl.includes('localhost')
  return {
    plugins: [jsxInJs(), react()],
    define: {
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_IS_PRODUCTION': JSON.stringify(isProduction),
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
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
