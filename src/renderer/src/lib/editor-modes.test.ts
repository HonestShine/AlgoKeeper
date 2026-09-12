import { describe, expect, it } from 'vitest'
import { isSourceEditable, setRead, setSource, toggleRead } from './editor-modes'
import type { EditorModeState } from './editor-modes'

const EDIT: EditorModeState = { mode: 'edit', source: false }
const SOURCE: EditorModeState = { mode: 'edit', source: true }
const READ: EditorModeState = { mode: 'read', source: false }

describe('setRead', () => {
  it('置为阅读态', () => {
    expect(setRead(true)).toEqual(READ)
  })

  it('退出阅读态回到编辑态且不带源码', () => {
    expect(setRead(false)).toEqual(EDIT)
  })
})

describe('setSource', () => {
  it('置为源码态时强制编辑态', () => {
    expect(setSource(true)).toEqual(SOURCE)
    expect(setSource(true).mode).toBe('edit')
  })

  it('退出源码态回到编辑态', () => {
    expect(setSource(false)).toEqual(EDIT)
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

  it('往返回到原状态', () => {
    expect(toggleRead(toggleRead(EDIT))).toEqual(EDIT)
    expect(toggleRead(toggleRead(READ))).toEqual(READ)
  })
})

describe('不变式', () => {
  it('阅读态下 source 恒为 false', () => {
    expect(setRead(true)).toEqual(READ)
    expect(toggleRead(SOURCE)).toEqual(READ)
    expect(setRead(true).source).toBe(false)
  })

  it('isSourceEditable 仅在编辑态且非源码时为真', () => {
    expect(isSourceEditable(EDIT)).toBe(true)
    expect(isSourceEditable(SOURCE)).toBe(false)
    expect(isSourceEditable(READ)).toBe(false)
  })

  it('类型合法但不可达的状态被正确归一化', () => {
    const ILLEGAL: EditorModeState = { mode: 'read', source: true }
    expect(isSourceEditable(ILLEGAL)).toBe(false)
    expect(setRead(false)).toEqual(EDIT)
    expect(setSource(true)).toEqual(SOURCE)
    expect(toggleRead(ILLEGAL)).toEqual(EDIT)
  })
})
