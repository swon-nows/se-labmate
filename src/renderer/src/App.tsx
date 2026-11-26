import { useCallback, useEffect, useState } from 'react'
import { activeSources } from '../../shared/sources'
import { CATEGORIES } from '../../shared/types'
import type { PublicState } from '../../shared/types'
import { LiveOrb } from './components/LiveOrb'
import { Feed } from './screens/Feed'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { useLasting } from './use-lasting'

// 오브와 글자가 든 한 버튼. 너비가 정해져 있어 수집이 시작·종료돼도 위쪽 줄이 움직이지 않는다.
function RefreshButton({ running }: { running: boolean }): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const collecting = useLasting(running)
  return (
    <button
      type="button"
      className="btn refresh-btn"
      aria-disabled={running || undefined}
      onClick={() => {
        if (!running) void window.api.refresh()
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <LiveOrb size={22} busy={running} hover={hover} />
      <span>{collecting ? 'Collecting' : 'Refresh'}</span>
    </button>
  )
}

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
    const offStatus = window.api.onStatus((status) => setState((s) => (s ? { ...s, status } : s)))
    const offUpdate = window.api.onUpdate((update) => setState((s) => (s ? { ...s, update } : s)))
    return () => {
      offStatus()
      offUpdate()
    }
  }, [load])
  // 창을 숨기거나 내리면 피드로 돌아간다. 다음에 열 때(알림을 눌렀을 때 등) 새 소식부터 보인다.
  useEffect(
    () =>
      window.api.onWindowVisible((visible) => {
        if (!visible) setScreen('feed')
      }),
    []
  )

  if (loadFailed)
    return (
      <main className="content">
        <p className="load-error" role="alert">
          설정을 불러오지 못했습니다.
        </p>
        <button type="button" className="btn" onClick={() => void load()}>
          Retry
        </button>
      </main>
    )
  if (!state) return null
  if (!state.profile) return <Onboarding state={state} onSaved={load} />

  const { status } = state
  const sources = activeSources(state.profile, state.settings, state.hasOpenAlexKey, state.boards)
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="app-name">SE LabMate</h1>
          {count > 0 && <span className="count">{`${count} new`}</span>}
          <div className="topbar-actions">
            <RefreshButton running={status.running} />
            <button
              type="button"
              className="btn nav-btn"
              onClick={() => setScreen((s) => (s === 'feed' ? 'settings' : 'feed'))}
            >
              {screen === 'feed' ? 'Settings' : 'Back'}
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        {state.update && (
          <div className="update-bar" role="status">
            <span>{`새 버전이 나왔습니다 (${state.update.version}).`}</span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void window.api.openUpdate()}
            >
              Download
            </button>
          </div>
        )}
        {/* 설정을 다녀와도 이번 새 소식 목록이 남도록 피드는 숨기기만 한다. */}
        <div hidden={screen !== 'feed'}>
          <Feed
            status={status}
            enabled={state.settings.enabled}
            categories={CATEGORIES.filter((c) => sources.some((s) => s.category === c))}
            sources={sources.map((s) => s.name)}
            active={screen === 'feed'}
            onCount={setCount}
            onOpenSettings={() => setScreen('settings')}
          />
        </div>
        {screen === 'settings' && <Settings state={state} status={status} onSaved={load} />}
      </main>
    </>
  )
}

export default App
