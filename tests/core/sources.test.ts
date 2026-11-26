import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { Category, RawItem } from '../../src/shared/types'
import { isHttpUrl, normalizeTitle } from '../../src/main/core/text'
import { buildArxivUrl, parseArxiv } from '../../src/main/core/sources/arxiv'
import { buildOpenAlexUrl, parseOpenAlex } from '../../src/main/core/sources/openalex'
import { abstractText, keySentence } from '../../src/main/core/sources/summary'
import { parseTrending } from '../../src/main/core/sources/github'
import { buildGnewsUrl, parseGnews } from '../../src/main/core/sources/gnews'

const fx = (n: string): string => readFileSync(`tests/fixtures/${n}`, 'utf8')
const NOW = new Date('2026-11-26T03:00:00Z')
const wellFormed = (items: RawItem[], cat: Category, prefix: string): void => {
  expect(items.length).toBeGreaterThan(0)
  for (const it of items) {
    expect(it.category).toBe(cat)
    expect(it.id.startsWith(prefix)).toBe(true)
    expect(it.id).not.toContain('[object')
    expect(it.title.trim()).not.toBe('')
    expect(isHttpUrl(it.url)).toBe(true)
    expect(new Date(it.date).toISOString()).toBe(it.date)
  }
  expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
}

const ARXIV_ONE = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2611.00001v1</id>
    <title>A Study
  of X</title>
    <summary>We study X.
    It is   good.</summary>
    <published>2026-11-21T07:57:27Z</published>
  </entry>
</feed>`
const ARXIV_EMPTY = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv Query</title></feed>`
// 실제 응답(2026-11-24, id_list=not-a-valid-id): 정상 피드 안에 오류 entry 하나
const ARXIV_ERROR = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/</id>
  <title>arXiv Search Results</title>
  <updated>2026-11-24T02:30:59Z</updated>
  <opensearch:itemsPerPage>1</opensearch:itemsPerPage>
  <opensearch:totalResults>1</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <entry>
    <id>https://arxiv.org/api/errors#incorrect_id_format_for_not-a-valid-id</id>
    <title>Error</title>
    <updated>2026-11-24T02:30:59Z</updated>
    <link href="https://arxiv.org/api/errors#incorrect_id_format_for_not-a-valid-id" rel="alternate" type="text/html"/>
    <summary>incorrect id format for not-a-valid-id</summary>
    <author>
      <name>arXiv api core</name>
    </author>
  </entry>
</feed>`
const OPENALEX_ONE = JSON.stringify({
  results: [
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.1/x',
      title: 'A study of X.',
      publication_date: '2026-11-23',
      primary_location: {
        landing_page_url: 'https://doi.org/10.1/x',
        source: { display_name: 'Journal Y' }
      }
    }
  ]
})
const arxivFeed = (summary: string, extra = ''): string => `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><title>arXiv Query</title>
  <entry><id>http://arxiv.org/abs/2611.00002v1</id><title>T</title><summary>${summary}</summary><published>2026-11-21T07:57:27Z</published>${extra}</entry>
