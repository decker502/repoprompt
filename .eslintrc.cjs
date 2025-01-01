module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    plugins: [
        '@typescript-eslint'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        '@typescript-eslint/naming-convention': 'warn',
        '@typescript-eslint/semi': 'warn',
        'curly': 'warn',
        'eqeqeq': 'warn',
        'no-throw-literal': 'warn',
        'semi': 'off'
    },
    ignorePatterns: [
        'dist',
        '**/*.d.ts'
    ]
}; 