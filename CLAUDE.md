# AlgoKeeper — 算法题解记录器桌面应用

## 项目概述

AlgoKeeper 是一款本地优先的算法题解记录桌面应用，专为 LeetCode 刷题群体设计。核心价值是将「写题解」与「复习题解」深度融合，通过 SM-2 间隔重复算法对抗遗忘。

**技术栈**：
- 框架：Electron + React 18 + TypeScript
- 样式：Tailwind CSS + Shadcn/ui
- 数据持久化：Node.js fs（读写 .md 文件）+ SQLite（索引与搜索）
- Markdown 渲染：所见即所得（参考 Typora）
- 调度算法：SM-2（纯函数实现）

## 常用命令

```bash
# 开发
npm run dev           # 启动 Electron 开发环境（热重载）
npm run lint          # 运行 ESLint + TypeScript 类型检查
npm run test          # 运行单元测试（Jest/Vitest）

# 构建
npm run build         # 生产构建
npm run dist          # 打包各平台安装包（Windows/macOS/Linux）

# 数据库
npm run db:init       # 初始化 SQLite 索引数据库
npm run db:migrate    # 运行数据库迁移
```

## 目录结构

```
algo-keeper/
├── src/
│   ├── main/          # Electron 主进程
│   │   ├── index.ts   # 应用入口
│   │   ├── ipc/       # IPC 通信处理
│   │   └── services/  # 核心服务（文件系统、SQLite、SM-2）
│   ├── renderer/      # React 渲染进程
│   │   ├── components/# UI 组件
│   │   ├── hooks/     # 自定义 Hooks
│   │   ├── pages/     # 页面（编辑器、复习会话、仪表盘）
│   │   └── store/     # 状态管理（Zustand/Redux）
│   └── shared/        # 共享类型和工具函数
├── resources/         # 静态资源
└── .claude/           # Claude Code 配置（rules/skills/agents）
```

> 实际数据布局（笔记、图片）见下文「数据与文件存储约定」，不放入 `src/`。

## 代码规范

- 使用函数式组件 + Hooks，不使用 Class 组件
- TypeScript strict 模式必须开启，禁止使用 `any`
- 所有 IPC 通信必须有完整的类型定义（`src/shared/types/ipc.ts`）
- 样式仅使用 Tailwind CSS，不写自定义 CSS（除非必要）
- 提交前必须通过 `npm run lint` 和 `npm run test`
- 使用 Conventional Commits：`feat:`、`fix:`、`chore:`、`docs:`、`refactor:`

## 核心模块说明

### 1. 题解笔记模块

- 数据模型见 `src/shared/types/note.ts`
- Markdown 解析器：`src/main/services/markdown-parser.ts`
- Frontmatter 格式：YAML，存储难度、标签、复习变量

### 2. 间隔重复模块

- SM-2 调度（纯函数）：`src/shared/utils/sm2.ts`
- 复习队列管理：`src/main/services/queue-manager.ts`
- 卡片数据结构：`repetitions`、`easeFactor`、`interval`

### 3. 搜索与索引模块

- SQLite 表结构：`notes`、`tags`、`cards`、`review_logs`
- 全文搜索：SQLite FTS5

## 重要约束

- **本地优先**：所有笔记以 .md 纯文本存储，用户完全掌控数据
- **不强制云同步**：仅推荐用户自行借助网盘同步目录
- **跨平台**：必须支持 Windows 10+、macOS 11+、Linux（Debian/Ubuntu）
- **键盘驱动**：90% 以上核心操作需提供快捷键
- **桌面应用形态**：最终以 Electron 桌面应用运行，存储读写一律经由主进程 fs 能力，渲染进程不直连文件系统

## 数据与文件存储约定

以下为产品级存储约定，任何实现都必须遵循（详细设计见 `docs/PRD.md`、`docs/technical-design.md`）：

- **笔记默认根目录** = 程序安装/项目根目录下的 `Documents/`（即 `<appRoot>/Documents`，开发期为项目根下的 `Documents/`）。首启可直接使用该默认目录，也允许用户改选其他目录；切换后应用迁移索引并监听新目录。
- **笔记文件路径**：`{notesRoot}/{source}/{id}.md`（如 `Documents/leetcode/two-sum.md`），文件名创建后不变。
- **图片依赖管理（类 Typora）**：笔记内引用的图片默认保存在**该笔记所在目录**下的 `.images/` 文件夹（如 `Documents/leetcode/.images/`）；正文用**相对路径**引用图片，保证整目录（含 `.images`）可整体拷贝、网盘同步、跨机迁移后仍可显示。
- **打包注意**：作为桌面应用安装后，需确保 `<appRoot>` 目录可写（便携/绿色分发或安装目录可写）；若安装目录不可写（如系统受保护路径），首启引导用户迁移数据到可写目录，不得静默失败。
- SQLite 索引与 `review_logs` 属派生数据，放应用数据目录（不放进 `Documents/` 笔记区）；`.md` 文件（含 frontmatter 的复习变量）才是权威数据源。

## 开发与测试约定

- 开发期 renderer 由 electron-vite dev server 提供，**仅绑定本机回环 `127.0.0.1`**，用途为功能开发与 **Playwright 网页交互测试**。
- 交互测试以 Playwright（网页端）为主。注意：普通浏览器里访问渲染页时 `window.api`（preload）不存在，属预期；渲染代码需对 `window.api` 做可选链容错。
- 生产/打包版本只经 Electron `loadFile` 从 `file://` 加载渲染层，**不运行任何 HTTP 服务**。
- **成熟后禁用网页访问**：界面只能由桌面应用访问。实现约束：dev host 恒为 `127.0.0.1`（勿用 `--host`/`0.0.0.0` 暴露到局域网）；仅允许 Playwright 所需的最小可测面保留 HTTP，生产包不含 dev server。

## 参考资源

- 产品需求文档：见项目 `docs/PRD.md`
- 技术实现方案：见项目 `docs/technical-design.md`
- SM-2 算法参考：https://github.com/x1ee7/sm2-spaced-repetition
- Electron 文档：https://www.electronjs.org/docs
