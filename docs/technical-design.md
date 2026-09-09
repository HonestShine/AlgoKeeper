# AlgoKeeper 技术实现方案（Technical Design）

> 版本：v0.1（草稿，待评审）
> 状态：Draft
> 配套文档：[`docs/PRD.md`](./PRD.md)（产品需求文档）
> 文档 ID：AlgoKeeper / TECHDESIGN
>
> 本方案作为**实现蓝图**：先于代码锁死数据契约、算法规则与模块边界，供后续生成代码时逐节对齐。产品侧约定一律以 PRD 为准，命名与数值此处与 PRD 保持一致。

---

## 目录

1. [概述与目标](#1-概述与目标)
2. [总体架构](#2-总体架构)
3. [数据模型](#3-数据模型)
4. [.md 文件格式契约](#4-md-文件格式契约)
5. [核心服务设计与伪代码](#5-核心服务设计与伪代码)
6. [IPC 契约](#6-ipc-契约)
7. [编辑器与渲染（Tiptap）](#7-编辑器与渲染tiptap)
8. [UI 组件结构](#8-ui-组件结构)
9. [快捷键实现与冲突策略](#9-快捷键实现与冲突策略)
10. [测试策略](#10-测试策略)
11. [风险与应对](#11-风险与应对)

---

## 1. 概述与目标

### 1.1 目标

按 PRD 交付一款本地优先、键盘驱动、面向算法题解书写的 Electron 桌面应用。本方案的直接产出物是**可落地编码的依据**：

- 一份类型安全、可扩展的数据契约（§3）；
- 确定性、可单测的算法与服务规则（§5，SM-2 公式与 PRD §4.2 / 附录样例数值一致）；
- 前后端隔离的分层边界与 IPC 通道清单（§2 / §6）；
- 编辑器的 Tiptap 扩展策略与 `.md` round-trip 保真策略（§7）；
- 渲染进程组件树与状态归属（§8）、快捷键冲突规则（§9）。

### 1.2 技术栈（与 CLAUDE.md 对齐）

| 层 | 选型 | 备注 |
|---|---|---|
| 桌面框架 | Electron（≥ 30） | 主/渲染双进程 |
| UI | React 18 + TypeScript（strict，禁 `any`） | |
| 样式 | Tailwind CSS + Shadcn/ui | 组件语义层 |
| 富文本编辑 | **Tiptap**（ProseMirror 内核） | WYSIWYG；扩展见 §7 |
| Markdown 解析/序列化 | unified + remark + remark-frontmatter | 服务端与编辑器两侧复用 |
| 代码高亮 | Shiki | 主进程预取；编辑器内 `CodeBlockLowlight` 可用 |
| 数学公式 | KaTeX | `$…$` / `$$…$$` |
| SQLite | better-sqlite3 | 仅索引/检索（见 §3.4）；原生模块需 electron-rebuild |
| 状态管理 | zustand | 见 §8.3 |
| 打包 | electron-builder | 见 PRD §8 里程碑 |
| 测试 | Vitest + @testing-library | 见 §10 |

> 编辑器引擎经评审定为 **Tiptap**；round-trip 边界与保真策略见 §7.3。

---

## 2. 总体架构

### 2.1 进程与安全模型

```text
┌────────────────────────── Renderer (React) ──────────────────────────┐
│  EditorPage / ReviewSession / Dashboard / SearchPalette / …          │
│        ▲  typed IPC via window.api.*        │ 无 nodeIntegration     │
└────────┼────────────────────────────────────┼────────────────────────┘
         │ contextIsolation:true              │ 事件推送（外部变更等）
┌────────┴────────────────────────────────────▼────────────────────────┐
│                          Preload（bridge）                          │
│  contextBridge.exposeInMainWorld('api', invokeWrappers)              │
├──────────────────────────────────────────────────────────────────────┤
│                        Main 进程 services                           │
│  note-store  markdown-parser  sm2-scheduler  queue-manager           │
│  search-index  stats-service  url-parser  exporter                   │
│        ┌──────────────────────────┴──────────────────────┐           │
│        ▼ fs（notesRoot .md 文件，权威）    ▼ better-sqlite3（索引）    │
└──────────────────────────────────────────────────────────────────────┘
```

安全红线（强制）：
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox` 开启；
- Renderer 不直连 Node/`fs`/SQLite，一律经 preload 暴露的 `window.api`（类型化）；
- 主进程 `ipcMain.handle` 校验入参 schema（复用 shared 类型，杜绝 `any`）；
- 禁止硬编码密钥 / token。

### 2.2 分层与依赖方向

```text
shared/（纯类型 + 常量 + 纯函数，无 Electron 依赖）
   ▲            ▲
main/ services ─┴─ ipc（注册 handle，做 fs/db）
renderer/ store（zustand）· api（调用 window.api）
```

依赖方向单向：`renderer → shared`、`main → shared`、`renderer → main` 只经 IPC。`shared` 内 SM-2、哈希、日期工具保持**纯函数**（URL 解析虽无副作用，但需 Node `URL`，归 `main/services`，规则与正则同款纯逻辑、可单测），便于直接单测。

### 2.3 目录结构（落实 CLAUDE.md 规划）

```text
algo-keeper/
├── package.json / tsconfig.base.json / electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts                 # app 生命周期、BrowserWindow 创建
│   │   ├── ipc/                     # 每个 handle 一个文件 + registerAll.ts
│   │   └── services/
│   │       ├── markdown-parser.ts   # §5.1
│   │       ├── queue-manager.ts     # §5.3（复用 shared/utils/sm2.ts 纯函数）
│   │       ├── note-store.ts        # §5.4 fs 读写/watch
│   │       ├── url-parser.ts        # §5.5
│   │       ├── search-index.ts      # §5.6 SQLite + FTS5
│   │       └── stats-service.ts     # §5.7
│   ├── preload/
│   │   └── index.ts                 # contextBridge 暴露 window.api
│   ├── renderer/
│   │   ├── main.tsx / App.tsx
│   │   ├── components/              # 见 §8 组件树
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── store/                   # zustand slices
│   └── shared/
│       ├── types/
│       │   ├── note.ts              # §3 领域类型
│       │   ├── srs.ts               # SchedulingInfo / CardRecord
│       │   └── ipc.ts               # §6 IPC 通道类型
│       └── utils/                   # pure：date.ts hash.ts sm2.ts（§5.2 主实现）
├── resources/
├── .claude/                         # rules/skills/agents（后续按 CLAUDE.md 补齐）
└── docs/                            # PRD.md / technical-design.md
```

构建依赖：`better-sqlite3` 属原生模块，electron-builder 与 dev 脚本统一经 `@electron/rebuild` 预构建（见 §11 R6）。

---

## 3. 数据模型

> 命名即契约。所有类型放 `src/shared/types/`，字段以注释标注语义与取值范围。禁止 `any`。

### 3.1 基础与元数据

```ts
// note.ts
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** 手动状态标记（PRD FR-3.4） */
export type NoteStatus = 'active' | 'to-review' | 'mastered' | 'need-depth';
// 说明：'to-review' 待二刷 / 'mastered' 已掌握 / 'need-depth' 需深入 / 缺省 'active'

/** 一条题解 .md 的头部元数据（与 frontmatter 一一对应，见 §4.1） */
export interface FileMeta {
  source: string;        // 题目来源，内建 'leetcode'，可扩展
  id: string;            // source 内稳定标识；LeetCode 场景取 URL slug（如 'two-sum'）
  title: string;         // 人类可读标题；[[链接]] 解析依据（见 FR-4.2）
  difficulty: Difficulty;
  tags: string[];        // 多标签；正文 frontmatter 中为数组
  status?: NoteStatus;   // 缺省 'active'
  aliases?: string[];    // [[链接]] 备选名（支持中文名，如 ['两数之和']）
  createdAt: string;     // ISO-8601（含时区）
  updatedAt: string;     // ISO-8601，保存时刷新
}

/** 解析/序列化后的完整题解（纯结构，正文保留原 md 源码树，见 §4.3） */
export interface NoteDoc {
  meta: FileMeta;
  solutions: SolutionBlock[];   // 解法块（§3.2）
  splitCards: EmbeddedCard[];   // 正文中的 `问题::答案` 拆解卡（§3.3）
  links: RelationRef[];         // [[题名]] 引用（含别名解析所需文本）
  /** 保存正文时用：prettier 化/非结构化段落仍保留原文，见 §4.3 */
  bodySource: string;           // frontmatter 之后的原始 md（编辑时可作兜底）
}
```

### 3.2 解法块

```ts
export interface SolutionBlock {
  index: number;            // 0 起；阅读/整题卡答案按序渲染「解法一/二…」
  heading: string;          // 如 "解法一：哈希表"（来源 Heading 节点文本）
  bodyMd: string;           // 思路等正文（渲染/导出）
  /** 复杂度：从正文特定行提取，约定见 §4.2；缺失允许为 null */
  timeComplexity?: string;  // "O(n)"
  spaceComplexity?: string; // "O(n)"
}
```

### 3.3 卡片与调度（复习模块核心）

```ts
// srs.ts
export type CardKind = 'whole' | 'split';

/**
 * 每张被调度卡追踪的三核心变量 + 派生字段。
 * 初值: repetitions 0 · easeFactor 2.5 · interval 0（EF 下限 1.3）
 */
export interface SchedulingInfo {
  repetitions: number;   // 连续答对次数（≥0，失败重置 0）
  easeFactor: number;    // 难度因子 [1.3, ∞)，初 2.5
  interval: number;      // 距下次复习天数（≥0，新卡 0）
  due: string;           // 'YYYY-MM-DD' 本地自然日到期
  lapses: number;        // 累计 Again 次数（统计用）
  lastReviewed?: string; // 'YYYY-MM-DD' 最近一次评分日
}

/** 用于索引/会话的卡片视图（SQLite cards 表行 + 调度）。md 是权威，此表可重建。 */
export interface CardRecord {
  cardId: string;        // whole: `${noteId}::main`；split: `${noteId}::${qhash}`
  noteId: string;        // `${source}/${id}`，如 'leetcode/two-sum'
  kind: CardKind;
  question: string;      // 回忆面文本
  answerText?: string;   // split 卡的答案面；whole 卡不落库，运行期由解法块聚合
  sched: SchedulingInfo;
}

/** 正文中的一条 `问题::答案`（PRD A.2）。键由 question 派生，见 §3.4。 */
export interface EmbeddedCard {
  qhash: string;         // hashKey(question)，8 位 hex
  question: string;
  answer: string;
  location: { lineStart: number; lineEnd: number }; // 便于编辑联动
}

/** [[链接]] 引用 */
export interface RelationRef {
  target: string;        // 被引用名（题名/别名，不做实时解析而是落索引时匹配）
  display: string;       // 展示文本
}
```

整题卡（`whole`）**不把答案文本写死**：复习时答案面 = 运行期把该题 `solutions` 渲染成答案卡片；frontmatter `scheduling.main` 存其调度；整题卡问题面 = “回顾 {title} 的完整解法”。

### 3.4 权威源与索引的取舍（关键决策）

- **内容与调度权威 = `.md` 文件**：frontmatter 含 `FileMeta` 全部人工字段 + `scheduling` 块（`main` 整题卡 + `cards` 映射）。卸载应用或删除数据库后，仅凭目录可重建一切。
- **SQLite = 可重建索引**（表 `notes`/`tags`/`cards`/`review_logs`）：加速到期查询、FTS 检索、统计；启动与文件 watch 时增量同步重建（§5.4 / §5.6）。`review_logs` 为**追加型分析日志**，非权威，重导入时清空重建基线。
- **拆卡键派生规则**：`qhash = fnv1a8(normalize(question))`，`normalize = trim + 折叠连续空白`。正文删除该问句则对应调度自动回收（孤儿调度在前台清理任务清除）。
  - 已知限制：**改写问句文本会换键**、丢历史。缓解：normalize 后再哈希降低误伤；文档明示（PRD R3）。
- **why not 纯 DB**：PRD 主张数据自控 + `.md` 可读可重导；把调度写回 frontmatter 换来自包含，代价是复习后会改写文件——用会话结束统一批量原子写 + 防抖 + 外部变更检测对冲（§5.4，PRD R1）。

### 3.5 SQLite schema（better-sqlite3）

```sql
CREATE TABLE notes (
  note_id      TEXT PRIMARY KEY,           -- 'leetcode/two-sum'
  source       TEXT NOT NULL,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  difficulty   TEXT NOT NULL CHECK(difficulty IN ('Easy','Medium','Hard')),
  status       TEXT NOT NULL DEFAULT 'active',
  file_path    TEXT NOT NULL,
  mtime        INTEGER NOT NULL,           -- 文件修改毫秒，用于增量同步
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_notes_source_id ON notes(source, id);

CREATE TABLE tags (
  note_id  TEXT NOT NULL REFERENCES notes(note_id),
  tag      TEXT NOT NULL,
  PRIMARY KEY(note_id, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE cards (
  card_id        TEXT PRIMARY KEY,          -- 'leetcode/two-sum::main' 或 '::qhash'
  note_id        TEXT NOT NULL REFERENCES notes(note_id),
  kind           TEXT NOT NULL CHECK(kind IN ('whole','split')),
  question       TEXT NOT NULL,
  answer_text    TEXT,
  repetitions    INTEGER NOT NULL DEFAULT 0,
  ease_factor    REAL    NOT NULL DEFAULT 2.5,
  interval_days  INTEGER NOT NULL DEFAULT 0,
  due            TEXT NOT NULL,             -- 'YYYY-MM-DD'
  lapses         INTEGER NOT NULL DEFAULT 0,
  last_reviewed  TEXT,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_cards_due ON cards(due);               -- 到期查询：due <= today
CREATE INDEX idx_cards_note ON cards(note_id);

CREATE TABLE review_logs (                  -- 追加型分析日志，非权威
  log_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    TEXT NOT NULL,
  note_id    TEXT NOT NULL,
  ts         TEXT NOT NULL,                 -- ISO-8601
  grade      INTEGER NOT NULL CHECK(grade IN (1,2,3,4)),
  interval_before INTEGER,
  interval_after  INTEGER,
  ease_after      REAL
);
CREATE INDEX idx_logs_note_ts ON review_logs(note_id, ts);
```

到期检索只查 `cards`（`due <= :today`），正文/标签走 FTS（§5.6）。

---

## 4. .md 文件格式契约

### 4.1 Frontmatter schema

权威字段同 PRD 附录 A.1；序列化时**固定键序**以减小文件抖动：

```yaml
---
source: leetcode
id: two-sum
title: Two Sum
difficulty: Easy
tags: [array, hash-table]
status: active            # 可选；缺省 'active'（active 也可省略不写）
aliases: [两数之和]         # 可选
created: 2026-09-01T09:12:00+08:00
updated: 2026-09-08T21:47:00+08:00
scheduling:
  main:
    repetitions: 3
    easeFactor: 2.5
    interval: 15
    due: 2026-09-21
    last-reviewed: 2026-09-06
    lapses: 1
  cards:
    "7c2a9f01":
      repetitions: 2
      easeFactor: 2.36
      interval: 6
      due: 2026-09-14
      last-reviewed: 2026-09-08
      lapses: 0
---
```

规则：
- 键名固定；`tags` 数组化序列化（`[a, b]`）；`aliases` 同。
- **frontmatter 键 ↔ TS 字段映射**（读写走同一张表）：`created→FileMeta.createdAt`、`updated→FileMeta.updatedAt`、`last-reviewed→SchedulingInfo.lastReviewed`；其余键与字段同名（`repetitions/easeFactor/interval/due/lapses`）。
- `updated` 每次保存刷新；`created` 仅首次写入。
- 字段缺失处理：`difficulty/tags/title/id/source` 缺失时视为“不完整”，编辑区提示但**不阻塞读取正文**（PRD FR-1.1 验收）。
- **未知字段保留**：解析不丢、序列化原样回写，保证与其他工具共存。

### 4.2 正文结构化约定

- **解法块**：`## 解法一：…` 到下一个同级 Heading 之间的区域。复杂度识别：**所在段落包含 `**时间复杂度**` 即归属当前解法块**——可 `**时间复杂度**：O(n)　**空间复杂度**：O(1)` 同段、也可独立成段（两种都出现在 PRD A.1）。
- **拆解卡**：独立行 `问题::答案`，见 PRD A.2；同一段多行 → 多卡。
- **双链**：`[[名字]]`，名字可为 title 或 alias；不做文件移动语义，仅索引（PRD FR-4.2）。
- 正文其余 Markdown（标题、列表、表格、引用、公式、图片）按标准 Markdown 保留。

### 4.3 Round-trip 保真策略

WYSIWYG（Tiptap）与 `.md` 互相转换的边界（细节 §7.3）：
- **首选结构非侵入**：正文以解析后的结构化骨架（解法/卡片/双链）**叠加原文**管理；Tiptap 覆盖的语法（heading/code/table/math/link）round-trip，未覆盖语法降级为“代码块原文或原样文本”，绝不静默删除。
- 未知 frontmatter 字段、无法建模的 block 均**保原样**回写。
- 每次保存对比序列化产物，若与原文仅差格式，以原文优先（减少无关 diff）。

### 4.4 路径与命名（桌面存储布局）

- **默认根目录**：`<appRoot>/Documents`（`<appRoot>` = 程序安装/项目根目录；开发期为项目根下 `Documents/`）。首启默认使用并在设置中允许改选；迁移时重建索引并接管新目录（含 `.images/`）。打包后 `<appRoot>` 可能不可写，处理见 §11 R9。
- 笔记文件：`{notesRoot}/{source}/{id}.md`，文件名创建后不变（改 title 不改名）；`source` 小写段、`id` 为安全 slug。
- **图片（类 Typora，对应 PRD FR-1.7）**：粘贴/拖入图片 → 复制到该 md 所在目录的 `.images/`（即 `{mdDir}/.images/`，如 `Documents/leetcode/.images/`）→ 正文写**相对引用** `![](./.images/xxx.png)`。图片名 `{unix-ms}-{hash8}.{ext}` 去重。整目录（含 `.images/`）可整体拷贝、网盘同步、跨机可读。
- SQLite 索引与 `review_logs` 放应用数据目录，**不落入 `Documents/` 笔记区**（`.md` 为权威源，见 §3.4）。

---

## 5. 核心服务设计与伪代码

> 以下为“实现前锁定规则”级伪代码。纯函数部分（§5.2、hash）放 `shared` 便于直接单测；依赖 `fs`/DB 的放 `main/services`。

### 5.1 markdown-parser

输入 md 文本 → 输出 `NoteDoc`（含 raw 分段）。要点：

```ts
// markdown-parser.ts
interface ParseResult { doc: NoteDoc | null; warnings: string[] }

function parseNote(md: string): ParseResult {
  const { meta, bodyMd } = parseFrontmatter(md);        // remark-frontmatter → yaml 映射
  if (!isCompleteMeta(meta)) warnings.push('missing-field', meta);
  const tree = remarkParse(bodyMd);                     // mdast

  const solutions: SolutionBlock[] = [];
  const splitCards: EmbeddedCard[] = [];
  let cur: SolutionBlock | null = null;

  for (const node of walk(tree)) {
    if (node.type === 'heading' && node.depth === 2 && /^解法/.test(text(node))) {
      cur = { index: solutions.length, heading: text(node), bodyMd: '', location: … };
      solutions.push(cur); continue;
    }
    if (isComplexityPara(node)) cur && attachComplexity(cur, text(node));   // 见 §4.2
    if (isCardLine(node)) splitCards.push(splitCard(node));                 // 问题::答案
  }
  // cur 的 bodyMd 由从该解法块起始到下一解法块的 md 源码切片累积（保留缩进/代码）
  const links = extractWikiLinks(bodyMd);               // [[…]]
  meta.status ??= 'active';                             // 补默认值（其余缺省见 §4.1）
  return { doc: { meta, solutions, splitCards, links, bodySource: bodyMd }, warnings };
}

function splitCard(node): EmbeddedCard {
  const m = /^(.+?)::(.+)$/.exec(text(node));           // 首个 :: 切分
  return { qhash: hashKey(m[1]), question: m[1].trim(), answer: m[2].trim(),
           location: lineRange(node) };
}
```

边界：frontmatter 缺失/非法 → 按“裸 md，meta 需补录”处理并告警；`::` 行无冒号 → 视为普通文本不入卡；解法块内嵌套 Heading-3 只作正文不进索引。

### 5.2 sm2-scheduler（确定性规则，与 PRD §4.2 逐条对应）

评分 → 质量分映射与每档规则：

| 档位 | q | repetitions | interval | easeFactor |
|---|---|---|---|---|
| 1 Again | 1 | `0` | `1`（重置短间隔） | **不变**（保留已调整值） |
| 2 Hard | 3 | `+1` | 成功档阶梯 | `EF − 0.14`（下限 1.3） |
| 3 Good | 4 | `+1` | 成功档阶梯 | 不变 |
| 4 Easy | 5 | `+1` | 成功档阶梯 | `EF + 0.10` |

成功档阶梯：`repetitions==1 → interval=1`；`==2 → interval=6`；`≥3 → round(interval × EF')`（EF' 为本次更新后的 EF）。失败步不调 EF——对应 PRD“答错重置短间隔队列，但保留调整后的 easeFactor”。

```ts
// shared/utils/sm2.ts —— 纯函数
export const EASE_MIN = 1.3, EASE_INIT = 2.5, INTERVAL_RESET = 1;

function efAfter(q: 1|3|4|5, ef: number): number {
  if (q < 3) return ef;                                  // Again：不动
  const d = 5 - q;                                       // Hard:2 Good:1 Easy:0
  return Math.max(EASE_MIN, ef + (0.1 - d * (0.08 + 0.02 * d)));
}

export function schedule(grade: 1|2|3|4, sched: SchedulingInfo,
                         today: Day): SchedulingInfo {
  const q = gradeToQuality(grade);                       // {1:1,2:3,3:4,4:5}
  const ef = efAfter(q, sched.easeFactor);
  if (q < 3) {                                           // Again
    return { repetitions: 0, easeFactor: ef, interval: INTERVAL_RESET,
             due: addDays(today, INTERVAL_RESET), lapses: sched.lapses + 1,
             lastReviewed: today.iso };
  }
  const reps = sched.repetitions + 1;
  const interval = reps === 1 ? 1 : reps === 2 ? 6
                  : Math.max(1, Math.round(sched.interval * ef));
  return { repetitions: reps, easeFactor: ef, interval,
           due: addDays(today, interval), lapses: sched.lapses,
           lastReviewed: today.iso };
}
```

**数值演算一：三连 Good 的 interval 阶梯（与 PRD A.1 主卡末态完全一致）**

| 复习日 | 评分 | repetitions | EF | interval | due |
|---|---|---|---|---|---|
| 08-30 | 3 Good | 1 | 2.5 | 1 | 08-31 |
| 08-31 | 3 Good | 2 | 2.5 | 6 | 09-06 |
| 09-06 | 3 Good | 3 | 2.5 | `round(6×2.5)=15` | 09-21 |

末态 = PRD A.1 主卡：`last-reviewed 09-06 / interval 15 / EF 2.5 / due 09-21`（`lapses=1` 来自此前更早的一次失败史，不影响本次演算）。

**数值演算二：成熟卡（reps≥3、EF=2.6）三种评分的分化**（评分日为 T）：

| 评分 | q | repetitions | EF | interval | due |
|---|---|---|---|---|---|
| 1 Again | 1 | 0 | 2.6（不变，保留已调整值） | 1 | T+1 |
| 2 Hard | 3 | +1 | 2.6−0.14 = 2.46 | `round(旧×2.46)` | T+interval |
| 4 Easy | 5 | +1 | 2.6+0.10 = 2.70 | 同阶梯 | T+interval |

Hard/Easy 的区别不在本步 interval 阶梯而在 **EF**：Easy 拉高的 EF 会放大后续所有间隔。

### 5.3 queue-manager 与会话状态机

```ts
// 到期 = 本地时区自然日 ≤ 今天
const TODAY = localDateStr();            // 'YYYY-MM-DD'

interface SessionFilter { tags?: string[]; difficulty?: Difficulty[];
                          lastReviewOlderThanDays?: number; newLimit: number }

// 1) 出队：到期卡优先，其次新卡（受 newLimit），已学新卡今日不再出现
SELECT * FROM cards
WHERE due <= :today
   OR (new AND reviewed_today=false)          -- 新卡未在本日出现
  [AND EXISTS(tags …)]                        -- 按过滤组合拼装，见 §5.6 查询构造器
ORDER BY due ASC, created ASC
LIMIT :sessionCap;
```

会话为**内存态 + 批提交**：评分先写入 `pending: Map<cardId, grade>`；用户退出/完成时一次性调用 `commitReview(session)`：

```ts
function commitReview(pending, today) {
  for (const [cardId, grade] of pending) {
    const before = loadCard(cardId);
    const after  = schedule(grade, before.sched, today);
    // 写 frontmatter（见 §5.4 flushScheduling）：整题卡→ scheduling.main；拆卡→ scheduling.cards[qhash]
    // 写 review_logs（追加一条 before/after）
  }
}
```

状态机（复习会话页）：

```text
idle ──start──▶ question ──Space──▶ reveal ──1/2/3/4──▶ grade(提交) ──▶ question
                  ▲                    │
                  └──── Esc / 空队列 ───┴──▶ 结束(flush + 关闭)
U = 撤回上一张评分（从 pending 移除并重放该卡）
```

### 5.4 note-store（fs 读写，权威写）

- 列表/读：目录递归扫 `*.md`，frontmatter 解析见 §5.1。
- **原子写**：写 `{file}.ak.tmp` → `fsync` → `rename` 覆盖 → 记录 mtime；任何一步失败原文件不动（NFR-5）。
- **scheduling 批量 flush**：会话结束对涉及文件做一次原子写；多个文件批量写间不交叠。
- 防抖自动保存：编辑停 800ms 写一次；失焦/切模式强制写。
- **图片落盘**（§4.4）：粘贴/拖入的图片由 note-store 统一处理——写入 `{mdDir}/.images/`、命名 `{unix-ms}-{hash8}.{ext}`、正文插入相对链接后走既有原子写；同一目录复用 `.images/`，删除正文引用后可清理孤儿图片（低优先任务）。
- **外部变更检测**：`fs.watch` 该目录 + 每文件记录 mtime；应用获焦 / 切换文件前比对该文件 mtime 与内存快照，不一致则以磁盘版本 reload（提示“外部已修改，已重新加载”）。反写前若磁盘 mtime 已变（外部优先），放弃本次写并提示合并——**Last-Write-Wins by mtime**（PRD R1）。
- 孤儿调度清理：前台低优先任务删除 `scheduling.cards` 中在正文已不存在的 qhash 条目。

### 5.5 url-parser（快速记录自动解析）

```ts
interface SourceRule { source: string; hostRe: RegExp; idFromPath: (p: string) => string | null;
                       titleFromPath: (p: string) => string }

const RULES: SourceRule[] = [
  { source: 'leetcode',
    hostRe: /^leetcode\.com$/,
    // /problems/two-sum/description → id=two-sum（slug 即稳定标识）
    idFromPath:  p => /^\/problems\/([\w-]+)/.exec(p)?.[1] ?? null,
    titleFromPath: p => toTitleCase(idFromPath(p)) },   // 'two-sum' → 'Two Sum'
  // 扩展位：nowcoder / codeforces … 后续按需添加（PRD：source 可扩展）
];

function parseProblemUrl(url: string): { source: string; id: string; title: string } | null {
  const u = new URL(url);
  const rule = RULES.find(r => r.hostRe.test(u.hostname.replace(/^www\./,'')));
  const id = rule?.idFromPath(u.pathname) ?? null;
  return id ? { source: rule.source, id, title: rule.titleFromPath(u.pathname) } : null;
}
```

规则：仅接受可信 host；解析失败时浮窗回退为手填 source/id。

### 5.6 search-index（SQLite + FTS5）

建表与同步：

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body, tags, note_id UNINDEXED,
  content='notes', content_rowid='rowid',   -- 或 contentless + 手动维护
  tokenize='trigram'                        -- 中文/子串友好；见 §11 R2
);
```

- **增量同步**：文件事件/mtime 变化 → upsert `notes`/`tags`/`cards`；FTS 行重建。启动时全量扫描对账（mtime 比对，幂等）。
- **组合筛选查询构造器**（AND/OR 均由白名单字段拼接，杜绝注入；参数化绑定）：

```ts
function buildFilter(q: FilterSpec): { where: string; params: unknown[] } {
  // 难度/标签/状态/上次复习 → cards/notes/tags 上等值或范围谓词；
  // 条件之间按 andOr 连接；like 子句用 LIKE ESCAPE '\' 对 % _ \ 转义
}
```

- 模糊搜索：对 `title`/`body`/`tags` 用 trigram 子串匹配（`MATCH ?` 前缀补 `"…"`）；单/双字节中文长句亦可命中；检索全失败时回退 `LIKE '%kw%'`（§11 R2）。排序：标题命中 > 标签命中 > 正文命中，正文内按位置。

示例查询到 SQL（PRD FR-3.1 第一条）：

```sql
-- 示例：难度=Hard AND 标签=动态规划 AND 上次复习距今 > 7 天
-- （PRD FR-3.1："上次复习>7天" = last_reviewed 早于 7 天前；从未复习按“距今无限久”也应命中）
SELECT n.note_id, n.title FROM notes n
JOIN tags t1 ON t1.note_id = n.note_id AND t1.tag = '动态规划'
WHERE n.difficulty = 'Hard'
  AND n.note_id IN (
    SELECT c.note_id FROM cards c
    WHERE c.last_reviewed IS NULL OR c.last_reviewed < date('now', '-7 day')
  );
```

### 5.7 stats-service（仪表盘 / 薄弱高亮）

口径（与 PRD §9 一致）：正确率 = 当日 `grade ∈ {3,4}` 复习数 ÷ 当日复习总数（Hard 记为“勉强”，不计对——开放项 PRD R7）。

```ts
// 每日正确率
SELECT date(ts) d,
       SUM(CASE WHEN grade >= 3 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) acc,
       COUNT(*) n
FROM review_logs GROUP BY date(ts) ORDER BY d;

// 薄弱标签：近 N=30 天样本 >=5 且 正确率 < 0.60
SELECT tag, 1.0*SUM(grade>=3)/COUNT(*) acc, COUNT(*) n
FROM review_logs JOIN tags USING (note_id)
WHERE ts >= :since30d GROUP BY tag
HAVING COUNT(*) >= 5 AND acc < 0.60;
```

标签覆盖率 = 去重标签数与存在题解数之比（洞察展示用）。

---

## 6. IPC 契约

通道清单（全部类型集中在 `shared/types/ipc.ts`；主进程实现，preload 暴露同名包装）。请求一律带 `traceId` 便于日志。

```ts
// ipc.ts —— 通道 → (入参, 返回值) 摘要
export interface IpcChannels {
  // notes
  'notes:list'           : (q: { root?: string }) → Promise<NoteSummary[]>;
  'notes:get'            : (noteId: string) → Promise<NoteDoc | null>;
  'notes:create'         : (draft: { meta: FileMeta; bodyMd: string }) → Promise<NoteDoc>;
  'notes:save'           : (doc: NoteDoc) → Promise<{ noteId: string; updatedAt: string }>;
  'notes:delete'         : (noteId: string) → Promise<void>;
  'notes:pickRoot'       : () → Promise<string | null>;     // 目录选择（对话框）
  'images:add'           : (r: { noteId: string; dataUrl: string })   // 粘贴/拖入图片
                         → Promise<{ absPath: string; relPath: string }>; // §4.4：写 {mdDir}/.images + 相对引用
  'parse:url'            : (url: string) → Promise<ParsedUrl | null>;   // §5.5
  // review
  'review:todayCount'    : () → Promise<number>;
  'review:queue'         : (filter: SessionFilter) → Promise<QueuedCard[]>;
  'review:commit'        : (r: { results: {cardId: string; grade: 1|2|3|4}[]; today: string })
                          → Promise<void>;                 // 内部批量 flush frontmatter + 索引
  'cards:forNote'        : (noteId: string) → Promise<CardRecord[]>;
  // search
  'search:query'         : (spec: FilterSpec) → Promise<SearchHit[]>;
  'search:tags'          : () → Promise<TagAgg[]>;
  // meta
  'meta:settings'        : (p?: Partial<Settings>) → Promise<Settings>;
  // export
  'export:run'           : (p: ExportSpec) → Promise<{ path: string }>;  // md/pdf/html，PRD FR-4.3
}
// 事件推送（main → renderer）：'event:fileChanged'（外部改动）、'event:queueDirty'（队列数变化）
```

错误协议：所有通道失败统一抛 `{ code, message, noteId? }` 结构化错误，避免渲染进程 catch 到裸字符串。渲染端调用经 `hooks/useApi.ts` 包装并集中 toast。

---

## 7. 编辑器与渲染（Tiptap）

### 7.1 为什么 Tiptap

WYSIWYG + 对 ProseMirror 生态直接可控；社区/官方扩展覆盖代码、表格、任务列表、公式；以 Markdown 存储时用序列化器对齐 §4.3 round-trip 策略。引擎被前端抽象 `EditorSurface` 包裹，接口只暴露 `doc<->md` 与命令，隔离引擎细节（可测、可替换）。

### 7.2 扩展（节点/marks）清单

| 扩展 | 用途 | 序列化到 md |
|---|---|---|
| StarterKit（heading/list/bold/…） | 基础 | 标准语法 |
| CodeBlockLowlight + Shiki | 代码高亮、语言标注 | 围栏 + lang |
| MathExtension（KaTeX） | `$…$`/`$$…$$` | 原文 |
| Link / `CustomNode: WikiLink` | 双链（`[[…]]` 建议气泡、反链跳转） | `[[text]]` |
| `CustomNode: SplitCardBlock` | `问题::答案` 编辑为“问答卡片”样式块 | 单行 `问题::答案` |
| `CustomNode: ComplexityChip` | `**时间复杂度** O(n)` 的可视化小件（只读提示、仍保原文） | 原文行 |
| FrontmatterMeta | 编辑区上方元数据条（非正文节点） | 仅 frontmatter |

编辑器内快捷键：Tiptap `Extension: keyboard` 注册（§9）。

### 7.3 `.md` ↔ 编辑器 round-trip

- 解析：§5.1 `mdast` → 生成 ProseMirror doc（标题/代码/公式/表格/卡/双链映射节点）。
- 序列化：`mdast` 化 → 还原 md；**凡被降级的语法（本扩展集外的 block）留在原 text node 中，不删除**；保存前若序列化结果与“正文原 md 差”只在空白/换行，则以原文写盘，降低 diff（§4.3）。
- 阅读模式 = 同一 `doc` 的**只读视图**（`editable:false`）+ 隐藏工具栏；TOC 由 Heading 节点实时生成，点击滚动定位。
- 沉浸阅读隐藏编辑控件（PRD FR-4.1），不新增第二套渲染管线。

---

## 8. UI 组件结构

> 展示**结构代码**（类型化 props，JSX 略）。状态归属见 §8.3。

### 8.1 主布局

```tsx
// components/layout/
export function AppLayout() {
  return (
    <div className="grid h-screen grid-cols-[220px_1fr_auto]">
      <SidebarLeft />            {/* 文件树 + 标签云 */}
      <main className="flex min-w-0 flex-col">
        <TopBar />               {/* 模式切换、队列数、同步状态 */}
        <EditorArea />           {/* EditSurface / ReadOnlyView 二选一 */}
        <StatusBar />            {/* 字数·光标·队列进度 */}
      </main>
      <InspectorPanel />         {/* 可折叠，Ctrl+Shift+B */}
    </div>
  );
}
// hooks/useKeyboard.ts 在 App 顶层挂一次全局监听（§9）
```

### 8.2 关键组件与职责

```tsx
// pages/editor/EditorPage.tsx
interface EditorPageProps {
  noteId: string | null;
  mode: 'edit' | 'read';
}
// 编排：load note → EditorSurface(doc, md) → autosave(note:save)

// components/editor/EditorSurface.tsx —— §7 引擎抽象，Props:
// { md: string; editable: boolean;
//   onChange(md: string): void;  onSave(): void; onToggleMode(): void }
// 粘贴/拖放图片：拦截 → window.api('images:add', {noteId, dataUrl}) → 插入返回的 relPath（§4.4）

// components/editor/ReadOnlyView.tsx —— 沉浸阅读 + TOC
// { doc; onJump(headingId) }

// pages/review/ReviewSession.tsx —— 键盘状态机（idle/question/reveal/grade）
// Props: { queue: QueuedCard[]; onExit(results) }
// 子件：QuestionFace / AnswerFace(整题卡=渲染 solutions) / GradeRow(1-4 键提示)

// components/capture/QuickCaptureDialog.tsx —— Ctrl+Shift+N；粘贴 URL → parse:url 预填
// components/search/SearchPalette.tsx —— Ctrl+K；FilterBuilder 支持 AND/OR/难度/标签/上次复习
// pages/dashboard/Dashboard.tsx —— 指标卡 + AccRateChart + WeakTags 高亮（§5.7）
// pages/map/TagMapPage.tsx —— 标签聚合/难度分布
// components/export/ExportDialog.tsx —— 范围(md/pdf/html, 单篇/整集, 是否烘焙调度)
// components/inspector/InspectorPanel.tsx —— FileMeta 编辑、复习统计、RelatedNotes(反链+同标签 Top5)
```

### 8.3 状态管理（zustand slices）

```ts
// store/
noteSlice      // noteId, doc, dirty, saveState
queueSlice     // dueCount, session: {cards, idx, phase, pending}
searchSlice    // query, filters, hits, tags
inspectorSlice // open, selected meta
settingsSlice  // root, newCardLimit, theme, hotkeys
```

原则：编辑器内部 doc 变化只在 EditorSurface（配合 debounce），跨页共享的状态（当前 note、dirty、队列）上 store。

---

## 9. 快捷键实现与冲突策略

分层处理，避免全局监听污染编辑器：

1. **渲染进程全局层**（`useKeyboard`，捕获阶段）：仅在非编辑器聚焦或组合键带 `Ctrl`/`Alt` 时响应，登记表来自 PRD §7。
2. **编辑器（contentEditable）内**：由 Tiptap `Extension: keyboard` 处理单键（`Tab` 缩进等）；文本输入键永不拦截。
3. **复习会话覆盖层**：全屏覆盖，keydown 捕获并 `stopPropagation`，此时编辑器不可达（`1-4/空格/U/Esc` 独占，PRD FR-2.4）。
4. **命令面板**：`Ctrl+K` 优先级最高，面板聚焦时所有单键仅服务面板。

冲突裁决表：

| 冲突对 | 裁决 |
|---|---|
| `Ctrl+B` 全局“折叠栏” vs 编辑器“加粗” | 编辑器内：加粗；全局层只在非编辑态触发折叠——统一不设该全局键，折叠栏改用 `Ctrl+Shift+B` |
| `Ctrl+K` 搜索 vs 编辑器“插入链接” | 编辑器内 Tiptap 拦截为插链接；其余位置开命令面板 |
| `空格` 复习翻卡 vs 输入 | 复习为覆盖层独占；编辑态空格永远是字符 |
| `Esc` 退出复习 vs 关闭浮层 | 按最顶层弹层优先关闭；复习层在顶层时 Esc 先存档退出 |

macOS 适配：`Ctrl→Cmd` 别名层统一映射后注册，避免每处判断平台（§7 PRD 脚注）。

---

## 10. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| SM-2 纯函数 | Vitest | 公式逐档数值断言（对齐 §5.2 表）；属性：EF≥1.3 永不越界、Again 后 reps=0 & EF 不变、interval 单调不减（除 Again）；同输入幂等 |
| markdown-parser | Vitest | 样例 A.1 往返（parse→serialize 相等 modulo 格式）；拆卡 `::` 切分；缺 frontmatter 告警；未知 frontmatter 字段保留 |
| 哈希/URL | Vitest | qhash normalize 稳定性；leetcode URL 多形态抽取；不可信 host 拒绝 |
| queue-manager | Vitest | 到期优先、newLimit 截断、过滤组合、`review:commit` 幂等 |
| note-store | Vitest（临时目录） | 原子写后文件完整；mtime 外部变更优先；孤儿卡回收 |
| search-index | Vitest（内存 DB） | 中文子串命中、AND/OR 组合、LIKE 转义注入安全 |
| IPC 集成 | @testing-library/electron | 关键通道冒烟（list/get/save/review:commit/export） |

约定：服务放 `src/**/services`，测试同目录 `*.test.ts`；纯函数在 `shared` 直接测，不进 Electron 运行时。

---

## 11. 风险与应对

| # | 风险 | 应对 |
|---|---|---|
| R1 | 复习批写 frontmatter 与网盘同步冲突 | 会话结束统一原子写 + mtime 外部优先 + Last-Write-Wins；建议单向 iCloud（PRD R1） |
| R2 | FTS5 unicode61 不切分中文 | `tokenize='trigram'`（子串/中文）；<3 字或乱码回退 `LIKE ESCAPE`（PRD R2） |
| R3 | 拆卡键=问题哈希，改问句丢进度 | normalize 后哈希；孤儿清理延后前台执行；文档明示（PRD R3） |
| R4 | 拆卡/整题并行调度复杂度 | v1 默认整题卡；拆卡 UI 可后置（PRD R4 开放项） |
| R5 | WYSIWYG round-trip 无法全语法覆盖 | 锁定子集 + 未覆盖语法原文保真降级，绝不静默删（§7.3） |
| R6 | better-sqlite3 原生构建跨平台 | electron-builder + `@electron/rebuild` 固定版本与镜像；CI 冒烟（PRD R6） |
| R7 | “正确率”口径（Hard 是否算对） | 初版 Good/Easy 为对、Hard 为勉强；常量集中可调（PRD R7） |
| R8 | FTS 与 `.md` 双写不一致 | 以 `.md` 为权威，启动全量对账 mtime，索引损坏可重建 |
| R9 | 打包后 `<appRoot>` 不可写（系统保护路径） | 默认 `Documents/` 无法落盘 | 便携/可写目录分发优先；不可写时首启引导迁移数据到用户目录并重建索引（PRD R8 / CLAUDE.md「数据与文件存储约定」） |

---

## 附：与 PRD 的一致性索引

| 主题 | PRD | 本方案 |
|---|---|---|
| 难度/标签/元数据字段 | §4.1 FR-1.1、附录 A.1 | §3.1 `FileMeta`、§4.1 schema |
| SM-2 变量初值 | §4.2 FR-2.1 | §3.3 `SchedulingInfo`、§5.2 常量 |
| 评分映射与 EF 公式 | §4.2 FR-2.2 | §5.2 `efAfter` / `schedule` + 演算表 |
| 整题卡/拆解卡 | §4.2 FR-2.3、A.2 | §3.3 `CardRecord`/`EmbeddedCard`、§3.4 键规则 |
| 会话流与进度 | §4.2 FR-2.4、§6.2 | §5.3 状态机 |
| 检索/仪表盘口径 | §4.3 FR-3.1/3.3 | §5.6/5.7 |
| 布局与状态流转 | §6 | §8 |
| 快捷键表 | §7 | §9（冲突表） |
| 双链与阅读 | §4.4 FR-4.1/4.2 | §7.2/7.3、§8.2 Inspector |
