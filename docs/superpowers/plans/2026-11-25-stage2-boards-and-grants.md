# 연구비서 2단계(게시판 감시, 과제 공고, 논문 정보 줄) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시판 주소를 등록하면 새 글이 "학교 공지·학회·과제 공고"로 들어오고, 한국이면 IRIS와 한국연구재단의 신규 공고가 기본으로 들어오며, 논문 줄에는 제목 아래에 출처·저널명·게재일자·핵심 키워드가 보인다.

**Architecture:** 게시판 읽기는 `src/main/core/boards/`의 순수 함수다. 주소를 보고 전용 읽기(IRIS, 한국연구재단, 서울대 건축학과) → 일반 읽기(RSS/Atom → HTML 목록) 순서로 고른다. 수집기는 켜진 출처 목록(`activeSources`) 하나만 보고 돌며, 게시판마다 "지난번에 본 글"(`boardKnown`)과 비교해 새 글만 항목으로 넣는다. 상태 파일은 v2가 되고 v1은 읽을 때 옮긴다.

**Tech Stack:** 1단계와 같다(Electron 44, electron-vite 6, React 19, TypeScript, Vitest 5, fast-xml-parser 5). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-23-research-assistant-design.md` (4.2, 4.3, 4.4와 이 계획 끝의 "설계에서 바뀌는 것")

**실행 방식:** 브랜치 `stage2`. Task 1 → (Task 2, 3, 4 동시에) → Task 5 → Task 6 → Task 7. 동시에 도는 과제는 서로 다른 파일만 만지고 커밋하지 않는다(메인이 검증 뒤 커밋).

## Global Constraints

- 삭제·되돌리기 명령 금지: `rm`, `git rm`, `git clean`, `git reset --hard`, `git checkout -- <파일>`, `git restore`, `git stash`. 필요하면 멈추고 보고한다.
- `git push` 금지. `git add -A`, `git add .` 금지(파일을 하나씩 적는다).
- 외부 요청에 사용자 정보를 넣지 않는다. `User-Agent`는 `research-assistant`만.
- 화면 글자는 한국어 격식체. 이모지 없음.
- 외부에서 온 글자(제목·저널명·키워드)는 일반 글자로만 표시한다. `dangerouslySetInnerHTML` 금지. 여는 주소는 `http:`/`https:`만.
- `src/main/core/**`와 `src/shared/**`는 `electron`을 import하지 않는다.
- 새 의존성 금지.
- HTML을 읽는 정규식에 중첩 수량자(`(a+)+`, `(.*)*`)를 쓰지 않는다.
- 항목 id는 저장되는 약속이다. 기존 형식(`paper:`, `repo:`, `news:`)을 바꾸지 않는다.
- 앱을 띄울 때는 반드시 임시 `--user-data-dir`. 실제 데이터 폴더(`~/Library/Application Support/research-assistant`)를 읽거나 쓰지 않는다.
- 커밋 메시지 끝줄: `Co-Authored-By: Claude Mythos 5.2 <noreply@anthropic.com>`

## 확인된 사실 (2026-11-25, 다시 조사하지 말 것)

| 사이트 | 읽는 법 | 응답 |
|---|---|---|
| IRIS | `POST https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do`, 본문 `pageIndex=1&ancmPrg=ancmIng`(접수 중) 또는 `ancmPre`(접수 예정), `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` | JSON `listBsnsAncmBtinSitu[]`: `ancmId`, `ancmTl`, `ancmDe`(`2026-11-13`), `sorgnNm`, `rcveStrDe`·`rcveEndDe`(`2026.11.13`). 상세: `GET https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmId=<id>&ancmPrg=<prg>` |
| 한국연구재단 신규사업공모 | `GET https://www.nrf.re.kr/biz/notice/list?menu_no=362&bizNotGubn=guide` (1.9MB) | `<div class="public-notice-block">`마다 `pnb-state`(`접수중 D-16`/`접수마감`), `<a … class="title-name view_btn" data-post_no="285561" … data-biz_no="359">제목</a>`, `접수일자 : 2026-11-09 09:00 ~ 2026-12-11 18:00`. 상세: `GET https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=<p>&biz_no=<b>` |
| 서울대 건축학과 | 페이지는 스크립트로 그린다. `POST https://architecture.snu.ac.kr/rest/activities/getPosts`, 본문 `{"page":1,"category":"notice","search":""}`, `Content-Type: application/json` (category: `notice`·`news`·`events`·`forms`) | JSON `{err:0,total,pinup,list:[{idx,title,post_date:"2026.11.25",category3}]}`. 고정 글 7건이 앞에 온다. 상세: `https://architecture.snu.ac.kr/post/<idx>` |
| OpenAlex | `select`에 `keywords,primary_topic` 추가 | `keywords[]: {display_name, score}`(없는 논문도 있음), `primary_topic.display_name` |
| 일반 게시판 | 서울대 컴퓨터공학부·본부 공지, 한국콘크리트학회는 목록이 HTML에 있고 아래 규칙으로 읽힌다. 대한건축학회는 `charset=EUC-KR`. 서울대 데이터사이언스대학원은 `/feed/`가 RSS | 규칙의 기준 구현: 스크래치패드 `stage2/tools/proto.py` |

테스트 자료(이미 저장소에 있음): `tests/fixtures/boards/{iris.json,nrf.html,snu-daae.json,cse-snu.html,kci.html,snu-main.html,gsds-feed.xml}`, `tests/fixtures/openalex-keywords.json`.

## File Structure

```
src/shared/types.ts          Board, BoardInput, PreviewResult, RawItem.venue/keywords, AppState v2
src/shared/sources.ts        BUILTIN_BOARDS, Source, activeSources (켜진 출처의 단 하나의 정의)
src/main/store.ts            v2 기본 상태, v1→v2 이전
src/main/core/fetch-text.ts  POST, 문자 인코딩, 크기 제한
src/main/core/boards/post.ts     Post, finishPosts, htmlText, dateOf
src/main/core/boards/iris.ts     IRIS
src/main/core/boards/nrf.ts      한국연구재단
src/main/core/boards/snu-daae.ts 서울대 건축학과
src/main/core/boards/generic.ts  RSS/Atom, HTML 목록
src/main/core/boards/diff.ts     새 글 판별
src/main/core/boards/index.ts    boardId, readPosts(주소→읽기 선택), readBoard(항목으로)
src/main/core/profile.ts     validateBoard
src/main/collector.ts        게시판 수집
src/main/ipc.ts, src/preload/*   previewBoard, addBoard, removeBoard
src/renderer/src/components/{ItemRow,BoardsEditor}.tsx, screens/*, styles.css, format.ts
```

## Review Focus

1. 게시판이 한 번 빈 목록이나 일부만 돌려준 다음 날, 옛 글이 새 소식으로 쏟아지지 않는다. (Task 4 `diffPosts`)
2. EUC-KR 게시판의 제목이 깨지지 않는다. (Task 1 `createFetchText`)
3. 실제 사용 중인 v1 `state.json`을 읽으면 항목·설정·키가 그대로이고 원본이 `state.v1.json`으로 남는다. (Task 1 `loadState`)
4. 같은 공고가 IRIS와 한국연구재단 양쪽에 있어도 한 번만 나온다. 게시판 하나가 실패해도 나머지는 수집되고 그 게시판의 "본 글"은 그대로다. (Task 5 `collect`)
5. 게시판 글의 제목에 `<script>`·`&amp;`가 있거나 주소가 `javascript:`이면 글자는 그대로 보이고 그런 글은 버린다. (Task 1 `finishPosts`, Task 4 `parseHtmlList`)

---

### Task 1: 계약, 상태 이전, 요청 도구 — 담당: Sonnet

**Files:**
- Modify: `src/shared/types.ts`, `src/main/store.ts`, `src/main/core/fetch-text.ts`, `src/main/collector.ts`(`CollectDeps.fetchText`의 타입만), `src/main/ipc.ts`(`getState`에 `boards`)
- Create: `src/main/core/boards/post.ts`
- Test: `tests/store.test.ts`, `tests/core/fetch-text.test.ts`, `tests/core/boards-post.test.ts`

**Interfaces — Produces:**

```ts
// src/shared/types.ts (추가·변경. ACTIVE_CATEGORIES는 이 과제에서 건드리지 않는다)
export type BoardCategory = 'grant' | 'conference' | 'school'
export const BOARD_CATEGORIES: BoardCategory[] = ['school', 'conference', 'grant']
export interface Board { id: string; name: string; url: string; category: BoardCategory }
export interface BoardInput { name: string; url: string; category: BoardCategory }
export type BoardResult = { ok: true } | { ok: false; error: string }
export type PreviewResult =
  | { ok: true; posts: { title: string; date: string | null }[] }
  | { ok: false; error: string }
export interface RawItem { /* 기존 필드 */ venue?: string; keywords?: string[] } // venue: 저널·학회·저장소 이름
export interface AppState { version: 2; /* 기존 필드 */ boards: Board[]; boardKnown: Record<string, string[]> } // boardKnown: 게시판 id → 지난번까지 본 글의 id와 주소. 키가 없으면 아직 읽은 적 없음
export interface PublicState { /* 기존 필드 */ boards: Board[] }