</feed>`
const ARXIV_JREF = arxivFeed(
  'We study X.',
  '<category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/><arxiv:journal_ref>Nature 600 (2026)</arxiv:journal_ref>'
)
const ARXIV_DUP_CATS = arxivFeed(
  'We study X.',
  '<category term="cs.LG"/><category term="stat.ML"/><category term="cs.LG"/>'
)
const GNEWS_ONE = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>
<item><title>AI 소식 - 한겨레</title><link>https://news.google.com/rss/articles/A?oc=5</link><guid isPermaLink="false">A</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate><source url="https://www.hani.co.kr">한겨레</source></item>
</channel></rss>`
const GNEWS_ODD = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>
<item><title>R&amp;D 예산 &lt;b&gt;확대&lt;/b&gt; - 전자신문</title><link>https://news.google.com/rss/articles/B?oc=5</link><guid isPermaLink="false">B</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate><source url="https://www.etnews.com">전자신문</source></item>
<item><title>나쁜 주소 - 전자신문</title><link>javascript:alert(1)</link><guid isPermaLink="false">C</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate><source url="https://www.etnews.com">전자신문</source></item>
</channel></rss>`
const GNEWS_NUMERIC = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>
<item><title>Don&#39;t panic - X</title><link>https://example.com/n1</link><guid>n1</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate><source url="https://example.com">X</source></item>
<item><title>Q&amp;#39;s &amp;lt;i&amp;gt; - X</title><link>https://example.com/n2</link><guid>n2</guid><pubDate>Wed, 18 Nov 2026 04:41:40 GMT</pubDate><source url="https://example.com">X</source></item>
</channel></rss>`
const GNEWS_PLAIN = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>
<item><title>출처 없는 기사 - 어딘가</title><link>https://example.com/1</link><guid>1</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate></item>
<item><title>제목 끝이 다른 기사 - 어딘가</title><link>https://example.com/2</link><guid>2</guid><pubDate>Fri, 20 Nov 2026 04:41:40 GMT</pubDate><source url="https://example.com">연합뉴스</source></item>
</channel></rss>`

test('fixtures', () => {
  wellFormed(parseArxiv(fx('arxiv.xml')), 'paper', 'paper:')
  wellFormed(parseOpenAlex(fx('openalex.json')), 'paper', 'paper:')
  wellFormed(parseTrending(fx('github-trending.html'), NOW, 25), 'repo', 'repo:')
  wellFormed(parseGnews(fx('gnews-ko.xml')), 'news', 'news:')
  wellFormed(parseGnews(fx('gnews-en.xml')), 'news', 'news:')
  expect(parseGnews(fx('gnews-ko.xml')).length).toBeLessThanOrEqual(30)
})
test('같은 제목은 출처가 달라도 같은 id', () => {
  // 인라인 최소 XML/JSON: 제목 'A Study of X' (arXiv) 와 'A study of X.' (OpenAlex)
  expect(parseArxiv(ARXIV_ONE)[0].id).toBe(parseOpenAlex(OPENALEX_ONE)[0].id)
})
test('결과 1건·0건', () => {
  expect(parseArxiv(ARXIV_ONE)).toHaveLength(1) // <entry> 하나
  expect(parseArxiv(ARXIV_EMPTY)).toEqual([]) // <feed>만 있고 entry 없음
  expect(parseGnews(GNEWS_ONE)).toHaveLength(1)
})
test('기대와 다른 응답은 던진다', () => {
  expect(() => parseGnews('<html><body>동의</body></html>')).toThrow()
  expect(() => parseOpenAlex('not json')).toThrow()
})
test('글자와 주소', () => {
  // GNEWS_ODD: 제목 'R&amp;D 예산 &lt;b&gt;확대&lt;/b&gt; - 전자신문', source '전자신문', 둘째 item의 link는 'javascript:alert(1)'
  const items = parseGnews(GNEWS_ODD)
  expect(items).toHaveLength(1)
  expect(items[0].title).toBe('R&D 예산 <b>확대</b>')
  expect(items[0].source).toBe('전자신문')
})
test('숫자 참조는 풀고 이중으로 풀지 않는다', () => {
  const [a, b] = parseGnews(GNEWS_NUMERIC)
  expect(a.title).toBe("Don't panic")
  expect(b.title).toBe('Q&#39;s &lt;i&gt;')
})
test('글자 없는 제목은 버린다', () => {
  const body = JSON.stringify({
    results: [
      {
        id: 'https://openalex.org/W2',
        doi: 'https://doi.org/10.1/y',
        title: '???',
        publication_date: '2026-11-23'
      }
    ]
  })
  expect(parseOpenAlex(body)).toEqual([])
})
test('OpenAlex: 모양이 틀린 레코드는 던지지 않고 건너뛴다', () => {
  const good = JSON.parse(OPENALEX_ONE).results[0]
  const body = JSON.stringify({ results: [null, 5, { title: 7 }, good] })
  expect(parseOpenAlex(body).map((i) => i.url)).toEqual(['https://doi.org/10.1/x'])
  // 문자열이 아닌 doi·id·날짜는 없는 것으로 본다.
  const odd = { ...good, doi: 7, id: ['x'], publication_date: 20261123 }
  expect(parseOpenAlex(JSON.stringify({ results: [odd] }))).toEqual([])
  expect(
    parseOpenAlex(JSON.stringify({ results: [{ ...good, doi: 7 }] })).map((i) => i.url)
  ).toEqual(['https://doi.org/10.1/x'])
})

test('arXiv 오류 entry는 논문이 아니라 오류다', () => {
  expect(() => parseArxiv(ARXIV_ERROR)).toThrow('incorrect id format for not-a-valid-id')
})
test('Google 뉴스 출처 없음·제목 끝 불일치·limit', () => {
  const [a, b] = parseGnews(GNEWS_PLAIN) // 날짜 최신순이라 20일 기사(a)가 먼저
  expect(b.source).toBe('Google News')
  expect(b.title).toBe('출처 없는 기사 - 어딘가')
  // 저장된 id가 바뀌면 안 되므로, 출처 없는 기사의 id는 보이는 이름이 아니라 옛 이름 'Google 뉴스'로 만든다.
  expect(b.id).toBe(`news:${normalizeTitle(b.title)}:${normalizeTitle('Google 뉴스')}`)
  expect(a.source).toBe('연합뉴스')
  expect(a.title).toBe('제목 끝이 다른 기사 - 어딘가')
  expect(a.id).toBe('news:제목끝이다른기사어딘가:연합뉴스')
  const ko = parseGnews(fx('gnews-ko.xml'), 3)
  expect(ko).toHaveLength(3)
  expect(ko[0].date >= ko[1].date && ko[1].date >= ko[2].date).toBe(true)
})
test('뉴스 id는 guid가 아니라 정규화한 제목과 언론사로 정한다', () => {
  const item = (guid: string, source: string, title = 'GNN이 바꾼 설계'): string =>
    `<item><title>${title} - ${source}</title><link>https://example.com/${guid}</link><guid>${guid}</guid><pubDate>Thu, 19 Nov 2026 04:41:40 GMT</pubDate><source url="https://example.com">${source}</source></item>`
  const rss = (...items: string[]): string =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>${items.join('')}</channel></rss>`
  const [a] = parseGnews(rss(item('g1', '한겨레')))
  const [b] = parseGnews(rss(item('g2', '한겨레')))
  expect(a.id).toBe('news:gnn이바꾼설계:한겨레')
  expect(b.id).toBe(a.id)
  const two = parseGnews(rss(item('g1', '한겨레'), item('g3', '연합뉴스')))
  expect(new Set(two.map((i) => i.id)).size).toBe(2)
  expect(parseGnews(rss(item('g4', 'X', '???')))).toEqual([])
  for (const f of ['gnews-ko.xml', 'gnews-en.xml']) {
    const all = parseGnews(fx(f), 1000)
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length)
  }
})
test('URL', () => {
  const today = new Date('2026-11-24T03:00:00Z')
  const oa = new URL(buildOpenAlexUrl(['graph neural network', 'xai'], today, 'KEY'))
  expect(oa.searchParams.get('filter')).toBe(
    'title_and_abstract.search:"graph neural network"|"xai",from_publication_date:2026-10-25,to_publication_date:2026-11-24'
  )
  expect(oa.searchParams.get('sort')).toBe('publication_date:desc')
  expect(oa.searchParams.get('api_key')).toBe('KEY')
  expect(new URL(buildArxivUrl(['a b', 'c'])).searchParams.get('search_query')).toBe(
    'all:"a b" OR all:"c"'
  )
  const g = new URL(buildGnewsUrl(['인공지능', '구조공학'], 'ko'))
  expect(g.searchParams.get('q')).toBe('"인공지능" OR "구조공학" when:7d')
  expect(g.searchParams.get('ceid')).toBe('KR:ko')
})

test('OpenAlex: 저널명과 핵심 키워드', () => {
  const items = parseOpenAlex(fx('openalex-keywords.json'))
  expect(items[0]).toMatchObject({
    venue: 'Lirias',
    keywords: [
      'public employment services',
      'model interpretability',
      'job matching',
      'decision support system',
      'counterfactual explanations'
    ]
  })
  expect(items[0].summary.startsWith('This dissertation examines how interpretable ML')).toBe(true)
  expect([...items[0].summary]).toHaveLength(241) // 341자 문장 → 240자 + …
  const noKw = items.find((i) => i.title.startsWith('Hyperbolic Multi-view'))!
  expect(noKw).toMatchObject({
    keywords: ['Misinformation and Its Impacts'],
    venue: 'Communications in computer and information science',
    summary: ''
  })
  expect(
    new URL(buildOpenAlexUrl(['a'], new Date('2026-11-24T03:00:00Z'), 'K')).searchParams.get(
      'select'
    )
  ).toBe(
    'id,doi,title,publication_date,primary_location,type,cited_by_count,keywords,primary_topic,abstract_inverted_index'
  )
})
test('keySentence', () => {
  expect(
    keySentence(
      'Graph neural networks are popular. In this paper, we propose X for bridges. Results show Y.'
    )
  ).toBe('In this paper, we propose X for bridges.')
  expect(keySentence('Abstract: Bridges age. Cracks grow. Monitoring is costly.')).toBe(
    'Bridges age.'
  )
  expect(keySentence('Abstract concepts are hard. They resist models.')).toBe(
    'Abstract concepts are hard.'
  )
  expect(keySentence('The value is 3.5 mm e.g. small. We measure it.')).toBe('We measure it.')
  expect(keySentence('구조물 손상을 탐지한다. 그래프 신경망을 쓴다.')).toBe(
    '구조물 손상을 탐지한다.'
  )
  expect(keySentence('   ')).toBe('')
  const long = 'We ' + 'x'.repeat(300) + '.'
  expect([...keySentence(long)]).toHaveLength(241)
  expect(keySentence(long).endsWith('…')).toBe(true)
})
test('abstractText', () => {
  expect(abstractText({ We: [0], propose: [1], a: [2, 4], and: [3], b: [5] })).toBe(
    'We propose a and a b'
  )
  expect(abstractText(null)).toBe('')
  expect(abstractText('x')).toBe('')
})
test('arXiv: 요약은 초록에서 고른 한 문장', () => {
  for (const it of parseArxiv(fx('arxiv.xml'))) {
    expect(it.summary).not.toBe('')
    expect([...it.summary].length).toBeLessThanOrEqual(241)
  }
  expect(parseArxiv(arxivFeed('Bridges age.\n  We propose X.'))[0].summary).toBe('We propose X.')
})
test('OpenAlex: 키워드도 주제도 없으면 필드가 없다', () => {
  const body = JSON.stringify({
    results: [
      {
        id: 'https://openalex.org/W3',
        doi: 'https://doi.org/10.1/z',
        title: 'No extras',
        publication_date: '2026-11-23',
        keywords: [],
        primary_location: { source: { display_name: '   ' } }
      }
    ]
  })
  const [item] = parseOpenAlex(body)
  expect('keywords' in item).toBe(false)
  expect('venue' in item).toBe(false)
  expect(item.summary).toBe('')
})
test('OpenAlex: 깨진 레코드 하나가 소스 전체를 막지 않는다', () => {
  const body = JSON.stringify({
    results: [
      {
        id: 'https://openalex.org/W4',
        doi: 'https://doi.org/10.1/bad',
        title: 'Malformed fields',
        publication_date: '2026-11-23',
        keywords: [null, { display_name: 5 }, { display_name: 'ok', score: 'x' }],
        primary_location: { source: { display_name: 7 } },
        primary_topic: { display_name: {} }
      },
      {
        id: 'https://openalex.org/W5',
        doi: 'https://doi.org/10.1/good',
        title: 'Good record',
        publication_date: '2026-11-22',
        keywords: [{ display_name: 'fine', score: 0.5 }],
        primary_location: { source: { display_name: 'Journal Z' } }
      }
    ]
  })
  const [bad, good] = parseOpenAlex(body)
  expect(bad.keywords).toEqual(['ok'])
  expect('venue' in bad).toBe(false)
  expect(good).toMatchObject({ keywords: ['fine'], venue: 'Journal Z' })
})
test('keySentence: 자른 끝의 공백은 …앞에 남기지 않는다', () => {
  const s = keySentence('We ' + 'x'.repeat(236) + ' tail.') // 240자째가 공백
  expect(s).toBe('We ' + 'x'.repeat(236) + '…')
})
test('arXiv: 분류와 journal_ref', () => {
  for (const it of parseArxiv(fx('arxiv.xml'))) {
    expect(it.keywords!.length).toBeGreaterThan(0)
    for (const k of it.keywords!) expect(k).toMatch(/^[a-z-]+(\.[A-Za-z-]+)?$/)
  }
  expect(parseArxiv(ARXIV_JREF)[0]).toMatchObject({
    venue: 'Nature 600 (2026)',
    keywords: ['cs.LG']
  })
  const dup = parseArxiv(ARXIV_DUP_CATS)[0]
  expect(dup.keywords).toEqual(['cs.LG', 'stat.ML'])
  expect('venue' in dup).toBe(false)
})

const ENTRY = (path: string, week = '1,764 stars this week'): string =>
  `<article><h2><a href="/${path}">${path}</a></h2><p>설명 <b>글</b></p>` +
  `<a href="/${path}/stargazers"><svg><path d="M8 .25"></path></svg> 15,104</a><span>${week}</span></article>`
const NO_LIST = 'GitHub Trending 목록을 찾지 못했습니다'

test('GitHub Trending: 실제 페이지에서 이번 주 별이 많은 순서로 limit개를 읽는다', () => {
  const html = fx('github-trending.html')
  const top = parseTrending(html, NOW, 10)
  expect(top.map((i) => i.title)).toEqual([
    'mvanhorn/last30days-skill',
    'kajisho5/ffmpeg-skill',
    'meta/astryx',
    'google-labs-code/stitch-skills',
    'dream-num/univer',
    'GoogleChrome/modern-web-guidance-src',
    'alibaba/open-code-review',
    'backnotprop/plannotator',
    'we-promise/sure',
    'tradermonty/claude-trading-skills'
  ])
  expect(top[0]).toMatchObject({
    id: 'repo:mvanhorn/last30days-skill',
    category: 'repo',
    source: 'GitHub',
    url: 'https://github.com/mvanhorn/last30days-skill',
    date: '2026-11-26T03:00:00.000Z',
    stars: 75190,
    weekStars: 5302
  })
  const plan = top.find((i) => i.title === 'backnotprop/plannotator')!
  expect(plan).toMatchObject({ stars: 15104, weekStars: 1764 })
  expect(plan.summary.startsWith('The workspace to stay in the loop')).toBe(true)
  expect(parseTrending(html, NOW, 25)).toHaveLength(14)
  expect(parseTrending(html, NOW, 3)).toHaveLength(3)
  for (const n of [3, 10, 25]) wellFormed(parseTrending(html, NOW, n), 'repo', 'repo:')
})

test('GitHub Trending: 이번 주 별이 없거나 경로가 이상하거나 겹치는 항목은 버린다', () => {
  const html = [
    ENTRY('a/good'),
    '<article><h2><a href="/a/no-week">a/no-week</a></h2><p>x</p></article>',
    '<article><h2><a href="/only-one-part">only</a></h2><span>5 stars this week</span></article>',
    '<article><h2><a href="javascript:alert(1)">js</a></h2><span>5 stars this week</span></article>',
    ENTRY('A/Good', '9 stars this week')
  ].join('\n')
  const items = parseTrending(html, NOW, 10)
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({
    id: 'repo:a/good',
    title: 'a/good',
    summary: '설명 글',
    stars: 15104,
    weekStars: 1764
  })
  expect(parseTrending(ENTRY('a/one', '1 star this week'), NOW, 10)[0].weekStars).toBe(1)
})

test('GitHub Trending: 닫는 article이 없는 마지막 항목도 읽고, 같은 주 별이면 페이지 순서를 지킨다', () => {
  const html =
    ENTRY('a/first', '5 stars this week') +
    ENTRY('a/second', '5 stars this week') +
    '<article><h2><a href="/a/last">x</a></h2><span>7 stars this week</span>'
  expect(parseTrending(html, NOW, 10).map((i) => i.title)).toEqual([
    'a/last',
    'a/first',
    'a/second'
  ])
})

test('GitHub Trending: 목록이 없으면 던진다', () => {
  expect(() => parseTrending('<html><body>no list</body></html>', NOW, 10)).toThrow(NO_LIST)
  expect(() => parseTrending('<article><h2><a href="/a/b">b</a></h2></article>', NOW, 10)).toThrow(
    NO_LIST
  )
})

test('GitHub Trending: 큰 문서도 오래 걸리지 않는다', () => {
  for (const html of [
    '<article><h2 href="/'.repeat(100_000),
    '<article>' + '1'.repeat(2_000_000) + ' this week'
  ]) {
    const t = Date.now()
    try {
      parseTrending(html, NOW, 10)
    } catch {
      // 던지는 것도 끝난 것으로 본다
    }
    expect(Date.now() - t).toBeLessThan(1000)
  }
})
