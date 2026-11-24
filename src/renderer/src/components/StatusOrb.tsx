import { useEffect, useState } from 'react'
import { Orb } from '@yogesharc/thinking-orbs'

const SHOW_AFTER_MS = 300

interface Props {
  active: boolean
  state: 'searching' | 'retrying'
  label: string
}

// active가 300ms 넘게 이어질 때만 보인다. 보이지 않을 때도 같은 너비를 차지해서 둘레가 움직이지 않는다.
export function StatusOrb({ active, state, label }: Props): React.JSX.Element {
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setWaited(true), SHOW_AFTER_MS)
    return () => {
      clearTimeout(timer)
      setWaited(false)
    }
  }, [active])
  const visible = active && waited

  return (
    <span className={visible ? 'status-orb' : 'status-orb is-hidden'} role="status">
      <span className="status-orb-mark">
        {visible && <Orb size={18} state={state} label={label} />}
      </span>
      <span className="status-orb-label" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
