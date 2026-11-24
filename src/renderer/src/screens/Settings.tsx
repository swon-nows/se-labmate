import { useState } from 'react'
import type { CollectStatus, PublicState } from '../../../shared/types'
import { activeSources } from '../../../shared/sources'
import { StatusOrb } from '../components/StatusOrb'
import { ProfileForm } from './ProfileForm'

interface Props {
  state: PublicState
  status: CollectStatus
  onSaved: () => void
}

export function Settings({ state, status, onSaved }: Props): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  const { profile, settings, hasOpenAlexKey } = state
  const sources = profile ? activeSources(profile, settings, hasOpenAlexKey) : []

  return (
    <>
      {/* 입력이 바뀌면 지난 저장 안내를 걷는다. change 이벤트는 위로 올라온다. */}
      <div onChange={() => setSaved(false)}>
        <ProfileForm
          initial={state}
          submitLabel="저장"
          showCategories
          onSaved={() => {
            onSaved()
            setSaved(true)
          }}
        />
      </div>
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