// src/main/core/fetch-text.ts
export type FetchText = (url: string, headers?: Record<string, string>, body?: string) => Promise<string>
export function createFetchText(fetchFn: FetchFn): FetchText
// FetchFn의 init: { method?: 'POST'; body?: string; headers; signal }, 응답: Pick<Response, 'ok' | 'status' | 'headers' | 'arrayBuffer'>

// src/main/core/boards/post.ts
export interface Post { key: string; title: string; url: string; date: string | null; summary: string } // date: ISO 또는 null(날짜 모름)
export function htmlText(fragment: string): string            // 태그를 공백으로 바꿈 → 엔티티 풀기(&amp; &lt; &gt; &quot; &#39; &nbsp; &#N; &#xH;) → 공백 정리
export function dateOf(y: string, m: string, d: string): string | null  // UTC 자정 ISO. 월 1~12, 일 1~31이 아니면 null
export function finishPosts(posts: Post[]): Post[]
```

규칙:

- `createFetchText`: `body`가 있으면 `method: 'POST'`. 본문은 `arrayBuffer()`로 받아, 8MB(`8 * 1024 * 1024`바이트)를 넘으면 `Error('응답이 너무 큽니다')`. 문자 인코딩은 `content-type` 헤더의 `charset`, 없으면 앞 2048바이트 안의 `<meta … charset=…>`, 그것도 없으면 `utf-8`. `TextDecoder`가 모르는 이름이면 `utf-8`. 기존 오류 문구(`HTTP <코드>`, `요청 시간 초과`, `네트워크 오류`)와 헤더 동작은 그대로다.
- `defaultState()`: `version: 2`, `boards: []`, `boardKnown: {}`.
- `loadState`: 읽은 값이 `version: 1`이면 (1) 같은 폴더에 `state.v1.json`이 없을 때 원본 파일을 그 이름으로 복사하고(`copyFileSync`) (2) `version: 2`, `boards: []`, `boardKnown: {}`를 더하고 (3) `source === 'OpenAlex'`이고 `summary`가 비어 있지 않고 `venue`가 없는 항목은 `venue = summary`, `summary = ''`로 바꾼다. 그 밖의 필드는 그대로다. 옮긴 값을 파일에 쓰지는 않는다(다음 저장 때 쓰인다). `isState`는 `version === 2`, `boards`가 배열, `boardKnown`이 객체인지를 더 본다. 깨진 파일 처리는 그대로다.
- `finishPosts`: 제목은 공백 정리. 제목이 비었거나 `key`가 비었거나 주소가 `isHttpUrl`이 아니면 버린다. 같은 `key`는 먼저 온 것만. `date`는 `Date`로 읽히면 `toISOString()`, 아니면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/store.test.ts 에 추가
test('v1 파일은 v2로 옮기고 원본을 state.v1.json으로 남긴다', () => {
  const v1 = { ...defaultState(), version: 1, profile: { keywordsEn: ['xai'], keywordsKo: [], country: 'KR' },
    openAlexKeyEnc: 'ZW5j', lastDailyRunAt: NOW,
    items: { 'paper:a': mk({ id: 'paper:a', source: 'OpenAlex', summary: 'Automation in Construction', seenAt: NOW, saved: true }),
             'paper:b': mk({ id: 'paper:b', source: 'arXiv', summary: 'abstract…' }) } } as Record<string, unknown>
  delete v1.boards; delete v1.boardKnown
  writeFileSync(f, JSON.stringify(v1))
  const s = loadState(f)
  expect(s).toMatchObject({ version: 2, boards: [], boardKnown: {}, openAlexKeyEnc: 'ZW5j', lastDailyRunAt: NOW,
    profile: { keywordsEn: ['xai'] } })
  expect(s.items['paper:a']).toMatchObject({ venue: 'Automation in Construction', summary: '', seenAt: NOW, saved: true })
  expect(s.items['paper:b']).toMatchObject({ summary: 'abstract…' }); expect(s.items['paper:b'].venue).toBeUndefined()
  expect(JSON.parse(readFileSync(join(dir, 'state.v1.json'), 'utf8')).version).toBe(1)
  expect(readdirSync(dir).some((n) => n.startsWith('state.corrupt-'))).toBe(false)
})
test('state.v1.json이 이미 있으면 덮어쓰지 않는다', () => { /* 미리 'keep' 을 써 두고 loadState 뒤에도 'keep' */ })
test('모르는 version은 깨진 파일로 다룬다', () => { /* version: 3 → defaultState(), state.corrupt-* 생김 */ })

// tests/core/fetch-text.test.ts 에 추가 (기존 테스트의 가짜 응답 { text } 는 { headers, arrayBuffer } 로 바꾼다)
test('본문이 있으면 POST로 보낸다', async () => {
  const fetchFn = vi.fn<FetchFn>(() => reply('x'))
  await createFetchText(fetchFn)('https://a', { 'Content-Type': 'application/json' }, '{"page":1}')
  expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"page":1}' })
  await createFetchText(fetchFn)('https://a')
  expect(fetchFn.mock.calls[1][1].method).toBeUndefined()
})
test('EUC-KR은 헤더나 meta의 charset으로 푼다', async () => {
  const euckr = new Uint8Array([0xb0, 0xf8, 0xc1, 0xf6]) // '공지'
  const withHeader = new Response(euckr, { headers: { 'content-type': 'text/html; charset=EUC-KR' } })
  await expect(createFetchText(() => Promise.resolve(withHeader))('https://x')).resolves.toBe('공지')
  const meta = new TextEncoder().encode('<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr"></head><body>')
  const body = new Uint8Array([...meta, ...euckr])
  const noHeader = new Response(body, { headers: { 'content-type': 'text/html' } })
  await expect(createFetchText(() => Promise.resolve(noHeader))('https://x')).resolves.toContain('공지')
})
test('모르는 charset은 utf-8로 읽는다', async () => { /* charset=x-unknown, 본문 '한글' → '한글' */ })
test('8MB를 넘으면 응답이 너무 큽니다', async () => { /* new Uint8Array(8 * 1024 * 1024 + 1) */ })

// tests/core/boards-post.test.ts
expect(htmlText('<b>R&amp;D</b>  예산 &lt;확대&gt;&nbsp;&#39;안내&#x27;')).toBe("R&D 예산 <확대> '안내'")
expect(dateOf('2026', '11', '2')).toBe('2026-11-02T00:00:00.000Z'); expect(dateOf('2026', '13', '1')).toBeNull()
const p = (o: Partial<Post>): Post => ({ key: 'k', title: 't', url: 'https://a.b/1', date: null, summary: '', ...o })
expect(finishPosts([p({ key: '1', title: '  공지   사항 ' }), p({ key: '1', title: '중복' }), p({ key: '2', url: 'javascript:alert(1)' }),
  p({ key: '', title: 'x' }), p({ key: '3', title: '   ' }), p({ key: '4', title: '<script>alert(1)</script>', date: '2026-11-25' }), p({ key: '5', date: 'nope' })]))
  .toEqual([p({ key: '1', title: '공지 사항' }), p({ key: '4', title: '<script>alert(1)</script>', date: '2026-11-25T00:00:00.000Z' }), p({ key: '5', date: null })])
```

