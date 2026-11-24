import { useEffect, useState } from 'react'
import type { PublicState } from '../../shared/types'

// 임시 화면: Task 9가 바꾼다.
function App(): React.JSX.Element {
  const [state, setState] = useState<PublicState | null>(null)
  useEffect(() => {
    window.api.getState().then(setState)
  }, [])
  return (
    <>
      <h1>연구비서</h1>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </>
  )
}

export default App
