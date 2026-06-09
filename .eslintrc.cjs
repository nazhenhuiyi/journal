module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'dist',
    'dist-electron',
    'node_modules',
    '.eslintrc.cjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  overrides: [
    {
      files: [
        'apps/desktop/**/*.{ts,tsx}',
      ],
      extends: ['plugin:react-hooks/recommended'],
    },
    {
      files: ['apps/mobile/**/*.{ts,tsx}'],
      extends: ['plugin:react-hooks/recommended'],
      rules: {
        'react-hooks/refs': 'off',
        'react-hooks/set-state-in-effect': 'off',
      },
    },
    {
      files: ['apps/desktop/src/**/*.{ts,tsx}'],
      plugins: ['react-refresh'],
      rules: {
        'react-refresh/only-export-components': [
          'warn',
          { allowConstantExport: true },
        ],
      },
    },
  ],
}
