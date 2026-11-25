import { useRef, useState } from 'react'
import { KEYWORD_SUGGESTIONS } from '../../../shared/keyword-suggestions'
import {
  MAX_KEYWORDS,
  currentToken,
  hasKeyword,
  keywordList,
  replaceToken,
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
  // 글자를 치는 동안에만 적고 있는 낱말로 추천을 거른다. 칩을 누르면 다시 전체가 보인다.
  const [typing, setTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelId = `${id}-suggestions`

  const all = KEYWORD_SUGGESTIONS.map((g) => ({ label: g.label, items: g[lang] }))
  const token = currentToken(value)
  const filtering = typing && token !== ''
  const groups = all
    .map((g) => ({
      ...g,
      items: filtering ? g.items.filter((k) => k.toLowerCase().includes(token)) : g.items
    }))
    .filter((g) => g.items.length > 0)
  const expanded = open && groups.length > 0
  // 적고 있는 낱말은 칩으로 바뀌므로 세지 않는다.
  const full = keywordList(value).length - (filtering ? 1 : 0) >= MAX_KEYWORDS

  return (
    <div
      className="field"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setOpen(false)
        setTyping(false)
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
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        aria-required={required ? 'true' : undefined}
        aria-describedby={describedBy}
        aria-expanded={expanded}
        aria-controls={panelId}
        autoComplete="off"
        spellCheck={false}
      />
      {expanded && (
        // 빈 곳을 눌러도 입력칸의 포커스가 빠져나가지 않게 한다.
        <div
          id={panelId}
          className="suggest"
          role="group"
          aria-label="Suggested keywords"
          onMouseDown={(e) => e.preventDefault()}
        >
          {groups.map((g) => (
            <div key={g.label} className="suggest-group">
              <p className="suggest-title">{g.label}</p>
              <div className="chips" lang={lang}>
                {g.items.map((k) => {
                  const pressed = hasKeyword(value, k)
                  const blocked = full && !pressed
                  return (
                    <button
                      key={k}
                      type="button"
                      className="chip chip-sm"
                      aria-pressed={pressed}
                      aria-disabled={blocked ? 'true' : undefined}
                      onClick={() => {
                        if (blocked) return
                        // 적고 있는 낱말이 있으면 그 낱말을 추천으로 바꾼다.
                        onChange(
                          filtering && !pressed ? replaceToken(value, k) : toggleKeyword(value, k)
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
          {full && <p className="hint">키워드는 {MAX_KEYWORDS}개까지 저장됩니다.</p>}
        </div>
      )}
      {children}
    </div>
  )
}
