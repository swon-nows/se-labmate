import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ACTIVE_CATEGORIES, CATEGORY_LABEL } from '../../../shared/types'
import type { Category, CollectStatus, Item } from '../../../shared/types'
import { CategoryChips } from '../components/CategoryChips'
import { ItemRow } from '../components/ItemRow'
import { LiveOrb } from '../components/LiveOrb'
import { mergeBatch } from '../session'

interface Props {
  status: CollectStatus
  enabled: Record<Category, boolean> // 설정에서 끈 카테고리는 바로 사라진다
  onCount: (n: number) => void
}

type Tab = 'new' | 'past' | 'saved'
const TABS: [Tab, string][] = [
  ['new', '새 소식'],
  ['past', '지난 소식'],
  ['saved', '저장함']
]
const FIRST_ROWS = 5

export function Feed({ status, enabled, onCount }: Props): React.JSX.Element {
  const ids = useId()
  const [tab, setTab] = useState<Tab>('new')
  const [session, setSession] = useState<Item[]>([]) // 이번에 창을 연 동안 받은 새 소식
  // 이번 보기에서 takeNew가 답했는가. 답하기 전에는 "모두 확인했습니다"라고 말하지 않는다.
  const [load, setLoad] = useState<'pending' | 'done' | 'failed'>('pending')
  const [expanded, setExpanded] = useState<Category[]>([])
  const [shown, setShown] = useState<Category[]>(ACTIVE_CATEGORIES)
  const [past, setPast] = useState<Item[] | null>(null)
  const [saved, setSaved] = useState<Item[] | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [savedNow, setSavedNow] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [firstRun, setFirstRun] = useState<boolean | null>(null) // 아직 아무것도 모은 적이 없는가
  const seq = useRef(0) // 가장 최근 takeNew만 load를 정한다
  const windowVisible = useRef<boolean | null>(null)

  const take = useCallback(() => {
    const n = ++seq.current
    const settle = (result: 'done' | 'failed'): void => {
      // 창이 보이지 않을 때 받은 빈 답은 이번 보기의 답이 아니다.
      if (n === seq.current && windowVisible.current !== false) setLoad(result)
    }
    window.api.takeNew().then(
      (groups) => {
        if (groups.length > 0) setFirstRun(false)
        setSession((s) => mergeBatch(s, groups))
        settle('done')
      },
      () => settle('failed')
    )
  }, [])

  useEffect(() => {
    window.api.getPast().then(
      (p) => setFirstRun((f) => f ?? p.length === 0),
      () => setFirstRun(false)
    )
    take()
    return window.api.onWindowVisible((visible) => {
      windowVisible.current = visible
      if (visible) {
        setLoad('pending')
        take()
        return
      }
      // 창을 숨기거나 내리면 비워서, 다음에 열 때는 아직 보지 않은 것만 뜬다.
      seq.current++
      setSession([])
      setExpanded([])
      setLoad('pending')
    })
  }, [take])

  const wasRunning = useRef(status.running)
  useEffect(() => {
    if (wasRunning.current && !status.running) take()
    wasRunning.current = status.running
  }, [status.running, take])

  const fresh = session.filter((i) => !hidden.has(i.id) && enabled[i.category])
  useEffect(() => {
    onCount(fresh.length)
  }, [fresh.length, onCount])

  const categories = ACTIVE_CATEGORIES.filter((c) => enabled[c])
  const visibleCats = categories.filter((c) => shown.includes(c))

  const openTab = (t: Tab): void => {
    setTab(t)
    if (t === 'past') window.api.getPast().then(setPast, () => undefined)
    if (t === 'saved') window.api.getSaved().then(setSaved, () => undefined)
  }

  const isSaved = (i: Item): boolean => savedNow.get(i.id) ?? i.saved
  const toggleSave = (i: Item): Promise<void> => {
    const next = !isSaved(i)
    const mark = (v: boolean): void => setSavedNow((m) => new Map(m).set(i.id, v))
    mark(next)
    return window.api.setSaved(i.id, next).catch(() => mark(!next))
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
  // order: 들어오는 줄의 지연 순서. 앞 다섯 줄만 20ms씩 늦춘다.
  const row = (i: Item, withCategory: boolean, order: number): React.JSX.Element => (
    <ItemRow
      key={i.id}
      item={i}
      saved={isSaved(i)}
      withCategory={withCategory}
      order={Math.min(4, order)}
      onToggleSave={() => toggleSave(i)}
      onHide={() => hide(i.id)}
    />
  )

  const noCategory = <p className="note muted">표시할 카테고리를 선택해 주십시오.</p>
  const noMatch = <p className="note muted">선택한 카테고리에 표시할 항목이 없습니다.</p>

  const newItems = (): React.ReactNode => {
    if (fresh.length === 0) {
      if (load === 'pending') return null
      if (status.running && firstRun === null) return null // 지난 소식을 확인하는 아주 짧은 동안
      if (load === 'failed' && !status.running)
        return (
          <div className="note">
            <p className="muted" role="alert">
              새 소식을 불러오지 못했습니다.
            </p>
            <button
              type="button"
              className="btn btn-small retry"
              onClick={() => {
                setLoad('pending')
                take()
              }}
            >
              다시 시도
            </button>
          </div>
        )
      return (
        <div className="empty">
          <LiveOrb
            size={200}
            busy={status.running}
            onActivate={() => void window.api.refresh()}
            label="새로 고침"
          />
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
    if (visibleCats.length === 0) return noCategory
    const groups = visibleCats
      .map((c) => [c, fresh.filter((i) => i.category === c)] as const)
      .filter(([, items]) => items.length > 0)
    if (groups.length === 0) return noMatch
    return groups.map(([c, items]) => {
      const all = expanded.includes(c)
      return (
        <section key={c} className="feed-group">
          <h2 className="feed-group-title">
            {CATEGORY_LABEL[c]} <span className="muted">{items.length}</span>
          </h2>
          <ul className="item-list">
            {(all ? items : items.slice(0, FIRST_ROWS)).map((i, k) =>
              row(i, false, k < FIRST_ROWS ? k : k - FIRST_ROWS)
            )}
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

  // except: 지난 소식에서는 이번 새 소식 목록에 아직 있는 항목을 뺀다.
  const flatItems = (
    list: Item[] | null,
    emptyText: string,
    except?: ReadonlySet<string>
  ): React.ReactNode => {
    if (list === null) return null
    const items = list.filter((i) => !hidden.has(i.id) && enabled[i.category] && !except?.has(i.id))
    if (items.length === 0) return <p className="note muted">{emptyText}</p>
    if (visibleCats.length === 0) return noCategory
    const rows = items.filter((i) => shown.includes(i.category))
    if (rows.length === 0) return noMatch
    return <ul className="item-list flat">{rows.map((i, k) => row(i, true, k))}</ul>
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="보기">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            id={`${ids}-${t}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t}
            onClick={() => openTab(t)}
          >
            {label}
          </button>
        ))}
      </div>
      <CategoryChips
        categories={categories}
        shown={shown}
        onToggle={(c) => setShown((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}
      />
      <div role="tabpanel" aria-labelledby={`${ids}-${tab}`}>
        {tab === 'new' && newItems()}
        {tab === 'past' &&
          flatItems(past, '지난 소식이 없습니다.', new Set(session.map((i) => i.id)))}
        {tab === 'saved' && flatItems(saved, '저장한 항목이 없습니다.')}
      </div>
    </>
  )
}
