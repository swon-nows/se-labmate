import { useState } from 'react'
import type { CollectStatus, PublicState } from '../../../shared/types'
import { activeSources, sourceErrorText } from '../../../shared/sources'
import { LiveOrb } from '../components/LiveOrb'
import { useLasting } from '../use-lasting'
import { ProfileForm } from './ProfileForm'

interface Props {
  state: PublicState
  status: CollectStatus
  onSaved: () => Promise<void> // 다시 불러온 상태가 도착하면 끝난다
}

// 실패한 출처 줄에서 수집이 300ms 넘게 이어지면 보인다. 자리는 늘 지켜서 줄이 움직이지 않는다.
function Checking({ active }: { active: boolean }): React.JSX.Element {
  const visible = useLasting(active)
  return (
    <span className="checking" role="status">
      {visible && (
        <>
          <LiveOrb size={16} busy />
          Checking
        </>
      )}
    </span>
  )
}

export function Settings({ state, status, onSaved }: Props): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  const [notified, setNotified] = useState(false)
  // 저장이 끝나 다시 불러오면 폼을 새 상태로 다시 만든다(주제어는 서버가 다듬은 값, 키는 새 저장 여부).
  const [formKey, setFormKey] = useState(0)
  const { profile, settings, hasOpenAlexKey } = state
  const sources = profile
    ? activeSources(profile, settings, hasOpenAlexKey, state.boards).map((s) => s.name)
    : []

  return (
    <>
      <ProfileForm
        key={formKey}
        initial={state}
        submitLabel="Save"
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
          Sources
        </h2>
        <ul className="source-list">
          {sources.map((name) => {
            const error = status.errors[name]
            return (
              <li key={name} className="source-row">
                <span className="source-name">{name}</span>
                <span className="source-state">
                  {error === undefined ? 'OK' : `Failed: ${sourceErrorText(name, error)}`}
                </span>
                {error !== undefined && <Checking active={status.running} />}
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() =>
            window.api.testNotification().then(
              () => setNotified(true),
              () => undefined
            )
          }
        >
          Test notification
        </button>
        <p className="saved" role="status">
          {notified ? '알림을 보냈습니다. 보이지 않으면 시스템의 알림 설정을 확인해 주십시오.' : ''}
        </p>
      </section>
    </>
  )
}
