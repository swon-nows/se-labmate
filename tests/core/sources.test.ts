import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { Category, RawItem } from '../../src/shared/types'
import { isHttpUrl } from '../../src/main/core/text'
import { buildArxivUrl, parseArxiv } from '../../src/main/core/sources/arxiv'
import { buildOpenAlexUrl, parseOpenAlex } from '../../src/main/core/sources/openalex'
import { abstractText, keySentence } from '../../src/main/core/sources/summary'
import { buildGithubUrls, parseGithub } from '../../src/main/core/sources/github'
import { buildGnewsUrl, parseGnews } from '../../src/main/core/sources/gnews'

const fx = (n: string): string => readFileSync(`tests/fixtures/${n}`, 'utf8')
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
  wellFormed(parseGithub(fx('github.json')), 'repo', 'repo:')
  wellFormed(parseGnews(fx('gnews-ko.xml')), 'news', 'news:')
  wellFormed(parseGnews(fx('gnews-en.xml')), 'news', 'news:')
  expect(parseGnews(fx('gnews-ko.xml')).length).toBeLessThanOrEqual(30)
  expect(parseGithub(fx('github.json'))[0].stars).toEqual(expect.any(Number))
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
  expect(() => parseGithub('{"message":"API rate limit exceeded"}')).toThrow()
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
test('arXiv 오류 entry는 논문이 아니라 오류다', () => {
  expect(() => parseArxiv(ARXIV_ERROR)).toThrow('incorrect id format for not-a-valid-id')
})
test('Google 뉴스 출처 없음·제목 끝 불일치·limit', () => {
  const [a, b] = parseGnews(GNEWS_PLAIN) // 날짜 최신순이라 20일 기사(a)가 먼저
  expect(b.source).toBe('Google News')
  expect(b.title).toBe('출처 없는 기사 - 어딘가')
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
  expect(buildGithubUrls(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'], today)).toHaveLength(2)
  expect(new URL(buildGithubUrls(['k1'], today)[0]).searchParams.get('q')).toBe(
    '"k1" in:name,description,topics created:>=2026-08-26'
  )
  const forty = Array.from({ length: 6 }, (_, i) => String(i).repeat(40))
  const qs = buildGithubUrls(forty, today).map((u) => new URL(u).searchParams.get('q') ?? '')
  expect(qs.length).toBeGreaterThan(1)
  for (const q of qs) expect(q.length).toBeLessThanOrEqual(256)
  expect(qs.join(' ').match(/"\d+"/g)).toHaveLength(6)
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