- [ ] **Step 2:** `npm test` → 새 테스트 실패 확인
- [ ] **Step 3:** 구현. `tests/helpers.ts`의 `st()`와 기존 테스트가 새 `AppState`로 통과하도록 필요한 최소만 고친다.
- [ ] **Step 4:** `npm test && npm run typecheck` → 통과
- [ ] **Step 5:** 커밋 `feat: state v2 with boards, POST and charset in fetchText, board post helpers`

### Task 2: 논문의 저널명과 핵심 키워드 — 담당: Sonnet (커밋하지 않음)

**Files:**
- Modify: `src/main/core/sources/openalex.ts`, `src/main/core/sources/arxiv.ts`
- Test: `tests/core/sources.test.ts`

**Interfaces:** Consumes `RawItem.venue`, `RawItem.keywords` (Task 1). 함수 이름과 시그니처는 그대로다.

규칙:

- OpenAlex: `select`는 `id,doi,title,publication_date,primary_location,type,cited_by_count,keywords,primary_topic`. `venue` = `primary_location.source.display_name`(앞뒤 공백 제거, 비면 필드 없음). `summary`는 `''`. `keywords` = `keywords[]`를 `score` 내림차순으로 정렬한 `display_name` 앞 5개. 하나도 없고 `primary_topic.display_name`이 있으면 그것 하나. 그래도 없으면 필드 없음.
- arXiv: `venue` = `<arxiv:journal_ref>` 글자(공백 정리, 없으면 필드 없음). `keywords` = `<category term="…">`의 `term`들(문서 순서, 중복 제거, 앞 5개). `<category>`는 하나일 때 객체, 여럿일 때 배열로 온다. `summary`는 지금처럼 초록 앞 200자.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('OpenAlex: 저널명과 핵심 키워드', () => {
  const items = parseOpenAlex(fx('openalex-keywords.json'))
  expect(items[0]).toMatchObject({ venue: 'Lirias', summary: '',
    keywords: ['public employment services', 'model interpretability', 'job matching', 'counterfactual explanations', 'SHAP'] })
  const noKw = items.find((i) => i.title.startsWith('Hyperbolic Multi-view'))!
  expect(noKw.keywords).toEqual(['Misinformation and Its Impacts'])
  expect(noKw.venue).toBe('Communications in computer and information science')
  expect(new URL(buildOpenAlexUrl(['a'], new Date('2026-11-24T03:00:00Z'), 'K')).searchParams.get('select'))
    .toBe('id,doi,title,publication_date,primary_location,type,cited_by_count,keywords,primary_topic')
})
test('OpenAlex: 키워드도 주제도 없으면 필드가 없다', () => { /* 인라인 JSON, 'keywords' in item === false, 'venue' in item === false */ })
test('arXiv: 분류와 journal_ref', () => {
  for (const it of parseArxiv(fx('arxiv.xml'))) { expect(it.keywords!.length).toBeGreaterThan(0); for (const k of it.keywords!) expect(k).toMatch(/^[a-z-]+(\.[A-Za-z-]+)?$/) }
  // 인라인: <category term="cs.LG"/> 하나 + <arxiv:journal_ref>Nature 600 (2026)</arxiv:journal_ref>
  expect(parseArxiv(ARXIV_JREF)[0]).toMatchObject({ venue: 'Nature 600 (2026)', keywords: ['cs.LG'] })
  // 인라인: category 둘(cs.LG, stat.ML, cs.LG 중복) → ['cs.LG', 'stat.ML'], venue 없음
})
```

- [ ] **Step 2:** `npx vitest run tests/core/sources.test.ts` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run tests/core/sources.test.ts tests/collector.test.ts` → 통과

