import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'android/**',
      'dist/**',
      'ios/**',
      'node_modules/**',
      'public/legacy/**',
      'src/features/*/legacy-patch/**/*.js',
      'src/shared/legacy-patch/**/*.js',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
)
