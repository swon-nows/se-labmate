import { useEffect, useId, useRef, useState } from 'react'
import { BOARD_CATEGORIES, CATEGORY_LABEL, MAX_BOARDS } from '../../../shared/types'
import type { Board, BoardCategory, PreviewResult } from '../../../shared/types'
import { isoDate } from '../format'
import { LiveOrb } from './LiveOrb'

interface Props {
  boards: Board[]
  onChanged: () => Promise<void> // 다시 불러온 상태가 도착하면 끝난다
}

export function BoardsEditor({ boards, onChanged }: Props): React.JSX.Element {
  const id = useId()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<BoardCategory>('school')
  const [check, setCheck] = useState<null | 'checking' | PreviewResult>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)
  // 가장 최근 요청의 답만 받는다. 입력을 고치면 먼저 보낸 요청의 답은 버린다.
  const seq = useRef(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 다시 받은 목록을 그린 뒤에 옮긴다: 누른 버튼은 그때 사라지고, 열 번째를 등록하면 입력 폼도 사라진다.
  const focusAfter = useRef<'name' | 'title' | null>(null)
  useEffect(() => {
    const to = focusAfter.current
    focusAfter.current = null
    if (to === 'name' && nameRef.current) nameRef.current.focus()
    else if (to !== null) titleRef.current?.focus()
  }, [boards])

  const touch = (): void => {
    seq.current++
    setCheck(null)
    setAddError('')
  }
  const busy = check === 'checking' || adding

  const runCheck = (): void => {
    if (busy) return
    const n = ++seq.current
    setCheck('checking')
    setAddError('')
    const done = (r: PreviewResult): void => {
      if (n === seq.current) setCheck(r)
    }
    window.api
      .previewBoard(url.trim())
      .then(done, () =>
        done({ ok: false, error: '글 목록을 확인하지 못했습니다. 다시 시도해 주십시오.' })
      )
  }

  const runAdd = (): void => {
    if (adding) return
    const n = ++seq.current
    setAdding(true)
    setAddError('')
    const failed = (error: string): void => {
      if (n === seq.current) setAddError(error)
    }
    window.api
      .addBoard({ name: name.trim(), url: url.trim(), category })
      .then(
        async (r) => {
          if (!r.ok) return failed(r.error)
          // 그 사이 입력을 고쳤다면 고친 글은 지우지 않는다.
          if (n === seq.current) {
            setName('')
            setUrl('')
            setCategory('school')
            setCheck(null)
          }
          focusAfter.current = 'name'
          await onChanged()
        },
        () => failed('등록하지 못했습니다. 다시 시도해 주십시오.')
      )
      .finally(() => setAdding(false))
  }

  const remove = (boardId: string): void => {
    if (removing) return
    setRemoving(true)
    setRemoveFailed(false)
    window.api
      .removeBoard(boardId)
      .then(() => {
        focusAfter.current = 'title'
        return onChanged()
      })
      .catch(() => setRemoveFailed(true))
      .finally(() => setRemoving(false))
  }

  return (
    <section className="boards" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={titleRef} className="section-title" tabIndex={-1}>
        Boards
      </h2>
      <p className="hint section-desc">
        학교·학회 공지 게시판의 주소를 등록하면 새 글을 알려 드립니다.
      </p>

      {boards.length > 0 && (
        <ul className="board-list">
          {boards.map((b) => (
            <li key={b.id} className="board-row">
              <div className="board-info">
                <div className="board-head">
                  <span id={`${id}-${b.id}`} className="board-name">
                    {b.name}
                  </span>
                  <span className="board-category">{CATEGORY_LABEL[b.category]}</span>
                </div>
                <div className="board-url" title={b.url}>
                  {b.url}
                </div>
              </div>
              <button
                type="button"
                className="btn-quiet"
                aria-describedby={`${id}-${b.id}`}
                aria-disabled={removing || undefined}
                onClick={() => remove(b.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {removeFailed && (
        <p className="hint" role="alert">
          삭제하지 못했습니다. 다시 시도해 주십시오.
        </p>
      )}

      {boards.length >= MAX_BOARDS ? (
        <p className="hint">{`게시판은 ${MAX_BOARDS}개까지 등록할 수 있습니다.`}</p>
      ) : (
        <form
          className="board-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            runCheck()
          }}
        >
          <div className="field">
            <label className="label" htmlFor={`${id}-name`}>
              Name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              className="input"
              type="text"
              maxLength={30}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                touch()
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-url`}>
              URL
            </label>
            <input
              id={`${id}-url`}
              className="input"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                touch()
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-category`}>
              Category
            </label>
            <select
              id={`${id}-category`}
              className="input"
              value={category}
              onChange={(e) => {
                setCategory(BOARD_CATEGORIES.find((c) => c === e.target.value) ?? 'school')
                touch()
              }}
            >
              {BOARD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="board-actions">
            <button type="submit" className="btn" aria-disabled={busy || undefined}>
              Check
            </button>
            <div className="board-status" role="status">
              {check === 'checking' ? (
                <>
                  <LiveOrb size={16} busy />글 목록을 읽는 중입니다
                </>
              ) : adding ? (
                <>
                  <LiveOrb size={16} busy />
                  등록하는 중입니다
                </>
              ) : (
                check?.ok && '최근 글을 읽었습니다. 맞으면 등록해 주십시오.'
              )}
            </div>
          </div>

          {check !== null && check !== 'checking' && !check.ok && (
            <>
              <div role="alert">
                <ul className="errors">
                  <li>{check.error}</li>
                </ul>
              </div>
              <p className="hint">
                목록을 스크립트로 그리거나 로그인이 필요한 게시판은 읽지 못합니다.
              </p>
            </>
          )}
          {check !== null && check !== 'checking' && check.ok && (
            <div className="board-preview">
              <ul className="post-list">
                {check.posts.map((post, i) => (
                  <li key={i} className="post-row">
                    <span className="post-title">{post.title}</span>
                    {post.date && isoDate(post.date) && (
                      <span className="post-date">{isoDate(post.date)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {addError && (
                <div role="alert">
                  <ul className="errors">
                    <li>{addError}</li>
                  </ul>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary"
                aria-disabled={adding || undefined}
                onClick={runAdd}
              >
                Add
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  )
}