### Task 3: 전용 읽기 3종 — 담당: Sonnet (커밋하지 않음)

**Files:**
- Create: `src/main/core/boards/iris.ts`, `src/main/core/boards/nrf.ts`, `src/main/core/boards/snu-daae.ts`
- Test: `tests/core/boards-sites.test.ts`

**Interfaces:**
- Consumes: `Post`, `finishPosts`, `htmlText`, `dateOf` (`./post`), `FetchText` (`../fetch-text`)
- Produces (모든 `parse*`는 `finishPosts`를 거친 `Post[]`를 돌려주고, 구조가 기대와 다르면 `Error`를 던진다. 구조는 맞는데 0건이면 `[]`):

```ts
// iris.ts
export function readIris(fetchText: FetchText): Promise<Post[]>          // ancmIng, ancmPre 차례로 요청해 이어 붙임
export function parseIris(json: string, prg: 'ancmIng' | 'ancmPre'): Post[]
// nrf.ts
export function parseNrf(html: string): Post[]
// snu-daae.ts
export function snuDaaeCategory(url: string): string | null              // 호스트가 architecture.snu.ac.kr이 아니면 null. 경로가 /posts/<notice|news|events|forms>면 그 값, 그 밖은 'notice'
export function readSnuDaae(category: string, fetchText: FetchText): Promise<Post[]>
export function parseSnuDaae(json: string): Post[]
```

| | key | title | url | date | summary |
|---|---|---|---|---|---|
| IRIS | `ancmId` | `ancmTl` | 상세 주소(위 표, `ancmPrg`는 요청에 쓴 값) | `ancmDe` | `<sorgnNm> · 접수 <rcveStrDe> ~ <rcveEndDe>` (없는 부분은 뺀다) |
| 한국연구재단 | `data-post_no` | `title-name` 링크의 글자(`htmlText`) | 상세 주소 | 접수 시작일 | `접수 <시작일> ~ <마감일>` (날짜만, 없으면 `''`) |
| 서울대 건축학과 | `idx` | `title` | `https://architecture.snu.ac.kr/post/<idx>` | `post_date` | `''` |

- IRIS 오류: `listBsnsAncmBtinSitu`가 배열이 아니면 `Error('IRIS 응답에 목록이 없습니다')`.
- 한국연구재단: `<!-- … -->` 주석을 먼저 지운다(주석 안에 가짜 링크가 있다). `pnb-state`에 `접수마감`이 든 블록은 뺀다. 문서에 `public-notice-list`가 없으면 `Error('한국연구재단 페이지에서 목록을 찾지 못했습니다')`.
- 서울대: `list`가 배열이 아니거나 `err`가 0이 아니면 `Error('서울대 건축학과 응답에 목록이 없습니다')`.
- 요청 형식은 "확인된 사실" 표 그대로.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const fx = (n: string) => readFileSync(`tests/fixtures/boards/${n}`, 'utf8')
test('IRIS', () => {
  const posts = parseIris(fx('iris.json'), 'ancmIng')
  expect(posts).toHaveLength(4)
  expect(posts[0]).toEqual({ key: '024799', title: '2026년도 제5차 과학기술분야 연구기획과제 공모',
    url: 'https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmId=024799&ancmPrg=ancmIng',
    date: '2026-11-13T00:00:00.000Z', summary: '한국연구재단 · 접수 2026.11.13 ~ 2026.11.26' })
  expect(() => parseIris('{"message":"error"}', 'ancmIng')).toThrow('IRIS 응답에 목록이 없습니다')
  expect(parseIris('{"listBsnsAncmBtinSitu":[]}', 'ancmPre')).toEqual([])
})
test('readIris는 접수 중과 접수 예정을 POST로 읽는다', async () => {
  const calls: [string, Record<string, string> | undefined, string | undefined][] = []
  const posts = await readIris(async (u, h, b) => { calls.push([u, h, b]); return fx('iris.json') })
  expect(calls.map((c) => c[2])).toEqual(['pageIndex=1&ancmPrg=ancmIng', 'pageIndex=1&ancmPrg=ancmPre'])
  expect(calls[0][0]).toBe('https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do')
  expect(calls[0][1]).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' })
  expect(posts).toHaveLength(4) // 같은 key는 한 번만
})
test('한국연구재단', () => {
  const posts = parseNrf(fx('nrf.html'))
  expect(posts.map((p) => p.key)).toEqual(['285561', '285270', '284986', '285818']) // 접수마감 2건 제외
  expect(posts[0]).toEqual({ key: '285561', title: '2027년도「유럽핵입자물리연구소(CERN) 협력사업」 이론물리 공동연구 대학원생 파견 공고',
    url: 'https://www.nrf.re.kr/biz/notice/view?menu_no=362&post_no=285561&biz_no=359',
    date: '2026-11-09T00:00:00.000Z', summary: '접수 2026-11-09 ~ 2026-12-11' })
  expect(() => parseNrf('<html><body>점검 중</body></html>')).toThrow()
  expect(parseNrf('<div class="public-notice-list"></div>')).toEqual([])
})
test('서울대 건축학과', () => {
  const posts = parseSnuDaae(fx('snu-daae.json'))
  expect(posts).toHaveLength(27)
  expect(posts[0]).toMatchObject({ key: '25520', url: 'https://architecture.snu.ac.kr/post/25520', date: '2026-11-18T00:00:00.000Z', summary: '' })
  expect(() => parseSnuDaae('{"err":1}')).toThrow()
  expect(snuDaaeCategory('https://architecture.snu.ac.kr/posts/events')).toBe('events')
  expect(snuDaaeCategory('https://architecture.snu.ac.kr/')).toBe('notice')
  expect(snuDaaeCategory('https://cse.snu.ac.kr/posts/notice')).toBeNull()
  expect(snuDaaeCategory('not a url')).toBeNull()
})
test('readSnuDaae는 JSON 본문으로 POST한다', async () => { /* url, Content-Type: application/json, body '{"page":1,"category":"events","search":""}' */ })
```

- [ ] **Step 2:** `npx vitest run tests/core/boards-sites.test.ts` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run tests/core/boards-sites.test.ts` → 통과

### Task 4: 일반 읽기와 새 글 판별 — 담당: Sonnet (커밋하지 않음)

