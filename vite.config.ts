import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './server/api.ts';

function candleApi(): Plugin {
  return {
    name: 'piprewind-candle-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), candleApi()],
  server: { port: Number(process.env.PORT) || 5187 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
