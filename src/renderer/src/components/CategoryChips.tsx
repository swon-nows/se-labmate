import { CATEGORY_LABEL } from '../../../shared/types'
import type { Category } from '../../../shared/types'

interface Props {
  categories: Category[] // 설정에서 켠 카테고리
  shown: Category[]
  onToggle: (c: Category) => void
}

// 보기 필터일 뿐이다. 수집 여부는 설정에서 바꾼다.
export function CategoryChips({ categories, shown, onToggle }: Props): React.JSX.Element {
  return (
    <div className="chips" role="group" aria-label="카테고리">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          className="chip"
          aria-pressed={shown.includes(c)}
          onClick={() => onToggle(c)}
        >
          {CATEGORY_LABEL[c]}
        </button>
      ))}
    </div>
  )
}