**Files:**
- Create: `src/main/core/boards/generic.ts`, `src/main/core/boards/diff.ts`
- Test: `tests/core/boards-generic.test.ts`, `tests/core/boards-diff.test.ts`

**Interfaces:**
- Consumes: `Post`, `finishPosts`, `htmlText`, `dateOf` (`./post`), `xml`, `textOf` (`../sources/common`), `normalizeTitle` (`../text`)
- Produces:

```ts
// generic.ts
export function parseBoardPage(body: string, baseUrl: string): Post[]   // 피드면 parseFeed, 아니면 parseHtmlList. 못 찾으면 []
export function parseFeed(body: string): Post[] | null                  // RSS/Atom이 아니면 null
export function parseHtmlList(html: string, baseUrl: string): Post[]
// diff.ts
export const FIRST_READ_DAYS = 30, FIRST_READ_MAX = 10, KNOWN_MAX = 600
export interface Seen { id: string; url: string; date: string | null }
export function diffPosts<T extends Seen>(posts: T[], known: string[] | undefined, now: Date): { fresh: T[]; known: string[] }
```

`parseFeed`: 앞 공백을 뗀 본문이 `<?xml`, `<rss`, `<feed`로 시작하지 않으면 `null`. `rss.channel.item[]`은 `title`, `link`, `pubDate`, `guid`; `feed.entry[]`는 `title`, `link`(`@_href`, 여럿이면 `rel`이 없거나 `alternate`인 것), `updated ?? published`, `id`. `key` = `guid`/`id`, 없으면 주소. 둘 다 아니면 `null`.

`parseHtmlList` (기준 구현 `proto.py`의 `find`를 그대로 옮긴다):

1. `<script>…</script>`, `<style>…</style>`, `<!-- … -->`를 지운다.
2. 모든 `<a …>…</a>`에서 `href`를 꺼낸다. 비었거나 `#`, `javascript:`, `mailto:`, `tel:`로 시작하면 건너뛴다. `new URL(href, baseUrl)`로 풀고 `#` 뒤를 뗀다. `http(s)`가 아니거나 호스트가 `baseUrl`과 다르면 건너뛴다. 제목은 `htmlText(안쪽)`, 4자 미만이면 건너뛴다.
3. 주소의 모양 = 호스트 + 경로(숫자 묶음을 `#`으로) + `?` + 쿼리 키 이름(정렬, `&`로 연결). 모양이 같은 링크끼리 묶는다.
4. 묶음 안에서 같은 주소는 먼저 온 것만. 5개 미만이거나 제목 평균 길이가 10 미만인 묶음은 버린다.
5. 날짜: 링크 끝부터 같은 묶음의 다음 링크 시작(마지막은 +600자)까지의 글자에서 첫 날짜, 없으면 앞 링크 끝(첫 링크는 −600자)부터 이 링크 시작까지에서 마지막 날짜. 날짜 형식 `/(?<!\d)(20\d{2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{1,2})(?!\d)/`.
6. 점수 = 개수 × min(평균 길이, 40) × (날짜 있는 링크가 절반 이상이면 3, 아니면 1). 가장 높은 묶음(같으면 문서에서 먼저 나온 것).
7. `key` = `normalizeTitle(제목)` + (날짜가 있으면 `:YYYY-MM-DD`), `summary` = `''`.

`diffPosts`:

