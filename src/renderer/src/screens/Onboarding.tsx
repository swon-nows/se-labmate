import type { PublicState } from '../../../shared/types'
import { ProfileForm } from './ProfileForm'

export function Onboarding({
  state,
  onSaved
}: {
  state: PublicState
  onSaved: () => Promise<void>
}): React.JSX.Element {
  return (
    <main className="content">
      <h1 className="page-title">Welcome to SE LabMate</h1>
      <p className="lead">
        관심 주제를 입력하면 새 논문, 저장소, 뉴스를 모아 정해 둔 시각에 알려 드립니다.
      </p>
      <ProfileForm initial={state} onSaved={onSaved} submitLabel="Start" />
      <p className="hint after-form">
        학교·학회 게시판은 시작한 뒤 Settings에서 추가할 수 있습니다.
      </p>
    </main>
  )
}
