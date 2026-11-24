import { useSyncExternalStore } from 'react'
import Orb from './Orb/Orb'
import { OrbBoundary } from './OrbBoundary'

const dark = window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (cb: () => void): (() => void) => {
  dark.addEventListener('change', cb)
  return () => dark.removeEventListener('change', cb)
}
// 밝은 배경에서 오브는 상자 전체를 이 색으로 칠하므로 페이지 배경(--bg)과 정확히 같아야 한다.
const pageBackground = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()

export function BigOrb({ moving }: { moving: boolean }): React.JSX.Element {
  const background = useSyncExternalStore(subscribe, pageBackground)
  return (
    <div className="big-orb" aria-hidden="true">
      <OrbBoundary>
        <Orb
          paused={!moving}
          followCursor={false}
          clickPulse={false}
          rotateOnHover={false}
          hoverIntensity={0}
          backgroundColor={background}
        />
      </OrbBoundary>
    </div>
  )
}