- `known === undefined`(처음 읽음): `fresh` = 날짜가 있고 `now`에서 30일 안인 글을 최신순으로 10개까지.
- 그 밖: `fresh` = `id`도 `url`도 `known`에 없는 글(받은 순서).
- 돌려주는 `known` = 이전 값 중 이번 목록에 없는 것 + 이번 글들의 `id`와 `url`(중복 없이) 중 뒤에서 600개. 이번 목록이 비어도 이전 값은 남는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const fx = (n: string) => readFileSync(`tests/fixtures/boards/${n}`, 'utf8')
test('서울대 컴퓨터공학부 공지', () => {
  const posts = parseBoardPage(fx('cse-snu.html'), 'https://cse.snu.ac.kr/ko/community/notice')
  expect(posts).toHaveLength(20)
  expect(posts[0]).toEqual({ key: normalizeTitle('2027학년도 1학기 국가장학금 신청 안내') + ':2026-11-24', title: '2027학년도 1학기 국가장학금 신청 안내',
    url: 'https://cse.snu.ac.kr/ko/community/notice/25899', date: '2026-11-24T00:00:00.000Z', summary: '' })
})
test('한국콘크리트학회', () => {
  const posts = parseBoardPage(fx('kci.html'), 'https://www.kci.or.kr/')
  expect(posts).toHaveLength(23)
  expect(posts[0].url).toBe('https://www.kci.or.kr/board/?_0000_method=view&ncode=a001&num=6843'); expect(posts[0].date).toBe('2026-11-17T00:00:00.000Z')
})
test('서울대 본부 공지', () => {
  const posts = parseBoardPage(fx('snu-main.html'), 'https://www.snu.ac.kr/snunow/notice/genernal')
  expect(posts).toHaveLength(7)
  expect(posts[0].url).toBe('https://www.snu.ac.kr/snunow/notice/genernal?md=v&bbsidx=179675'); expect(posts[2].date).toBe('2026-11-02T00:00:00.000Z')
})
test('RSS', () => {
  const posts = parseBoardPage(fx('gsds-feed.xml'), 'https://gsds.snu.ac.kr/feed/')
  expect(posts).toHaveLength(10)
  expect(posts[0]).toMatchObject({ key: 'https://gsds.snu.ac.kr/?p=18938', title: 'UIUC 박용주 교수, Fast Code Sandboxes for AI Agents, 11월 18일(수)', date: '2026-11-16T10:55:25.000Z' })
})
test('Atom', () => { /* 인라인 <feed><entry><title>…</title><link href="https://a.b/1"/><id>tag:1</id><updated>2026-11-20T00:00:00Z</updated></entry></feed> */ })
test('목록이 없으면 빈 배열', () => {
  expect(parseBoardPage('<html><body><a href="/a">메뉴</a><a href="/b">소개</a></body></html>', 'https://a.b/')).toEqual([])
  expect(parseBoardPage('', 'https://a.b/')).toEqual([])
})
test('위험한 링크와 다른 사이트 링크는 글로 치지 않는다', () => {
  // 같은 모양 링크 6개(/view?id=1..6, 제목 12자 이상) 사이에 javascript:alert(1), https://evil.example/view?id=9, 제목에 <b>R&amp;D</b> 를 섞는다
  // → 6건, 제목은 'R&D …' 글자 그대로, evil·javascript 없음
})
// tests/core/boards-diff.test.ts   (now = new Date('2026-11-25T03:00:00Z'), s(id, date) = { id, url: 'https://a.b/' + id, date })
test('처음 읽을 때는 최근 30일의 글을 최신순으로 10건까지', () => {
  const posts = [s('old', '2026-07-01T00:00:00.000Z'), s('undated', null), ...Array.from({ length: 12 }, (_, i) => s('n' + i, `2026-11-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`))]
  const { fresh, known } = diffPosts(posts, undefined, now)
  expect(fresh.map((p) => p.id)).toEqual(['n11', 'n10', 'n9', 'n8', 'n7', 'n6', 'n5', 'n4', 'n3', 'n2'])
  expect(known).toContain('old'); expect(known).toContain('https://a.b/undated'); expect(known).toHaveLength(28)
})
test('그다음부터는 처음 보는 글만', () => {
  const first = diffPosts([s('a', null), s('b', null)], undefined, now)
  expect(first.fresh).toEqual([])
  expect(diffPosts([s('c', null), s('a', null)], first.known, now).fresh.map((p) => p.id)).toEqual(['c'])
})
test('주소가 같으면 제목(id)이 바뀌어도 새 글이 아니다. id가 같으면 주소가 바뀌어도 새 글이 아니다', () => {
  const k = diffPosts([s('a', null)], undefined, now).known
  expect(diffPosts([{ id: 'a2', url: 'https://a.b/a', date: null }], k, now).fresh).toEqual([])
  expect(diffPosts([{ id: 'a', url: 'https://a.b/other', date: null }], k, now).fresh).toEqual([])
})
test('한 번 빈 목록이 와도 본 글을 잊지 않는다', () => {
  const k1 = diffPosts([s('a', null), s('b', null)], undefined, now).known
  const k2 = diffPosts([], k1, now).known
  expect(diffPosts([s('a', null), s('b', null)], k2, now).fresh).toEqual([])
})
test('known은 600개까지, 이번 목록에 있는 것이 뒤에 남는다', () => {
  const old = Array.from({ length: 600 }, (_, i) => 'x' + i)
  const { known } = diffPosts([s('pinned', null)], ['pinned', ...old], now)
  expect(known).toHaveLength(600); expect(known.slice(-2)).toEqual(['pinned', 'https://a.b/pinned']); expect(known).not.toContain('x0')
})
```

- [ ] **Step 2:** `npx vitest run tests/core/boards-generic.test.ts tests/core/boards-diff.test.ts` → 실패 확인
- [ ] **Step 3:** 구현. 건수(20, 23, 7)는 기준 구현의 결과다. 규칙대로 옮겼는데 건수가 다르면 테스트나 규칙을 고치지 말고 차이를 보고한다.
- [ ] **Step 4:** 같은 명령 → 통과

### Task 5: 출처 목록, 수집기, IPC 통합 — 담당: Opus

**Files:**
- Create: `src/main/core/boards/index.ts`
- Modify: `src/shared/sources.ts`, `src/main/collector.ts`, `src/main/core/merge.ts`, `src/main/core/profile.ts`, `src/main/core/tick.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/App.tsx`·`screens/Settings.tsx`(새 `activeSources`에 맞춘 최소 수정)
- Test: `tests/core/boards-index.test.ts`, `tests/collector.test.ts`, `tests/format.test.ts`, `tests/core/merge.test.ts`, `tests/core/profile.test.ts`

**Interfaces:**
- Consumes: Task 1~4의 모든 Produces
- Produces:

```ts
// src/shared/sources.ts
export const BUILTIN_BOARDS: Board[] = [
  { id: 'iris', name: 'IRIS', url: 'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituListView.do', category: 'grant' },
  { id: 'nrf', name: '한국연구재단', url: 'https://www.nrf.re.kr/biz/notice/list?menu_no=362&bizNotGubn=guide', category: 'grant' }
]
export interface Source { name: string; category: Category; board?: Board }
export function activeSources(profile: Profile, settings: Settings, hasOpenAlexKey: boolean, boards: Board[]): Source[]
// 순서: OpenAlex, arXiv, GitHub, Google 뉴스(한국어), Google 뉴스(영문), [국가가 KR이면 IRIS, 한국연구재단], 사용자 게시판(등록 순). 카테고리가 꺼진 것은 빠진다.
export const allFailed(names: string[], errors): boolean   // 그대로

// src/main/core/boards/index.ts
export function boardId(url: string): string   // node:crypto sha1(url)의 hex 앞 10자
export function readPosts(url: string, fetchText: FetchText): Promise<Post[]>
// 호스트가 www.iris.go.kr/iris.go.kr → readIris. 호스트가 www.nrf.re.kr/nrf.re.kr이고 경로가 /biz/notice/list → GET 후 parseNrf.
// snuDaaeCategory(url) !== null → readSnuDaae. 그 밖 → GET 후 parseBoardPage, 0건이면 Error('글 목록을 찾지 못했습니다')
export function readBoard(board: Board, fetchText: FetchText, known: string[] | undefined, now: Date): Promise<{ fresh: RawItem[]; known: string[] }>
// 항목 id: category가 'grant'면 'grant:' + normalizeTitle(title)(비면 버림), 아니면 'board:' + board.id + ':' + post.key
// source = board.name, category = board.category, date = post.date ?? now.toISOString(), summary = post.summary

// src/main/core/profile.ts
export function validateBoard(input: unknown, boards: Board[]): { ok: true; board: Board } | { ok: false; error: string }

