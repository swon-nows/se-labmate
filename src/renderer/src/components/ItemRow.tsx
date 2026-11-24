import { useId } from 'react'
import { flushSync } from 'react-dom'
import { CATEGORY_LABEL } from '../../../shared/types'
import type { Item } from '../../../shared/types'
import { formatStars, relativeDate } from '../format'

interface Props {
  item: Item
  saved: boolean
  withCategory: boolean // 지난 소식·저장함처럼 카테고리 제목이 없는 목록
  onToggleSave: () => void
  onHide: () => void
}

export function ItemRow({
  item,
  saved,
  withCategory,
  onToggleSave,
  onHide
}: Props): React.JSX.Element {
  const parts = [
    withCategory ? CATEGORY_LABEL[item.category] : '',
    item.source,
    relativeDate(item.date, new Date())
  ]
  if (item.category === 'repo' && item.stars !== undefined)
    parts.push(`★${formatStars(item.stars)}`)
  const titleId = useId()
  const hideRow = (e: React.MouseEvent<HTMLButtonElement>): void => {
    // 줄이 사라져도 키보드 위치를 잃지 않게 이웃 줄의 제목으로 옮긴다.
    const li = e.currentTarget.closest('li')
    const near = li?.nextElementSibling ?? li?.previousElementSibling
    flushSync(onHide)
    near?.querySelector<HTMLElement>('.item-title')?.focus()
  }
  return (
    <li className="item">
      <button
        type="button"
        id={titleId}
        className="item-title"
        onClick={() => void window.api.openItem(item.id).catch(() => undefined)}
      >
        {item.title}
      </button>
      <p className="item-meta">{parts.filter(Boolean).join(' · ')}</p>
      {item.summary && <p className="item-summary">{item.summary}</p>}
      {item.matched.length > 0 && <p className="item-meta">{`일치: ${item.matched.join(', ')}`}</p>}
      <div className="item-actions">
        <button
          type="button"
          className="btn btn-small"
          aria-describedby={titleId}
          onClick={onToggleSave}
        >
          {saved ? '저장 취소' : '저장'}
        </button>
        <button
          type="button"
          className="btn btn-small"
          aria-describedby={titleId}
          onClick={hideRow}
        >
          관심 없음
        </button>
      </div>
    </li>
  )
}
