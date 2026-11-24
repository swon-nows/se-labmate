import type { CollectStatus } from '../../../shared/types'

interface Props {
  status: CollectStatus
  onCount: (n: number) => void
}

// 임시 자리: 다음 단계에서 목록으로 바뀐다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Feed(_props: Props): React.JSX.Element {
  return <p className="muted">피드는 다음 단계에서 표시됩니다.</p>
}