// src/preload/index.d.ts (Api에 추가)
previewBoard(url: string): Promise<PreviewResult>
addBoard(input: BoardInput): Promise<BoardResult>
removeBoard(id: string): Promise<void>
```

규칙:

- `collect`: 켜고 끄는 조건을 직접 쓰지 않고 `activeSources(profile, settings, key !== '', state.boards)`의 이름으로만 판단한다. 시작할 때 `sourceErrors`에서 켜진 출처가 아닌 이름을 지운다. 기존 다섯 출처 뒤에 `board`가 있는 출처를 순서대로 `readBoard(board, fetchText, boardKnown[board.id], now)`로 읽고, 성공하면 `boardKnown[board.id]`를 돌려받은 값으로 바꾼다. 실패하면 오류만 남기고 `boardKnown`은 그대로다. 돌려주는 상태에 `boardKnown`을 담는다.
- `applyCollected`: `boardKnown`은 `collected`의 것을 쓴다.
- `validateBoard`: 모양(`name`·`url`이 문자열, `category`가 `BOARD_CATEGORIES` 안)이 아니면 `입력 형식이 올바르지 않습니다.` / 이름은 공백 정리 뒤 1~30자, 아니면 `이름을 1~30자로 입력해 주십시오.` / 주소는 앞뒤 공백을 떼고 `isHttpUrl`이며 500자 이하, 아니면 `주소는 http:// 또는 https://로 시작해야 합니다.` / 이미 10개면 `게시판은 10개까지 등록할 수 있습니다.` / 이름이 등록된 게시판이나 기본 출처 이름(`OpenAlex`, `arXiv`, `GitHub`, `Google 뉴스(한국어)`, `Google 뉴스(영문)`, `IRIS`, `한국연구재단`)과 같으면 `이미 쓰고 있는 이름입니다.` / `new URL(url).href`가 등록된 게시판이나 `BUILTIN_BOARDS`의 주소와 같으면 `이미 등록된 주소입니다.` 통과하면 `{ id: boardId(href), name, url: href, category }`.
- IPC `previewBoard`: 주소가 문자열이 아니거나 `isHttpUrl`이 아니면 `{ ok: false, error: '주소는 http:// 또는 https://로 시작해야 합니다.' }`. `readPosts`가 던지면 그 메시지, 0건이면 `글 목록을 찾지 못했습니다`. 성공하면 모든 글에 날짜가 있을 때는 최신순, 아니면 받은 순서로 앞 5건의 `{ title, date }`.
- IPC `addBoard`: `validateBoard` → 상태에 더하고 저장(실패하면 `설정을 저장하지 못했습니다.`) → `collectFresh()`를 기다리지 않고 시작 → `{ ok: true }`.
- IPC `removeBoard`: 그 id의 게시판과 `boardKnown[id]`를 지우고 저장. 모르는 id면 아무것도 하지 않는다. 이미 모은 항목은 남긴다.
- `IpcDeps`에 `fetchText: FetchText`를 더하고 `index.ts`에서 넘긴다. 어떤 값이 와도 처리기는 던지지 않는다(기존 규칙).

- [ ] **Step 1: 실패하는 테스트 작성** — 아래를 반드시 포함한다.

```ts
// tests/collector.test.ts (가짜 fetchText는 호스트로 fixture를 고른다: www.iris.go.kr → boards/iris.json, www.nrf.re.kr → boards/nrf.html,
//   architecture.snu.ac.kr → boards/snu-daae.json. NOW를 '2026-11-25T03:00:00.000Z'로 둔 별도 describe)
test('한국이면 IRIS와 한국연구재단의 공고가 과제 공고로 들어오고, 같은 제목은 한 번만', async () => {
  const out = await collect(withProfileKR, deps({}))
  const grants = Object.values(out.items).filter((i) => i.category === 'grant')
  expect(grants.filter((g) => g.title === '2026년도 제5차 과학기술분야 연구기획과제 공모').map((g) => g.source)).toEqual(['IRIS'])
  expect(grants.some((g) => g.source === '한국연구재단')).toBe(true)
  expect(Object.keys(out.boardKnown).sort()).toEqual(['iris', 'nrf'])
})
test('그 외 국가면 과제 공고를 요청하지 않는다', …)
test('등록한 게시판: 처음에는 최근 글 10건, 다시 수집하면 0건', async () => {
  const board = { id: boardId('https://architecture.snu.ac.kr/posts/notice'), name: '건축학과', url: 'https://architecture.snu.ac.kr/posts/notice', category: 'school' as const }
  const s1 = await collect({ ...withProfileKR, boards: [board] }, deps({}))
  const school = Object.values(s1.items).filter((i) => i.category === 'school')
  expect(school).toHaveLength(10); expect(school.every((i) => i.source === '건축학과' && i.id.startsWith(`board:${board.id}:`))).toBe(true)
  const s2 = await collect(s1, deps({}))
  expect(Object.keys(s2.items).length).toBe(Object.keys(s1.items).length)
})
test('게시판 하나가 실패해도 나머지는 계속하고, 그 게시판의 boardKnown은 그대로다', …)   // fail: ['architecture.snu.ac.kr'] → sourceErrors에 '건축학과'만
test('꺼진 카테고리의 게시판은 요청하지 않고 옛 오류도 지운다', …)
// tests/core/boards-index.test.ts: readPosts가 주소별로 맞는 읽기를 고르는지(부른 URL·본문으로 확인), 일반 페이지 0건이면 '글 목록을 찾지 못했습니다', boardId가 같은 주소에 같은 값·길이 10
// tests/format.test.ts: activeSources 기존 테스트를 새 시그니처(이름 비교는 .map((s) => s.name))로 고치고, KR + grant 켬 → IRIS·한국연구재단 포함, OTHER → 없음, 사용자 게시판은 등록 순으로 끝에, 카테고리를 끄면 빠짐
// tests/core/profile.test.ts: validateBoard의 오류 문구 여섯 개와 성공 값
// tests/core/merge.test.ts: applyCollected가 collected.boardKnown을 쓴다
```

- [ ] **Step 2:** `npm test` → 새 테스트 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → 통과
- [ ] **Step 5:** 커밋 `feat: board sources in collector, registry, and IPC`

### Task 6: 화면 — 담당: Sonnet

**Files:**
- Create: `src/renderer/src/components/BoardsEditor.tsx`
- Modify: `components/ItemRow.tsx`, `screens/Feed.tsx`, `screens/Settings.tsx`, `screens/ProfileForm.tsx`, `screens/Onboarding.tsx`, `App.tsx`, `styles.css`, `format.ts`, `src/shared/types.ts`(`ACTIVE_CATEGORIES` 삭제, 쓰는 곳은 `CATEGORIES`)
- Test: `tests/format.test.ts`

**Interfaces — Produces:**

```ts
// format.ts
export function isoDate(iso: string): string   // 현지 날짜 YYYY-MM-DD
export function paperChips(item: Pick<Item, 'matched' | 'keywords'>): { text: string; match: boolean }[]
// 일치한 내 키워드(match: true)를 먼저, 이어서 논문 키워드 중 대소문자 무시로 겹치지 않는 것(match: false). 합쳐서 6개까지.
```

화면 규칙:

