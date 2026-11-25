import { useEffect, useRef, useState } from 'react'
import { KEYWORD_SUGGESTIONS } from '../../../shared/keyword-suggestions'
import {
  MAX_KEYWORDS,
  chipAction,
  currentToken,
  hasKeyword,
  replaceToken,
  rovingIndex,
  toggleKeyword
} from '../format'

interface Props {
  id: string
  label: string
  lang: 'en' | 'ko'
  value: string
  onChange: (value: string) => void
  required?: boolean
  describedBy?: string
  children?: React.ReactNode // 입력칸 아래 안내
}

// 쉼표로 적는 키워드 입력칸. 포커스가 있는 동안 아래에 추천 칩이 문서 흐름 안에서 펼쳐진다.
export function KeywordField({
  id,
  label,
  lang,
  value,
  onChange,
  required,
  describedBy,
  children
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // 글자를 치는 동안에만 적고 있는 낱말과 맞지 않는 칩을 흐리게 하고, 누르면 그 낱말을 바꾼다.
  const [typing, setTyping] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pressing = useRef(false) // 마우스·펜 버튼이 눌려 있는 동안
  const closePending = useRef(false) // 눌린 채 포커스가 나가서 버튼을 뗄 때 닫을 차례
  // 칩 60여 개가 저마다 Tab 자리를 차지하지 않게 하나만 Tab으로 닿고 나머지는 화살표로 옮긴다.
  const [tabChip, setTabChip] = useState(`${KEYWORD_SUGGESTIONS[0].label}/0`)
  const panelId = `${id}-suggestions`

  // 목록이 문서 흐름 안에 있어서, 아래 버튼을 누르는 순간 닫으면 내용이 올라가 첫 클릭이 사라진다.
  // 그래서 버튼을 뗀 뒤에(클릭이 먼저 전달되도록 한 틱 늦춰) 닫는다. 입력 중 표시도 그때 함께 끈다.
  useEffect(() => {
    const down = (): void => {
      pressing.current = true
    }
    // 버튼을 뗀 일이 전달되지 않는 경우(컨텍스트 메뉴, 기본 select 팝업, 창 포커스 이동)도 뗀 것으로 본다.
    const release = (): void => {
      pressing.current = false
      if (!closePending.current) return
      closePending.current = false
      setTimeout(() => {
        if (fieldRef.current?.contains(document.activeElement)) return
        setOpen(false)
        setTyping(false)
      }, 0)
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', release, true)
    document.addEventListener('pointercancel', release, true)
    document.addEventListener('contextmenu', release, true)
    window.addEventListener('blur', release)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', release, true)
      document.removeEventListener('pointercancel', release, true)
      document.removeEventListener('contextmenu', release, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  const token = currentToken(value)
  const filtering = typing && token !== ''

  return (
    <div
      ref={fieldRef}
      className="field"
      onFocus={() => {
        closePending.current = false
      }}
      onBlur={(e) => {
        if (fieldRef.current?.contains(e.relatedTarget as Node | null)) return
        if (pressing.current) {
          closePending.current = true
        } else {
          setOpen(false)
          setTyping(false)
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        setOpen(false)
        setTyping(false)
        inputRef.current?.focus()
      }}
    >
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        className="input"
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setTyping(true)
        }}
        // 칩에서 Escape로 돌아올 때는 닫힌 채로 둔다.
        onFocus={(e) => {
          if (!fieldRef.current?.contains(e.relatedTarget as Node | null)) setOpen(true)
        }}
        onClick={() => setOpen(true)}
        aria-required={required ? 'true' : undefined}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        // 빈 곳을 눌러도 입력칸의 포커스가 빠져나가지 않게 한다.
        <div
          id={panelId}
          className="suggest"
          role="group"
          aria-label="Suggested keywords"
          onMouseDown={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const chips = [...e.currentTarget.querySelectorAll('button')]
            const from = chips.indexOf(e.target as HTMLButtonElement)
            const to = rovingIndex(from, chips.length, e.key)
            if (from < 0 || to === from) return
            e.preventDefault()
            chips[to].focus()
          }}
        >
          {KEYWORD_SUGGESTIONS.map((g) => (
            <div key={g.label} className="suggest-group">
              <p className="suggest-title">{g.label}</p>
              <div className="chips" lang={lang}>
                {g[lang].map((k, j) => {
                  const action = chipAction(value, k, filtering)
                  const pressed = hasKeyword(value, k)
                  // 눌린 칩은 흐리게 하지 않는다(고른 표시가 사라진다).
                  const dim = filtering && !pressed && !k.toLowerCase().includes(token)
                  const chip = `${g.label}/${j}`
                  return (
                    <button
                      key={k}
                      type="button"
                      className={dim ? 'chip chip-sm is-dim' : 'chip chip-sm'}
                      tabIndex={chip === tabChip ? 0 : -1}
                      onFocus={() => setTabChip(chip)}
                      aria-pressed={pressed}
                      aria-disabled={action === 'blocked' ? 'true' : undefined}
                      onClick={() => {
                        if (action === 'blocked') return
                        onChange(
                          action === 'replace' ? replaceToken(value, k) : toggleKeyword(value, k)
                        )
                        setTyping(false)
                      }}
                    >
                      {k}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {/* 항상 보여 목록 높이가 개수나 입력에 따라 변하지 않게 한다. */}
          <p className="hint">키워드는 {MAX_KEYWORDS}개까지 저장됩니다.</p>
        </div>
      )}
      {children}
    </div>
  )
}
