import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ACTIVE_CATEGORIES, CATEGORY_LABEL } from '../../../shared/types'
import type { Category, CollectStatus, Item } from '../../../shared/types'
import { BigOrb } from '../components/BigOrb'
import { CategoryChips } from '../components/CategoryChips'
import { ItemRow } from '../components/ItemRow'
import { mergeBatch } from '../session'

interface Props {
  status: CollectStatus
  onCount: (n: number) => void
}

type Tab = 'new' | 'past' | 'saved'
const TABS: [Tab, string][] = [
  ['new', '새 소식'],
  ['past', '지난 소식'],
  ['saved', '저장함']
]
const FIRST_ROWS = 5

export function Feed({ status, onCount }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('new')
  const [session, setSession] = useState<Item[]>([]) // 이번에 창을 연 동안 받은 새 소식
  const [expanded, setExpanded] = useState<Category[]>([])
  const [shown, setShown] = useState<Category[]>(ACTIVE_CATEGORIES)
  const [past, setPast] = useState<Item[] | null>(null)
  const [saved, setSaved] = useState<Item[] | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [savedNow, setSavedNow] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [firstRun, setFirstRun] = useState<boolean | null>(null) // 아직 아무것도 모은 적이 없는가

  const take = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    window.api.takeNew().then(
      (groups) => {
        if (groups.length > 0) setFirstRun(false)
        setSession((s) => mergeBatch(s, groups))
      },
      () => undefined
    )
  }, [])

  useEffect(() => {
    window.api.getPast().then(
      (p) => setFirstRun((f) => f ?? p.length === 0),
      () => setFirstRun(false)
    )
    take()
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') return take()
      // 숨겨지면 비워서, 다음에 열 때는 아직 보지 않은 것만 뜬다.
      setSession([])
      setExpanded([])
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [take])

  const wasRunning = useRef(status.running)
  useEffect(() => {
    if (wasRunning.current && !status.running) take()
    wasRunning.current = status.running
  }, [status.running, take])

  const fresh = session.filter((i) => !hidden.has(i.id))
  useEffect(() => onCount(fresh.length), [fresh.length, onCount])

  const openTab = (t: Tab): void => {
    setTab(t)
    if (t === 'past') window.api.getPast().then(setPast, () => undefined)
    if (t === 'saved') window.api.getSaved().then(setSaved, () => undefined)
  }

  const isSaved = (i: Item): boolean => savedNow.get(i.id) ?? i.saved
  const toggleSave = (i: Item): void => {
    const next = !isSaved(i)
    const mark = (v: boolean): void => setSavedNow((m) => new Map(m).set(i.id, v))
    mark(next)
    window.api.setSaved(i.id, next).catch(() => mark(!next))
  }
  const hide = (id: string): void => {
    setHidden((h) => new Set(h).add(id))
    window.api.hide(id).catch(() =>
      setHidden((h) => {
        const back = new Set(h)
        back.delete(id)
        return back
      })
    )
  }
  const row = (i: Item, withCategory: boolean): React.JSX.Element => (
    <ItemRow
      key={i.id}
      item={i}
      saved={isSaved(i)}
      withCategory={withCategory}
      onToggleSave={() => toggleSave(i)}
      onHide={() => hide(i.id)}
    />
  )

  const noCategory = <p className="note muted">표시할 카테고리를 선택해 주십시오.</p>

  const newItems = (): React.ReactNode => {
    if (fresh.length === 0) {
      if (status.running && firstRun === null) return null // 지난 소식을 확인하는 아주 짧은 동안
      return (
        <div className="empty">
          <BigOrb moving={status.running} />
          <p className="muted" role="status">
            {!status.running
              ? '새 소식을 모두 확인했습니다'
              : firstRun
                ? '첫 소식을 모으는 중입니다'
                : '새 소식을 확인하는 중입니다'}
          </p>
        </div>
      )
    }
    if (shown.length === 0) return noCategory
    return ACTIVE_CATEGORIES.filter((c) => shown.includes(c)).map((c) => {
      const items = fresh.filter((i) => i.category === c)
      if (items.length === 0) return null
      const all = expanded.includes(c)
      return (
        <section key={c} className="group">
          <h2 className="section-title">
            {CATEGORY_LABEL[c]} <span className="muted">{items.length}</span>
          </h2>
          <ul className="item-list">
            {(all ? items : items.slice(0, FIRST_ROWS)).map((i) => row(i, false))}
          </ul>
          {!all && items.length > FIRST_ROWS && (
            <button
              type="button"
              className="btn btn-small more"
              onClick={(e) => {
                // 버튼이 사라져도 키보드 위치를 잃지 않게 처음 펼쳐진 줄로 옮긴다.
                const section = e.currentTarget.parentElement
                flushSync(() => setExpanded((x) => [...x, c]))
                section?.querySelectorAll<HTMLElement>('.item-title')[FIRST_ROWS]?.focus()
              }}
            >
              {`더 보기 (${items.length - FIRST_ROWS})`}
            </button>
          )}
        </section>
      )
    })
  }

  const flatItems = (list: Item[] | null, emptyText: string): React.ReactNode => {
    if (list === null) return null
    const items = list.filter((i) => !hidden.has(i.id))
    if (items.length === 0) return <p className="note muted">{emptyText}</p>
    if (shown.length === 0) return noCategory
    return (
      <ul className="item-list flat">
        {items.filter((i) => shown.includes(i.category)).map((i) => row(i, true))}
      </ul>
    )
  }

  return (
    <>
      <div className="tabs" role="group" aria-label="목록">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            className="tab"
            aria-pressed={tab === t}
            onClick={() => openTab(t)}
          >
            {label}
          </button>
        ))}
      </div>
      <CategoryChips
        shown={shown}
        onToggle={(c) => setShown((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}
      />
      {tab === 'new' && newItems()}
      {tab === 'past' && flatItems(past, '지난 소식이 없습니다.')}
      {tab === 'saved' && flatItems(saved, '저장한 항목이 없습니다.')}
    </>
  )
}
