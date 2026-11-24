import { useState } from 'react'
import { ACTIVE_CATEGORIES, CATEGORY_LABEL } from '../../../shared/types'
import type { Category, Profile, PublicState, SaveInput } from '../../../shared/types'

interface Props {
  initial: PublicState
  // 저장이 끝난 뒤 화면을 다시 불러오는 일을 돌려주면 그 동안 저장 버튼을 잠근다.
  onSaved: () => void | Promise<void>
  onSubmitStart?: () => void
  submitLabel: string
  showCategories?: boolean
}

const splitKeywords = (text: string): string[] =>
  text
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k !== '')

export function ProfileForm({
  initial,
  onSaved,
  onSubmitStart,
  submitLabel,
  showCategories = false
}: Props): React.JSX.Element {
  const { profile, settings } = initial
  const [keywordsEn, setKeywordsEn] = useState(profile?.keywordsEn.join(', ') ?? '')
  const [keywordsKo, setKeywordsKo] = useState(profile?.keywordsKo.join(', ') ?? '')
  const [country, setCountry] = useState<Profile['country']>(profile?.country ?? 'KR')
  const [keyText, setKeyText] = useState('')
  const [deleteKey, setDeleteKey] = useState(false)
  const [notifyTime, setNotifyTime] = useState(settings.notifyTime)
  const [openAtLogin, setOpenAtLogin] = useState(settings.openAtLogin)
  const [enabled, setEnabled] = useState(settings.enabled)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  const hasKey = initial.hasOpenAlexKey
  const typedKey = keyText.trim() !== ''
  const willDelete = hasKey && deleteKey && !typedKey

  async function submit(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (pending) return
    const input: SaveInput = {
      profile: {
        keywordsEn: splitKeywords(keywordsEn),
        keywordsKo: splitKeywords(keywordsKo),
        country
      },
      settings: { ...settings, notifyTime, openAtLogin, enabled }
    }
    // 입력 없음은 유지, 삭제 표시는 null. 공백뿐인 입력은 입력으로 치지 않는다(서버는 공백뿐인 키를 삭제로 본다).
    if (typedKey) input.openAlexKey = keyText
    else if (willDelete) input.openAlexKey = null

    onSubmitStart?.()
    setPending(true)
    setErrors([])
    try {
      const result = await window.api.saveProfile(input)
      // 입력칸은 여기서 비우지 않는다. onSaved가 다시 불러온 상태로 부모가 이 폼을 새로 만든다.
      if (result.ok) {
        await onSaved()
      } else {
        setErrors(result.errors)
      }
    } catch {
      setErrors(['저장하지 못했습니다. 다시 시도해 주십시오.'])
    } finally {
      setPending(false)
    }
  }

  const toggleCategory = (c: Category, on: boolean): void =>
    setEnabled((prev) => ({ ...prev, [c]: on }))

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label className="label" htmlFor="pf-en">
          영문 주제 키워드
        </label>
        <input
          id="pf-en"
          className="input"
          type="text"
          value={keywordsEn}
          onChange={(e) => setKeywordsEn(e.target.value)}
          aria-required="true"
          aria-describedby="pf-en-hint"
          autoComplete="off"
          spellCheck={false}
        />
        <p id="pf-en-hint" className="hint">
          쉼표로 구분합니다. 예: graph neural network, structural analysis
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-ko">
          한글 주제 키워드 (선택)
        </label>
        <input
          id="pf-ko"
          className="input"
          type="text"
          value={keywordsKo}
          onChange={(e) => setKeywordsKo(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-country">
          국가
        </label>
        <select
          id="pf-country"
          className="input"
          value={country}
          onChange={(e) => setCountry(e.target.value === 'KR' ? 'KR' : 'OTHER')}
        >
          <option value="KR">한국</option>
          <option value="OTHER">그 외</option>
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-key">
          OpenAlex API 키 (선택)
        </label>
        <div className="key-row">
          <input
            id="pf-key"
            className="input"
            type="password"
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            autoComplete="off"
            aria-describedby="pf-key-hint"
          />
          <button
            type="button"
            className="btn"
            onClick={() => void window.api.openHelp('openalex-key')}
          >
            발급 방법 (무료, 약 30초)
          </button>
        </div>
        <div className="hint key-state">
          {hasKey && !willDelete && (
            <>
              <span id="pf-key-hint">저장됨</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setKeyText('')
                  setDeleteKey(true)
                }}
              >
                삭제
              </button>
            </>
          )}
          {willDelete && <span id="pf-key-hint">저장하면 삭제됩니다</span>}
          {!hasKey && !typedKey && (
            <span id="pf-key-hint">키가 없으면 논문은 arXiv에서만 가져옵니다.</span>
          )}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-time">
          알림 시각
        </label>
        <input
          id="pf-time"
          className="input input-time"
          type="time"
          value={notifyTime}
          onChange={(e) => setNotifyTime(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={openAtLogin}
            onChange={(e) => setOpenAtLogin(e.target.checked)}
          />
          <span>로그인 시 자동 실행</span>
        </label>
      </div>

      {showCategories && (
        <fieldset className="field group">
          <legend>카테고리</legend>
          {ACTIVE_CATEGORIES.map((c) => (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={enabled[c]}
                onChange={(e) => toggleCategory(c, e.target.checked)}
              />
              <span>{CATEGORY_LABEL[c]}</span>
            </label>
          ))}
        </fieldset>
      )}

      {errors.length > 0 && (
        <div role="alert">
          <ul className="errors">
            {errors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  )
}
