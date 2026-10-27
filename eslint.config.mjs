/**
 * ESLint flat config (ESLint 9+).
 *
 * WHY flat config over .eslintrc:
 * - Explicit — each config object says exactly which files it applies to
 * - No implicit config file merging, no "extends hell"
 * - Better performance (no glob resolution at runtime)
 *
 * Rule philosophy:
 * - Prefer `error` for things that will cause bugs
 * - Prefer `warn` for things that are code smells but not always wrong
 * - Prefer `off` for rules that Prettier handles (formatting)
 */
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.js',       // Compiled output
      '**/*.d.ts',     // Type declaration files
    ],
  },

  // ── Base TypeScript rules (all .ts and .tsx) ──────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './tsconfig.base.json',
          './apps/server/tsconfig.json',
          './apps/client/tsconfig.json',
          './packages/shared/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
    },
    rules: {
      // ── TypeScript strict rules ─────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // ── Import hygiene ──────────────────────────────────────────────────
      'import/no-duplicates': 'error',
      'import/no-cycle': 'error', // Prevents circular dependency bugs
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // ── General code quality ─────────────────────────────────────────────
      'no-console': 'warn', // Use logger, not console
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // ── Tests (node:test) ────────────────────────────────────────────────────
  // describe()/it() return promises that the node:test runner itself awaits.
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },

  // ── Prettier must be last — disables formatting rules ESLint shouldn't own ─
  prettierConfig,
];
