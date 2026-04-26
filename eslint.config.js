import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', '*.min.css'],
    },
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'off',
        },
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                io: 'readonly',
            },
        },
    },
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['__tests__/**/*.js', 'vitest.config.js', 'playwright.config.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...globals.mocha,
                ...globals.browser,
            },
        },
    },
    {
        files: ['**/*.d.ts'],
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
    {
        files: ['lib/sanitize.ts'],
        rules: {
            'no-control-regex': 'off',
        },
    },
];
