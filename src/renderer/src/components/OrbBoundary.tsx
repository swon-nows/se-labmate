import { Component, type ReactNode } from 'react'

// 장식(오브)이 실패해도(예: WebGL2 없음) 창이 비지 않게 그 자리만 비운다. 옆의 글자는 남는다.
export class OrbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
