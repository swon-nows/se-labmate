import { useState } from 'react'
import { CATEGORIES, CATEGORY_LABEL, MAX_REPO_COUNT } from '../../../shared/types'
import type { Category, Profile, PublicState, SaveInput } from '../../../shared/types'
import { KeywordField } from '../components/KeywordField'
import { keywordList, longKeywords } from '../format'

interface Props {
  initial: PublicState
  // 저장이 끝난 뒤 화면을 다시 불러오는 일을 돌려주면 그 동안 저장 버튼을 잠근다.
  onSaved: () => void | Promise<void>
  onSubmitStart?: () => void
  submitLabel: string
  showCategories?: boolean
}

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
  const [repoCount, setRepoCount] = useState(String(settings.repoCount))
  const [notifyTime, setNotifyTime] = useState(settings.notifyTime)
  const [openAtLogin, setOpenAtLogin] = useState(settings.openAtLogin)
  const [enabled, setEnabled] = useState(settings.enabled)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  const tooLong = longKeywords(keywordsEn).length > 0
  const hasKey = initial.hasOpenAlexKey
  const typedKey = keyText.trim() !== ''
  const willDelete = hasKey && deleteKey && !typedKey

  async function submit(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (pending) return
    const input: SaveInput = {
      profile: {
        keywordsEn: keywordList(keywordsEn),
        keywordsKo: keywordList(keywordsKo),
        country
      },
      // 범위는 여기서 검사하지 않는다. 틀린 값은 저장할 때 오류로 돌아와 아래 목록에 보인다.
      settings: { ...settings, repoCount: Number(repoCount), notifyTime, openAtLogin, enabled }
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
      <KeywordField
        id="pf-en"
        label="Keywords (English)"
        lang="en"
        value={keywordsEn}
        onChange={setKeywordsEn}
        required
        describedBy={tooLong ? 'pf-en-hint pf-en-long' : 'pf-en-hint'}
      >
        <p id="pf-en-hint" className="hint">
          짧은 키워드 여러 개를 쉼표로 구분합니다.
          <br />
          e.g. graph neural network, structural analysis
        </p>
        {tooLong && (
          <p id="pf-en-long" className="hint" role="status">
            키워드가 깁니다. 그대로 일치하는 글만 찾으므로 짧게 나누어 주십시오.
          </p>
        )}
      </KeywordField>

      <KeywordField
        id="pf-ko"
        label="Keywords (Korean, optional)"
        lang="ko"
        value={keywordsKo}
        onChange={setKeywordsKo}
      />

      <div className="field">
        <label className="label" htmlFor="pf-country">
          Region
        </label>
        <select
          id="pf-country"
          className="input"
          value={country}
          onChange={(e) => setCountry(e.target.value === 'KR' ? 'KR' : 'OTHER')}
          aria-describedby="pf-country-hint"
        >
          <option value="KR">Korea</option>
          <option value="OTHER">Other</option>
        </select>
        <p id="pf-country-hint" className="hint">
          Korea : 한국어 뉴스와 국내 과제 공고(IRIS, 한국연구재단)도 가져옵니다.
          <br />
          Other : 영문 소식만 가져옵니다.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-key">
          OpenAlex API key (optional)
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
            Get a key (free)
          </button>
        </div>
        <div className="hint key-state">
          {hasKey && !willDelete && (
            <>
              <span id="pf-key-hint">Saved</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setKeyText('')
                  setDeleteKey(true)
                }}
              >
                Remove
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
        <label className="label" htmlFor="pf-repos">
          Trending repos
        </label>
        <input
          id="pf-repos"
          className="input input-count"
          type="number"
          min={1}
          max={MAX_REPO_COUNT}
          step={1}
          inputMode="numeric"
          value={repoCount}
          onChange={(e) => setRepoCount(e.target.value)}
          aria-describedby="pf-repos-hint"
        />
        <p id="pf-repos-hint" className="hint">
          GitHub에서 한 주 동안 별을 가장 많이 받은 저장소를 이 개수만큼 가져옵니다(1~
          {MAX_REPO_COUNT}
          ). 키워드와는 무관합니다.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="pf-time">
          Notify at
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
          <span>Open at login</span>
        </label>
      </div>

      {showCategories && (
        <fieldset className="field group">
          <legend>Categories</legend>
          {CATEGORIES.map((c) => (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={enabled[c]}
                onChange={(e) => toggleCategory(c, e.target.checked)}
              />
              <span>{CATEGORY_LABEL[c]}</span>
            </label>
          ))}
          <p className="hint">
            Grants는 Region이 Korea일 때 IRIS와 한국연구재단의 신규 공고를 가져옵니다. Conferences와
            School은 아래 Boards에 등록한 주소에서 가져옵니다.
          </p>
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
