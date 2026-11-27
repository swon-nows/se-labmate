import { useId, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Item } from '../../../shared/types'
import { dday, formatStars, isoDate, paperChips, plainMath, relativeDate } from '../format'

interface Props {
  item: Item
  saved: boolean
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

  const isPaper = item.category === 'paper'
  // 논문 줄은 출처·날짜·일치한 키워드를 아래 정보 줄과 칩으로 보인다. 카테고리는 묶음 제목이 말한다.
  const parts: string[] = []
  if (!isPaper) {
    parts.push(item.source)
    // 한 주 인기 저장소의 날짜는 수집한 시각일 뿐이라 보이지 않는다. 학회 마감 항목은 날짜 대신 마감까지 남은 날을 보인다.
    if (item.deadline !== undefined) parts.push(dday(item.deadline, new Date()))
    else if (item.weekStars === undefined) parts.push(relativeDate(item.date, new Date()))
    if (item.category === 'repo' && item.stars !== undefined)
      parts.push(`★${formatStars(item.stars)}`)
    if (item.weekStars !== undefined) parts.push(`+${formatStars(item.weekStars)} this week`)
    if (item.matched.length > 0) parts.push(`Match: ${item.matched.join(', ')}`)
  }
  const meta = parts.filter(Boolean).join(' · ')
  const venue = item.venue || (item.source === 'arXiv' ? 'Preprint' : '')
  const published = isoDate(item.date)
  const chips = isPaper ? paperChips(item) : []
  // 수식 표기는 논문에만 온다. 뉴스·저장소의 $(금액 등)는 건드리지 않는다.
  const [title, summary] = isPaper
    ? [plainMath(item.title), plainMath(item.summary)]
    : [item.title, item.summary]

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
      data-id={item.id} // 숨김을 취소하면 이 줄의 제목으로 키보드 위치를 돌려준다
      className={leaving ? 'item is-leaving' : 'item'}
      style={{ '--i': p.order } as React.CSSProperties}
    >
      <button
        type="button"
        id={titleId}
        className="item-title"
        onClick={() => void window.api.openItem(item.id).catch(() => undefined)}
      >
        <span className="item-title-text">{title}</span>
      </button>
      {summary && (
        <p className="item-summary" title={isPaper ? summary : undefined}>
          {summary}
        </p>
      )}
      {isPaper && (
        <div className="item-paper-meta">
          <span className="src-badge">{item.source}</span>
          {venue && (
            <span className="venue" title={venue}>
              {venue}
            </span>
          )}
          {published && <span className="pub-date">{published}</span>}
        </div>
      )}
      {chips.length > 0 && (
        <ul className="kw-list" aria-label="Keywords">
          {chips.map((c) => (
            <li key={c.text} className={c.match ? 'kw is-match' : 'kw'}>
              {c.text}
            </li>
          ))}
        </ul>
      )}
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
            {p.saved ? 'Unsave' : 'Save'}
          </button>
          <button
            type="button"
            className="btn-quiet"
            aria-describedby={titleId}
            aria-disabled={busy || undefined}
            onClick={dismiss}
          >
            Hide
          </button>
        </div>
      </div>
    </li>
  )
}
