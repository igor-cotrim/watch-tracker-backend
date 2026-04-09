import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/db/schema.ts',
        'src/db/index.ts',  // mocked in all tests; real DB not available in CI
        'src/index.ts',     // thin entry point, just calls app.listen()
        'src/config/env.ts', // process.exit() path can't run in tests
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
