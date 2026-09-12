import { describe, expect, it } from 'vitest'
import { EditorState, Transaction } from '@codemirror/state'
import { history, undo, undoDepth } from '@codemirror/commands'

/**
 * F3 回归：程序性全量替换（切笔记 / 外部回灌）绝不能进 undo 历史。
 *
 * 背景：`HistEvent.fromTransaction` 对任何非空 changes 都生成可撤销事件，
 * 且 `addChanges` 在 `newGroupDelay`（500ms）内且相邻时会把后续键入并入同一组。
 * 于是「程序性替换 + 500ms 内敲字 + 一次 Ctrl+Z」会让文档整篇回退成**上一份文档**的正文；
 * 而 `save()` 用的是 `active.md` + 当前 `noteId` → 会把上一份正文写进当前笔记文件。
 *
 * 这里用与 SourceEditor 完全相同的 dispatch 形状（含 annotation）复现该场景。
 * 去掉 `annotations: [Transaction.addToHistory.of(false)]` 后，本用例必须失败。
 */
const OLD_DOC = '# 上一篇笔记 AKPREVIOUS\n正文...\n'
const NEW_DOC = '# 当前笔记 AKCURRENT\n正文...\n'

function makeState(): EditorState {
  return EditorState.create({ doc: OLD_DOC, extensions: [history()] })
}

/** undo 是 StateCommand：{state, dispatch}，这里包一层返回新 state */
function applyUndo(state: EditorState): EditorState {
  let next = state
  undo({
    state,
    dispatch: (tr) => {
      next = tr.state
    }
  })
  return next
}

/** 与 SourceEditor 中一致的程序性全量替换 */
function programmaticReplace(state: EditorState, insert: string, annotated: boolean): EditorState {
  const cur = state.doc.toString()
  return state.update({
    changes: { from: 0, to: cur.length, insert },
    ...(annotated ? { annotations: [Transaction.addToHistory.of(false)] } : {})
  }).state
}

describe('SourceEditor 程序性替换与 undo 历史', () => {
  it('带 annotation：一次 Ctrl+Z 只撤销用户键入，不回退成上一份文档', () => {
    let state = makeState()
    state = programmaticReplace(state, NEW_DOC, true)
    // 500ms 内的用户键入（会被并入同一 undo 组，正是危险窗口）
    state = state.update({ changes: { from: state.doc.length, insert: 'X' } }).state

    expect(state.doc.toString()).toBe(`${NEW_DOC}X`)

    state = applyUndo(state)
    const after = state.doc.toString()
    expect(after).not.toContain('AKPREVIOUS')
    expect(after).toContain('AKCURRENT')
    expect(after).toBe(NEW_DOC)
  })

  it('反例（不加 annotation 即旧行为）：Ctrl+Z 会回退成上一份文档 —— 用于确认本用例真的能抓到这个 bug', () => {
    let state = makeState()
    state = programmaticReplace(state, NEW_DOC, false)
    state = state.update({ changes: { from: state.doc.length, insert: 'X' } }).state

    state = applyUndo(state)
    expect(state.doc.toString()).toContain('AKPREVIOUS')
  })

  it('用户键入仍可撤销（annotation 只排除那一次替换，没有关掉整条历史）', () => {
    let state = makeState()
    state = programmaticReplace(state, NEW_DOC, true)
    // 程序性替换被排除在历史之外 → 此刻没有可撤销项
    expect(undoDepth(state)).toBe(0)

    // 用户键入照常入栈
    state = state.update({ changes: { from: state.doc.length, insert: 'USER' } }).state
    expect(undoDepth(state)).toBeGreaterThan(0)

    state = applyUndo(state)
    expect(state.doc.toString()).toBe(NEW_DOC)
  })
})
