import { Node, mergeAttributes } from '@tiptap/core'

/**
 * 脚注引用节点（inline atom）。
 * - 渲染：<sup class="ak-footnote" data-fn="n">[^n]</sup>
 * - Markdown 序列化：通过 addStorage().markdown 向 tiptap-markdown 注册，输出 `[^n]`（round-trip 保真）
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { ref: { default: 0 } }
  },

  parseHTML() {
    return [{ tag: 'sup.ak-footnote' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'ak-footnote', 'data-fn': String(node.attrs.ref as number) }), `[^${node.attrs.ref as number}]`]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { ref: number } }): void {
          state.write(`[^${node.attrs.ref}]`)
        }
      }
    }
  }
})
