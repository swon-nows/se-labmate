import { useState } from 'react'
import type { CollectStatus, PublicState } from '../../../shared/types'
import { activeSources } from '../../../shared/sources'
import { StatusOrb } from '../components/StatusOrb'
import { ProfileForm } from './ProfileForm'

interface Props {
  state: PublicState
  status: CollectStatus
  onSaved: () => Promise<void> // 다시 불러온 상태가 도착하면 끝난다
}

export function Settings({ state, status, onSaved }: Props): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  // 저장이 끝나 다시 불러오면 폼을 새 상태로 다시 만든다(주제어는 서버가 다듬은 값, 키는 새 저장 여부).
  const [formKey, setFormKey] = useState(0)
  const { profile, settings, hasOpenAlexKey } = state
  const sources = profile ? activeSources(profile, settings, hasOpenAlexKey) : []

  return (
    <>
      <ProfileForm
        key={formKey}
        initial={state}
        submitLabel="저장"
        showCategories
        onSubmitStart={() => setSaved(false)}
        onSaved={async () => {
          await onSaved()
          setFormKey((k) => k + 1)
          setSaved(true)
        }}
      />
      <p className="saved" role="status">
        {saved ? '저장했습니다.' : ''}
      </p>

      <section className="sources" aria-labelledby="sources-title">
        <h2 id="sources-title" className="section-title">
          출처 상태
        </h2>
        <ul className="source-list">
          {sources.map((name) => {
            const error = status.errors[name]
            return (
              <li key={name} className="source-row">
                <span className="source-name">{name}</span>
                <span className="source-state">
                  {error === undefined ? '정상' : `실패: ${error}`}
                </span>
                {error !== undefined && (
                  <StatusOrb active={status.running} state="retrying" label="확인 중" />
                )}
              </li>
            )
          })}
        </ul>
        <button type="button" className="btn" onClick={() => void window.api.testNotification()}>
          알림 테스트
        </button>
      </section>
    </>
  )
}
