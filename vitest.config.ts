import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, './__tests__/planner/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    testTimeout: 15000,
    // Sylf Native runs its own Vitest suites from native/.
    exclude: [...configDefaults.exclude, 'native/**', 'scripts/**', 'documentation/**', 'scratch/**'],
  },
});
