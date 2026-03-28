import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    define: {
      // SEGURANÇA: Removemos a API_KEY daqui. Ela só deve ser acessada via '/api/gemini' (Backend).
      // Mantemos apenas variáveis públicas necessárias.
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
      
      // Fallback seguro para outras variáveis não sensíveis
      'process.env': JSON.stringify({
          NODE_ENV: mode,
          // Filtra chaves perigosas para não vazarem no bundle do cliente
          ...Object.fromEntries(
            Object.entries(env).filter(([key]) => 
              key.startsWith('NEXT_PUBLIC') || 
              key === 'NODE_ENV'
            )
          )
      })
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'framer-motion', 'date-fns'],
            genai: ['@google/genai'],
            icons: ['lucide-react']
          }
        }
      }
    }
  }
})
