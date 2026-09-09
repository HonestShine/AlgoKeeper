# AlgoKeeper · 算法题解记录 + 间隔重复复习

AlgoKeeper 是一款**本地优先**的算法题解记录桌面应用，把「写题解」与「复习题解」融合在同一工作流：用 Typora 式所见即所得写 `.md` 题解，再用 **SM-2 间隔重复**自动调度复习，让算法知识沉淀为长期记忆。

> 面向 LeetCode 备战者 / Markdown 键盘流 / 数据隐私敏感者。

---

## ✨ 特性

**题解笔记（.md 纯文本）**
- 结构化元数据：来源 / 题号 / 标题 / 难度 / 标签 / 状态，存 YAML frontmatter
- 多解法独立块 + 各自复杂度；所见即所得（Tiptap）：代码高亮、LaTeX 公式、表格、任务清单、图片
- 源码 ↔ WYSIWYG 一键切换（Ctrl+/）；沉浸阅读 + 自动大纲；粘贴 URL 自动解析题目

**SM-2 复习（对抗遗忘）**
- 整题卡 + 拆解卡（`问题::答案`）；1=Again 2=Hard 3=Good 4=Easy
- 今日队列（到期 + 新卡上限）、按难度/标签过滤、全键盘会话（空格/1-4/Esc）
- 调度变量权威写入 `.md` frontmatter（文件即数据，可重导入）

**组织与洞察**
- 全文 + 组合筛选（难度/标签/状态/关键词 AND/OR）；标签知识地图
- 统计看板：难度分布、正确率曲线、薄弱标签高亮；`[[双链]]` 与关联推荐

**输出与分享**
- 导出 **Markdown / HTML / PDF**（分享版剥调度 / 备份版可回导）
- 真实脚注节点化：上标、悬停预览、引用↔定义双向跳转

**体验**
- 顶部完整菜单 + 文件区/编辑区右键菜单；快捷键驱动
- 主题：**GitHub 浅色（默认）** / 深色

---

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron（≥30）+ electron-vite |
| 前端 | React 18 + TypeScript（strict） |
| 样式 | Tailwind CSS + 自定义主题令牌 |
| 编辑器 | Tiptap v3（表格/任务/数学/代码高亮）+ 自定义脚注节点 |
| 存储 | Node `fs` 读写 `.md`（权威）+ SQLite（better-sqlite3）索引/日志 |
| 调度 | SM-2（纯函数，见 `src/shared/utils/sm2.ts`） |
| 测试 | Vitest + Playwright（Electron 全链路 E2E） |

---

## 🚀 开发

```bash
npm install        # 安装依赖（含 Electron；npm 11 需批准 better-sqlite3 脚本）
npm run dev        # 启动 Electron 开发窗口（127.0.0.1:5173 供 Playwright 网页测试）
```

质量门禁：

```bash
npm run lint       # typecheck + eslint
npm test           # Vitest 单测（37+）
npm run build      # electron-vite 生产构建
npm run e2e:electron   # 真实 Electron 全链路走查（先 build）
```

---

## 📦 打包与发布

```bash
npm run dist       # 产出 NSIS 安装包（release/）
```

- 产物命名：`AlgoKeeper_64bit-v<version>.exe`（见 `electron-builder.yml`）
- 数据目录 = 程序所在目录下 `Documents\`（请安装在可写路径）
- Windows 打包注意：若被安全软件拦截 `default_app.asar`，把项目目录加入杀软信任区后重试

当前发布：**v0.1.0** —— https://github.com/HonestShine/AlgoKeeper/releases/tag/v0.1.0

---

## 📁 数据与存储约定

- 笔记默认根目录：`<appRoot>/Documents`（首启可改；`<appRoot>` = 程序安装/项目根目录）
- 笔记文件：`{notesRoot}/{source}/{id}.md`，文件名创建后不变
- 图片：随笔记所在目录的 `.images/` 保存，正文以相对路径引用（类 Typora），整目录可拷贝/同步
- 权威源：`.md`（frontmatter 含作者字段与 `scheduling` 复习变量）；SQLite 仅为可重建索引与 `review_logs` 分析日志
- 卸载应用后：`.md` 仍可用任何文本编辑器打开，可整目录重导入

```
algo-keeper/
├── src/
│   ├── main/         # Electron 主进程：services（md/存储/SM-2/SQLite 索引）、ipc
│   ├── preload/      # contextBridge：类型化 window.api
│   ├── renderer/     # React UI：页面/组件/hooks/store
│   └── shared/       # 纯类型与纯函数（sm2/日期/拆卡/脚注/url/toc）
├── docs/             # PRD、技术方案、脚注管线设计
├── build/            # 应用图标（icon.ico 256px）
├── scripts/          # e2e-electron / smoke-packaged
└── release/          # 打包产物（不入库）
```

---

## ⌨️ 常用快捷键

| 键 | 动作 |
|---|---|
| Ctrl+Shift+N | 快速记录（粘贴 URL 自动解析） |
| Ctrl+S / Ctrl+Shift+S | 保存 / 另存为 |
| Ctrl+K | 搜索 / 打开 |
| Ctrl+F | 查找替换 |
| Ctrl+E | 阅读/编辑切换 |
| Ctrl+Shift+R | 今日复习 |
| Ctrl+, | 偏好设置 |
| 空格 / 1-4 / U / Esc | 复习会话：翻答案 / 评分 / 撤销 / 退出 |

---

## 📄 License

本项目以 [MIT License](./LICENSE) 发布。

> 免责声明：AlgoKeeper 为独立项目，与 LeetCode / Obsidian / Anki 等无关联。
