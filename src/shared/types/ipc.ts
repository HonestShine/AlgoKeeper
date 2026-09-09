/**
 * Renderer 通过 window.api 访问的桥类型。
 * M0 仅含冒烟通道；完整通道契约在实现各模块（M1+）时逐条追加，
 * 保持「所有 IPC 通信在此有类型」的规范。
 */
export interface RendererApi {
  /** 连通性冒烟测试 */
  ping(): Promise<string>
  versions: {
    electron: string
    node: string
  }
}

export type IpcChannel = keyof RendererApi
