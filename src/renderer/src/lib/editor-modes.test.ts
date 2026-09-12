import { describe, expect, it } from 'vitest'
import { isSourceEditable, setRead, setSource, toggleRead } from './editor-modes'
import type { EditorModeState } from './editor-modes'

const EDIT: EditorModeState = { mode: 'edit', source: false }
const SOURCE: EditorModeState = { mode: 'edit', source: true }
const READ: EditorModeState = { mode: 'read', source: false }

describe('setRead', () => {
  it('置为阅读态时清掉源码', () => {
    expect(setRead(SOURCE, true)).toEqual(READ)
    expect(setRead(EDIT, true)).toEqual(READ)
  })

  it('退出阅读态回到编辑态且不带源码', () => {
    expect(setRead(READ, false)).toEqual(EDIT)
  })

  it('幂等', () => {
    expect(setRead(setRead(EDIT, true), true)).toEqual(READ)
    expect(setRead(setRead(EDIT, false), false)).toEqual(EDIT)
  })
})

describe('setSource', () => {
  it('置为源码态时强制编辑态', () => {
    expect(setSource(READ, true)).toEqual(SOURCE)
    expect(setSource(EDIT, true)).toEqual(SOURCE)
  })

  it('退出源码态回到编辑态', () => {
    expect(setSource(SOURCE, false)).toEqual(EDIT)
  })
})

describe('toggleRead', () => {
  it('编辑态切到阅读态', () => {
    expect(toggleRead(EDIT)).toEqual(READ)
  })

  it('源码态切到阅读态（源码被关闭）', () => {
    expect(toggleRead(SOURCE)).toEqual(READ)
  })

  it('阅读态切回编辑态', () => {
    expect(toggleRead(READ)).toEqual(EDIT)
  })
})

describe('不变式', () => {
  it('阅读态下 source 恒为 false', () => {
    const states = [setRead(EDIT, true), setRead(SOURCE, true), toggleRead(SOURCE)]
    for (const s of states) {
      if (s.mode === 'read') expect(s.source).toBe(false)
    }
  })

  it('isSourceEditable 仅在编辑态且非源码时为真', () => {
    expect(isSourceEditable(EDIT)).toBe(true)
    expect(isSourceEditable(SOURCE)).toBe(false)
    expect(isSourceEditable(READ)).toBe(false)
  })
})
