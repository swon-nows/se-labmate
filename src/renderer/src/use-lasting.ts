import { useEffect, useState } from 'react'

// active가 ms 넘게 이어질 때만 참이다. 짧은 수집에 글자가 깜빡이지 않게 한다.
export function useLasting(active: boolean, ms = 300): boolean {
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setWaited(true), ms)
    return () => {
      clearTimeout(timer)
      setWaited(false)
    }
  }, [active, ms])
  return active && waited
}
