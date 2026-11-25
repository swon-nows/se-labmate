// 키워드 입력칸 아래에 펼치는 추천 목록. 분야를 더할 때는 묶음 하나를 추가한다.
export interface SuggestionGroup {
  label: string
  en: string[]
  ko: string[]
}

export const KEYWORD_SUGGESTIONS: SuggestionGroup[] = [
  {
    label: 'Structural',
    en: [
      'structural engineering',
      'structural analysis',
      'structural design',
      'structural health monitoring',
      'structural optimization',
      'topology optimization',
      'finite element analysis',
      'seismic design',
      'earthquake engineering',
      'reinforced concrete',
      'steel structure',
      'composite structure',
      'structural reliability',
      'damage detection',
      'building information modeling',
      'generative design',
      'high-rise building',
      'wind engineering'
    ],
    ko: [
      '건축구조',
      '구조해석',
      '구조설계',
      '구조 최적화',
      '내진설계',
      '철근콘크리트',
      '강구조',
      '합성구조',
      '구조물 건전성 모니터링',
      '손상 탐지',
      '유한요소해석',
      'BIM',
      '초고층 건축',
      '모듈러 건축',
      '스마트 건설'
    ]
  },
  {
    label: 'AI',
    en: [
      'explainable AI',
      'machine learning',
      'deep learning',
      'graph neural network',
      'physics-informed neural network',
      'surrogate model',
      'large language model',
      'generative AI',
      'reinforcement learning',
      'computer vision',
      'uncertainty quantification',
      'Bayesian optimization',
      'digital twin',
      'SHAP',
      'mechanistic interpretability'
    ],
    ko: [
      '인공지능',
      '설명가능 인공지능',
      '머신러닝',
      '딥러닝',
      '그래프 신경망',
      '대리모델',
      '생성형 AI',
      '거대언어모델',
      '강화학습',
      '컴퓨터 비전',
      '디지털 트윈'
    ]
  }
]
