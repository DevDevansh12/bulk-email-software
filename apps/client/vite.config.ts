/**
 * Vite configuration.
 *
 * Key decisions:
 * - Path aliases (@/) match tsconfig paths so imports are clean and portable
 * - Proxy /api/* to the dev server — no CORS issues during development
 * - Source maps enabled in production for error tracking (Sentry, etc.)
 */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        // Same as the tsconfig path: use shared source directly so runtime helpers
        // (normalization, metrics, SSE parser) never come from a stale dist build
        '@saas/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },

    server: {
      port: 5173,
      // Proxy API calls to the backend — avoids CORS in development
      proxy: {
        '/api': {
        target: env['VITE_API_URL'] ?? 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true, // Required for production error tracking
      // Split vendor code for better cache utilization
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
