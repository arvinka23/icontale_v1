import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',

      // Measure the shared library surface. server.ts is intentionally
      // excluded because it starts a listener on import; its behaviour
      // is exercised through the integration and e2e tests instead.
      include: ['lib/**'],
      exclude: [
        'lib/types.ts', // pure type declarations, no executable code
      ],

      reporter: ['text', 'html', 'lcov'],

      // Thresholds below are set just above the current floor so any
      // regression fails CI without forcing a one-off blanket hike on
      // existing gaps. Ratchet them up as coverage improves.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 85,
        branches: 70,
      },
    },
  },
});
