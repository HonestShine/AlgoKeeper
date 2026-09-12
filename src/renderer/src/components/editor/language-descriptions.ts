import { LanguageDescription } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'

/**
 * 围栏代码块内嵌高亮的语言（覆盖 LeetCode 主流提交语言）。
 *
 * 显式注册而非用 @codemirror/language-data：后者按动态 import 引用大量未安装的
 * 语言包，Vite 构建会因无法解析而失败。
 *
 * 抽成独立模块是为了能被 node 环境的单测直接断言（见 language-descriptions.test.ts），
 * 不必启动 GUI 就能验证四个语言包「真能解析」而不只是「导入成立」。
 */
export const CODE_LANGUAGES = [
  LanguageDescription.of({ name: 'javascript', alias: ['js', 'jsx', 'typescript', 'ts', 'tsx'], extensions: ['js', 'jsx', 'ts', 'tsx'], load: async () => javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'python', alias: ['py'], extensions: ['py'], load: async () => python() }),
  LanguageDescription.of({ name: 'cpp', alias: ['c++'], extensions: ['cpp', 'cc', 'h', 'hpp'], load: async () => cpp() }),
  LanguageDescription.of({ name: 'java', extensions: ['java'], load: async () => java() }),
  LanguageDescription.of({ name: 'go', alias: ['golang'], extensions: ['go'], load: async () => go() })
]
