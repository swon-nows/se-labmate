import { useId, useState } from 'react'
import { flushSync } from 'react-dom'
import { CATEGORY_LABEL } from '../../../shared/types'
import type { Item } from '../../../shared/types'
import { formatStars, relativeDate } from '../format'

interface Props {
  item: Item
  saved: boolean
  withCategory: boolean // 지난 소식·저장함처럼 카테고리 제목이 없는 목록
  order: number // 들어올 때의 지연 순서 (0~4)
  onToggleSave: () => Promise<void>
  onHide: () => void
}

export function ItemRow(p: Props): React.JSX.Element {
  const { item } = p
  const titleId = useId()
  const [pending, setPending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const busy = pending || leaving

  const parts = [
    p.withCategory ? CATEGORY_LABEL[item.category] : '',
    item.source,
    relativeDate(item.date, new Date())
  ]
  if (item.category === 'repo' && item.stars !== undefined)
    parts.push(`★${formatStars(item.stars)}`)
  if (item.matched.length > 0) parts.push(`일치: ${item.matched.join(', ')}`)
  const meta = parts.filter(Boolean).join(' · ')

  const toggleSave = (): void => {
    if (busy) return
    setPending(true)
    void p.onToggleSave().finally(() => setPending(false))
  }
  const dismiss = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (busy) return
    setLeaving(true)
    const li = e.currentTarget.closest('li')
    const wait = window.matchMedia('(prefers-reduced-motion: no-preference)').matches ? 160 : 0
    // 흐려진 뒤에 뺀다. 키보드 위치는 이웃 줄의 제목, 마지막 줄이었으면 지금 탭으로 옮긴다.
    setTimeout(() => {
      const near = li?.nextElementSibling ?? li?.previousElementSibling
      flushSync(p.onHide)
      const next =
        near?.querySelector<HTMLElement>('.item-title') ??
        document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      next?.focus()
    }, wait)
  }

  return (
    <li
      className={leaving ? 'item is-leaving' : 'item'}
      style={{ '--i': p.order } as React.CSSProperties}
    >
      <button
        type="button"
        id={titleId}
        className="item-title"
        onClick={() => void window.api.openItem(item.id).catch(() => undefined)}
      >
        <span className="item-title-text">{item.title}</span>
      </button>
      {item.summary && <p className="item-summary">{item.summary}</p>}
      <div className="item-foot">
        <p className="item-meta" title={meta}>
          {meta}
        </p>
        <div className="item-actions">
          <button
            type="button"
            className="btn-quiet save-btn"
            aria-describedby={titleId}
            aria-disabled={busy || undefined}
            onClick={toggleSave}
          >
            {p.saved ? '저장 취소' : '저장'}
          </button>
          <button
            type="button"
            className="btn-quiet"
            aria-describedby={titleId}
            aria-disabled={busy || undefined}
            onClick={dismiss}
          >
            관심 없음
          </button>
        </div>
      </div>
    </li>
  )
}
