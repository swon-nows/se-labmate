import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { allFailed } from '../../../shared/sources'
import { CATEGORIES, CATEGORY_LABEL } from '../../../shared/types'
import type { Category, CollectStatus, Item } from '../../../shared/types'
import { CategoryChips } from '../components/CategoryChips'
import { ItemRow } from '../components/ItemRow'
import { LiveOrb } from '../components/LiveOrb'
import { feedCategories } from '../format'
import { mergeBatch } from '../session'

interface Props {
  status: CollectStatus
  enabled: Record<Category, boolean> // 설정에서 끈 카테고리는 바로 사라진다
  categories: Category[] // 켜진 출처가 있는 카테고리(칩에 보인다)
  sources: string[] // 켜진 출처(activeSources). 모두 실패했는지 보는 데 쓴다
  active: boolean // 피드 화면인가(설정을 연 동안 false)
  onCount: (n: number) => void
  onOpenSettings: () => void // 첫 수집에서 아무것도 못 찾았을 때 키워드를 고치러 간다
}

type Tab = 'new' | 'past' | 'saved'
const TABS: [Tab, string][] = [
  ['new', 'New'],
  ['past', 'Past'],
  ['saved', 'Saved']
]
const FIRST_ROWS = 5

export function Feed({
  status,
  enabled,
  categories,
  sources,
  active,
  onCount,
  onOpenSettings
}: Props): React.JSX.Element {
  const ids = useId()
  const [tab, setTab] = useState<Tab>('new')
  const [session, setSession] = useState<Item[]>([]) // 이번에 창을 연 동안 받은 새 소식
  // 이번 보기에서 takeNew가 답했는가. 답하기 전에는 "모두 확인했습니다"라고 말하지 않는다.
  const [load, setLoad] = useState<'pending' | 'done' | 'failed'>('pending')
  const [expanded, setExpanded] = useState<string[]>([]) // 펼친 묶음: '<탭>:<카테고리>'
  const [shown, setShown] = useState<Category[]>(CATEGORIES)
  const [past, setPast] = useState<Item[] | null | 'failed'>(null)
  const [saved, setSaved] = useState<Item[] | null | 'failed'>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [savedNow, setSavedNow] = useState<ReadonlyMap<string, boolean>>(new Map())
  // 아직 아무것도 모은 적이 없는가: 이번 새 소식 목록이 비었고 지난 소식도 없다.
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const seq = useRef(0) // 가장 최근 takeNew만 load를 정한다
  const windowVisible = useRef<boolean | null>(null)
  const sessionEmpty = useRef(true) // 이번 새 소식 목록이 비었는가(take 시작 때 읽는다)
  const [visible, setVisible] = useState(false)
  const [visit, setVisit] = useState(0) // 창이 보인다는 알림을 받을 때마다 는다

  const take = useCallback(() => {
    const n = ++seq.current
    // 목록이 빈 채로 다시 받으러 가면 답이 올 때까지 "모두 확인했습니다"를 띄우지 않는다.
    if (sessionEmpty.current) setLoad('pending')
    const settle = (result: 'done' | 'failed'): void => {
      // 창이 보인다고 알기 전에 받은 답(숨긴 채 시작, 숨긴 동안의 수집)은 이번 보기의 답이 아니다.
      if (n === seq.current && windowVisible.current === true) setLoad(result)
    }
    window.api.takeNew().then(
      (groups) => {
        if (groups.length > 0) {
          setFirstRun(false)
          sessionEmpty.current = false
        }
        // 창을 숨긴 뒤 온 답도 (비운) 목록에 넣는다: 이미 확인함이 된 항목이라 버리면 보이지 않은 채 지난 소식으로 간다.
        setSession((s) => mergeBatch(s, groups))
        settle('done')
      },
      () => settle('failed')
    )
  }, [])

  // 지난 소식은 수집이 시작·끝날 때와 창이 보일 때 다시 본다. 늦게 온 빈 답이 이미 받은 새 소식을 덮지 않게 sessionEmpty도 함께 본다.
  useEffect(() => {
    window.api.getPast().then(
      (p) => setFirstRun(p.length === 0 && sessionEmpty.current),
      () => setFirstRun(false)
    )
  }, [status.running, visit])

  useEffect(() => {
    return window.api.onWindowVisible((v) => {
      windowVisible.current = v
      setVisible(v)
      if (v) return setVisit((n) => n + 1)
      // 창을 숨기거나 내리면 비우고 새 소식 탭·칩 모두 켬으로 돌린다. 다음에 열 때는 아직 보지 않은 것만 뜬다.
      seq.current++
      sessionEmpty.current = true
      setSession([])
      setExpanded([])
      setLoad('pending')
      setTab('new')
      setShown(CATEGORIES)
    })
  }, [])

  // takeNew는 받은 항목을 확인함으로 바꾸므로, 새 소식 목록이 실제로 보일 때만 부른다:
  // 그렇게 될 때마다, 보이는 동안 창이 보인다는 알림이 다시 올 때마다, 보이는 동안 수집이 끝날 때마다.
  const showingNew = visible && active && tab === 'new'
  useEffect(() => {
    if (showingNew) take()
  }, [showingNew, visit, take])

  const wasRunning = useRef(status.running)
  useEffect(() => {
    if (wasRunning.current && !status.running && showingNew) take()
    wasRunning.current = status.running
  }, [status.running, showingNew, take])

  const loadList = useCallback((t: Tab): void => {
    if (t === 'past') window.api.getPast().then(setPast, () => setPast('failed'))
    if (t === 'saved') window.api.getSaved().then(setSaved, () => setSaved('failed'))
  }, [])
  // 열린 탭의 목록은 탭을 열 때, 창이 다시 보일 때, 열린 탭을 다시 누를 때(아래) 불러온다.
  useEffect(() => {
    if (visible) loadList(tab)
  }, [visible, visit, tab, loadList])

  const fresh = session.filter((i) => !hidden.has(i.id) && enabled[i.category])
  useEffect(() => {
    onCount(fresh.length)
  }, [fresh.length, onCount])

  const listOf = (list: Item[] | null | 'failed', except?: ReadonlySet<string>): Item[] =>
    Array.isArray(list)
      ? list.filter((i) => !hidden.has(i.id) && enabled[i.category] && !except?.has(i.id))
      : []
  // 열린 탭에 늘어놓을 항목. 지난 소식에서는 이번 새 소식 목록에 아직 있는 항목을 뺀다.
  const listed =
    tab === 'new'
      ? fresh
      : tab === 'past'
        ? listOf(past, new Set(session.map((i) => i.id)))
        : listOf(saved)
  // 켜진 출처가 없는 카테고리의 항목에도 칩이 있어야 보이고 숨길 수 있다.
  const chipCats = feedCategories(
    categories,
    listed.map((i) => i.category)
  )
  const visibleCats = chipCats.filter((c) => shown.includes(c))

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
  const row = (i: Item, order: number): React.JSX.Element => (
    <ItemRow
      key={i.id}
      item={i}
      saved={isSaved(i)}
      order={Math.min(4, order)}
      onToggleSave={() => toggleSave(i)}
      onHide={() => hide(i.id)}
    />
  )

  const noCategory = <p className="note muted">표시할 카테고리를 선택해 주십시오.</p>
  const noMatch = <p className="note muted">선택한 카테고리에 표시할 항목이 없습니다.</p>

  // 세 탭 모두 카테고리 묶음으로 보인다. 묶음 안의 순서는 받은 목록의 순서 그대로다.
  const grouped = (list: Item[]): React.ReactNode => {
    if (visibleCats.length === 0) return noCategory
    const groups = visibleCats
      .map((c) => [c, list.filter((i) => i.category === c)] as const)
      .filter(([, items]) => items.length > 0)
    if (groups.length === 0) return noMatch
    return groups.map(([c, items]) => {
      const key = `${tab}:${c}`
      const all = expanded.includes(key)
      return (
        <section key={key} className="feed-group">
          <h2 className="feed-group-title">
            {CATEGORY_LABEL[c]} <span className="feed-group-count">{items.length}</span>
          </h2>
          <ul className="item-list">
            {(all ? items : items.slice(0, FIRST_ROWS)).map((i, k) =>
              row(i, k < FIRST_ROWS ? k : k - FIRST_ROWS)
            )}
          </ul>
          {!all && items.length > FIRST_ROWS && (
            <button
              type="button"
              className="btn btn-small more"
              onClick={(e) => {
                // 버튼이 사라져도 키보드 위치를 잃지 않게 처음 펼쳐진 줄로 옮긴다.
                const section = e.currentTarget.parentElement
                flushSync(() => setExpanded((x) => [...x, key]))
                section?.querySelectorAll<HTMLElement>('.item-title')[FIRST_ROWS]?.focus()
              }}
            >
              {`More (${items.length - FIRST_ROWS})`}
            </button>
          )}
        </section>
      )
    })
  }

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
              Retry
            </button>
          </div>
        )
      const failed = !status.running && allFailed(sources, status.errors)
      // 한 번도 아무것도 모으지 못한 채 수집이 끝났다: 키워드가 문제일 가능성이 크다.
      const noneFound = !status.running && !failed && firstRun === true && session.length === 0
      // 새 소식 탭은 아직 보지 않은 것만 보인다. 비어 있을 때 이미 본 소식이 어디 있는지 알려 준다.
      const caughtUp = !status.running && !failed && !noneFound
      return (
        <div className="empty">
          <LiveOrb
            size={200}
            busy={status.running}
            onActivate={() => void window.api.refresh()}
            label="Refresh"
          />
          <p className="muted" role="status">
            {!status.running
              ? failed
                ? '소식을 가져오지 못했습니다. Settings의 Sources를 확인해 주십시오.'
                : noneFound
                  ? '이 키워드로 찾은 소식이 아직 없습니다.'
                  : '새 소식을 모두 확인했습니다'
              : firstRun
                ? '첫 소식을 모으는 중입니다'
                : '새 소식을 확인하는 중입니다'}
          </p>
          {caughtUp && (
            <>
              <p className="hint">이미 본 소식은 Past 탭에 있습니다.</p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  // 버튼이 사라져도 키보드 위치를 잃지 않게 Past 탭으로 옮긴다.
                  flushSync(() => setTab('past'))
                  document.getElementById(`${ids}-past`)?.focus()
                }}
              >
                Open Past
              </button>
            </>
          )}
          {noneFound && (
            <>
              <p className="hint">
                키워드를 짧게 나누어 쉼표로 구분하면 더 많이 찾습니다.
                <br />
                e.g. explainable AI, structural analysis
              </p>
              <button type="button" className="btn btn-small" onClick={onOpenSettings}>
                Edit keywords
              </button>
            </>
          )}
        </div>
      )
    }
    return grouped(fresh)
  }

  // list는 열린 탭의 목록이다. 늘어놓을 항목은 위에서 고른 listed다.
  const listItems = (list: Item[] | null | 'failed', emptyText: string): React.ReactNode => {
    if (list === null) return null
    if (list === 'failed')
      return (
        <p className="note muted" role="alert">
          목록을 불러오지 못했습니다.
        </p>
      )
    if (listed.length === 0) return <p className="note muted">{emptyText}</p>
    return grouped(listed)
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Views">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            id={`${ids}-${t}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t}
            onClick={() => (t === tab ? loadList(t) : setTab(t))}
          >
            {label}
          </button>
        ))}
      </div>
      <CategoryChips
        categories={chipCats}
        shown={shown}
        onToggle={(c) => setShown((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}
      />
      <div role="tabpanel" aria-labelledby={`${ids}-${tab}`}>
        {tab === 'new' && newItems()}
        {tab === 'past' && listItems(past, '지난 소식이 없습니다.')}
        {tab === 'saved' && listItems(saved, '저장한 항목이 없습니다.')}
      </div>
    </>
  )
}
