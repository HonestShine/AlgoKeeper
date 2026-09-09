import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'Documents/**',
      // 随 .claude/.agents/.codebuddy 安装的技能目录不参与项目 lint
      '.claude/**',
      '.agents/**',
      '.codebuddy/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 工程内 CommonJS 配置文件/脚本（tailwind.config.js 等）
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TS 自带类型检查，关闭 JS 层面的重复/误报规则
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
)
