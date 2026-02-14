import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['__tests__/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['lib/**', 'server.js'],
        },
    },
});