- **논문 줄** (`item.category === 'paper'`): 제목 아래 한 줄에 출처 배지(`OpenAlex`/`arXiv`), 저널명(`item.venue`, 없고 출처가 arXiv면 `사전공개`, 그것도 없으면 생략), 게재일자(`isoDate(item.date)`). 그 아래 줄에 키워드 칩(`paperChips`), 하나도 없으면 줄을 만들지 않는다. 초록(`summary`)과 `일치: …` 글자는 논문 줄에서 보이지 않는다. 아래 줄의 왼쪽 글자는 `withCategory`일 때 `논문`만, 아니면 비운다. 저장·관심 없음 버튼은 그대로.
  - 클래스: `item-paper-meta`(줄) 안에 `src-badge`, `venue`, `pub-date`; `kw-list`(`<ul aria-label="핵심 키워드">`) 안에 `kw`, 일치는 `kw is-match`.
  - 모양: 줄은 13px, `--muted`. 배지는 11px, 1px `--line` 테두리, 모서리 4px, 안쪽 여백 `1px 6px`. 저널명은 `--text`, 굵기 500, 한 줄 넘치면 말줄임. 날짜는 `font-variant-numeric: tabular-nums`. 칩은 12px, 알약 모양, 바탕 `--surface`, 글자 `--muted`; 일치 칩은 글자 `--accent`, 바탕 없음, 안쪽 1px `--accent` 테두리. 칩 줄은 여러 줄로 넘어간다.
- **다른 카테고리 줄**은 지금 그대로다.
- **카테고리 칩**: `App`이 `activeSources(...)`의 카테고리(중복 없이 `CATEGORIES` 순서)를 `Feed`에 넘기고, 칩은 그 카테고리만 보인다. `Feed`의 `sources` prop(이름 배열)은 그대로 둔다.
- **설정의 카테고리 켜기/끄기**: 여섯 개 모두. 아래 안내 `과제 공고는 국가가 한국일 때 IRIS와 한국연구재단의 신규 공고를 가져옵니다. 학회와 학교 공지는 아래 게시판에 등록한 주소에서 가져옵니다.`
- **게시판 구역** (`BoardsEditor`, 설정에서 프로필 폼과 출처 상태 사이): 제목 `게시판`, 설명 `학교·학회 공지 게시판의 주소를 등록하면 새 글을 알려 드립니다.`
  - 등록된 게시판 목록: 이름, 분류(`CATEGORY_LABEL`), 주소(흐리게, 말줄임), `삭제` 버튼(`btn-quiet`) → `removeBoard` 후 `onChanged()`.
  - 추가 폼: `이름`(최대 30자), `주소`(`type="url"`), `분류`(select: 학교 공지·학회·과제 공고, 기본 학교 공지), 버튼 `글 목록 확인` → `previewBoard(주소)`.
  - 기다리는 동안: `<LiveOrb size={16} busy />`와 `글 목록을 읽는 중입니다`. 버튼은 `aria-disabled`.
  - 성공: `최근 글을 읽었습니다. 맞으면 등록해 주십시오.`와 글 목록(제목, 날짜가 있으면 `isoDate`) 그리고 `등록` 버튼(`btn-primary`) → `addBoard` → 성공하면 폼을 비우고 `onChanged()`, 실패하면 오류 문구.
  - 실패: 오류 문구(`.errors`)와 안내 `목록을 스크립트로 그리거나 로그인이 필요한 게시판은 읽지 못합니다.`
  - 이름·주소·분류를 고치면 미리보기를 지운다(다시 확인해야 등록할 수 있다).
  - 10개가 등록되어 있으면 추가 폼 대신 `게시판은 10개까지 등록할 수 있습니다.`
- **첫 실행 화면**: 폼 아래에 한 줄 `학교·학회 게시판은 시작한 뒤 설정에서 추가할 수 있습니다.`
- 새 요소도 `:hover`·`:focus-visible`·어두운 모드·`prefers-reduced-motion` 규칙을 지킨다(기존 스타일의 방식을 따른다).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(isoDate(new Date(2026, 10, 5, 23, 0).toISOString())).toBe('2026-11-05')
expect(paperChips({ matched: ['XAI'], keywords: ['xai', 'SHAP', 'graph neural networks'] }))
  .toEqual([{ text: 'XAI', match: true }, { text: 'SHAP', match: false }, { text: 'graph neural networks', match: false }])
expect(paperChips({ matched: [], keywords: undefined })).toEqual([])
expect(paperChips({ matched: ['a', 'b'], keywords: ['c', 'd', 'e', 'f', 'g'] })).toHaveLength(6)
```

- [ ] **Step 2:** `npx vitest run tests/format.test.ts` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → 통과
- [ ] **Step 5:** 커밋 `feat: paper metadata row, board settings, all categories`

### Task 7: 마무리 — 담당: Fable(메인)

- [ ] 전체 검토(Opus)와 지적 사항 수정
- [ ] 임시 `--user-data-dir`로 띄워 확인: v1 상태 파일 이전, 과제 공고 표시, 서울대 건축학과 게시판 미리보기·등록·새 글, EUC-KR 게시판 미리보기(대한건축학회), 논문 줄 모양(밝은/어두운 모드), 화면 캡처
- [ ] `package.json` 버전 `0.2.0`, 설계 문서와 이 계획에 결과 기록, `npm run build:mac`

## 설계에서 바뀌는 것 (2026-11-25)

1. **처음 등록한 게시판의 최근 글은 새 소식으로 보인다.** 설계 4.2는 "등록 시점에 이미 있던 글은 새 소식으로 치지 않는다"였다. 그대로 하면 등록 직후와 2단계로 올린 직후에 과제 공고·학교 공지가 비어 보여 동작하는지 알 수 없다. 날짜가 있는 최근 30일의 글을 최신순 10건까지만 새 소식으로 치고, 나머지와 날짜 없는 글은 기준선으로 둔다. [Claude 판단]
2. **게시판 주소는 첫 실행 화면이 아니라 설정에서 등록한다.** 첫 실행 화면을 짧게 유지하기 위해서다. [Claude 판단]
3. **스크립트로 그리는 사이트도 전용 읽기가 있으면 읽는다.** 서울대 건축학과(사용자 지정)가 그런 사이트라 전용 읽기를 넣었다.
4. **논문 줄**: 제목 아래에 출처·저널명·게재일자·핵심 키워드. [사용자 요청 2026-11-25] 초록 미리보기와 "일치:" 글자는 논문 줄에서 뺐다(일치한 키워드는 강조 칩으로 보인다). [Claude 판단]
5. **과제 공고의 중복**: IRIS와 한국연구재단에 같은 제목의 공고가 있으면 한 번만 보인다.

## 이 계획에 넣지 않은 것

- 게시판의 2쪽 이후 읽기, 날짜가 `11-25`처럼 연도 없이 적힌 게시판의 날짜
- 링크가 `javascript:`로만 된 게시판(전용 읽기가 없는 곳)
- 이미 모은 논문에 키워드 채워 넣기(새로 모이는 논문부터 보인다)
- 참고문헌 찾기·추세 그래프(3단계), 배포 마무리(4단계)
