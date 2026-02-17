import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js', '**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                __dirname: 'readonly',
                URL: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
        },
    },
    {
        files: ['server.ts', 'lib/**/*.ts'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
            },
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                navigator: 'readonly',
                AudioContext: 'readonly',
                webkitAudioContext: 'readonly',
                io: 'readonly',
                fetch: 'readonly',
                caches: 'readonly',
                self: 'readonly',
                Response: 'readonly',
            },
        },
    },
    {
        ignores: ['node_modules/', 'dist/', 'public/sw.js'],
    },
];
