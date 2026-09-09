# 脚注节点化（A）— 分轮实施方案

> 背景：tiptap-markdown 0.9 序列化器为固定节点集，直接塞自定义 footnote 节点会导致保存丢脚注。
> 结论：编辑器 Markdown 读写需迁移到**可扩展 ProseMirror markdown 管线**后再挂 footnote 规则。
>
> **实施更新**：探查 `tiptap-markdown` 0.9 后确认它支持「扩展以 `addStorage().markdown` 注册自定义节点序列化」（TaskItem 同款机制），**无需整体迁移 md 管线**。
> 已落地：自定义 `footnote` inline atom 节点（`ref` 编号，渲染 `<sup class=ak-footnote>`），经 addStorage 注册序列化为 `[^n]`；载入时把正文文本 `[^n]` 幂等转回节点；插入命令创建节点并自动追加文末定义；E2E 验证「插入→保存→源文件含 [^1]」。

## 现状
- 脚注当前为**文本级**：插入自动编号 `[^n]` + 文末定义，round-trip 无损、导出/检索/源码模式可用。
- 纯函数工具层已就绪：`src/shared/utils/footnotes.ts`（扫描 refs/defs、代码围栏跳过、连续重排），见单测。

## 轮次

### R1（进行中）工具层与方案文档
- footnotes 纯函数 + 单测 ✅
- 本文档（注册点、风险、回归面）✅

### R2 可扩展 md 管线接入
目标：让「解析 md → PM 节点」与「PM 节点 → md」都由我们可控的注册表驱动，替换 EditorSurface 中 `tiptap-markdown` 的 parse/serialize 使用点。
- 用 `prosemirror-markdown` 的 schema/规则机制，或自建注册表：`nodeName → { tokenHandlers/parse, serialize }`、`mark → { open, close }`。
- 覆盖当前编辑器全部节点/标记（标题/段落/列表/任务/表格/代码/引用/图片/公式/行内格式）并保持输出与现有 md 一致。
- 回归面：保存 round-trip、阅读/编辑/源码/检索/导出、E2E 与 34+ 单测全绿。

### R3 footnote 节点与交互
- 自定义 inline `footnote` 节点（`ref:number`）：上标渲染、引用→定义点击跳转、悬停高亮。
- 定义区：正文末尾 `## 脚注` 自动收纳/维护。
- 编辑命令：插入脚注（编号自增，重排用 R1 工具）。
- round-trip：R2 管线中注册 footnote 的 parse（`[^n]`→节点）与 serialize（节点→`[^n]`）；已有纯文本脚注载入时自动识别为节点。

## 风险与护栏
- 主路径迁移期间：保留可回退点（每轮 commit）；先用单测锁定 round-trip，再动 UI。
- 冲突项：与 tiptap-markdown 并存期避免双重解析；迁移后移除 Markdown 扩展依赖（或按需保留于导出链路外）。
- 交互 DOM 层（callout 的 MutationObserver）仍适用 footnote 渲染增强，但不承担数据保真。
