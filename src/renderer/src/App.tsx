import { useCallback, useEffect, useState } from 'react'
import type { PublicState } from '../../shared/types'
import { StatusOrb } from './components/StatusOrb'
import { Feed } from './screens/Feed'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'

function App(): React.JSX.Element | null {
  const [state, setState] = useState<PublicState | null>(null)
  const [screen, setScreen] = useState<'feed' | 'settings'>('feed')
  const [count, setCount] = useState(0)

  const [loadFailed, setLoadFailed] = useState(false)

  // 돌려주는 Promise는 거부하지 않는다. 실패하면 loadFailed를 켠다.
  const load = useCallback(
    () =>
      window.api.getState().then(
        (s) => {
          setLoadFailed(false)
          setState(s)
        },
        () => setLoadFailed(true)
      ),
    []
  )
  useEffect(() => {
    void load()
    return window.api.onStatus((status) => setState((s) => (s ? { ...s, status } : s)))
  }, [load])

  if (loadFailed)
    return (
      <main className="content">
        <p className="load-error" role="alert">
          설정을 불러오지 못했습니다.
        </p>
        <button type="button" className="btn" onClick={() => void load()}>
          다시 시도
        </button>
      </main>
    )
  if (!state) return null
  if (!state.profile) return <Onboarding state={state} onSaved={load} />

  const { status } = state
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="app-name">연구비서</h1>
          {count > 0 && <span className="count">{`새 소식 ${count}건`}</span>}
          <div className="topbar-actions">
            <div className="collect-slot">
              {status.running ? (
                <StatusOrb active state="searching" label="수집 중" />
              ) : (
                <button type="button" className="btn" onClick={() => void window.api.refresh()}>
                  새로 고침
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn nav-btn"
              onClick={() => setScreen((s) => (s === 'feed' ? 'settings' : 'feed'))}
            >
              {screen === 'feed' ? '설정' : '피드로'}
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        {screen === 'feed' ? (
          <Feed status={status} onCount={setCount} />
        ) : (
          <Settings state={state} status={status} onSaved={load} />
        )}
      </main>
    </>
  )
}

export default App
