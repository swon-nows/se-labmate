# 연구비서 1단계(기본 출처 피드와 알림) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Context

사용자는 논문·저장소·뉴스·공고를 여러 사이트에서 따로 확인하는 불편을 없애려고 "연구비서" 데스크탑 앱을 만들기로 했고, 설계 문서를 승인했다(2026-11-24 "이제 빌드 시작"). 설계는 4단계로 나뉘어 있고 각 단계가 끝나면 쓸 수 있는 앱이 나온다. 이 계획은 **1단계만** 다룬다: 프로필 입력, 논문·저장소·뉴스 수집, 본 것 기억, 카테고리 칩, 정시 알림, 수집 중 오브, 앱·트레이 아이콘, 그리고 지인에게 줄 Windows 시험판. 2~4단계(게시판 감시, 참고문헌·추세 그래프, 배포 마무리)는 1단계가 끝난 뒤 각각 별도 계획으로 쓴다.

현재 `~/Desktop/research-assistant/`에는 설계 문서만 있고 코드와 git 저장소는 없다.

**Goal:** 프로필을 입력하면 논문·저장소·뉴스의 새 소식이 카테고리별로 모이고, 정한 시각에 하루 한 번 알림이 오는 Mac/Windows 데스크탑 앱을 만든다.

**Architecture:** Electron 메인 프로세스가 수집·저장·일정·알림·트레이를 맡고, 렌더러(React)는 화면만 그린다. 응답 변환, 합치기, 새 소식 판별, 일정 계산은 Electron을 불러오지 않는 순수 함수(`src/main/core/`)로 두고 실제 응답 파일로 테스트한다. 렌더러는 preload가 내놓은 `window.api`만 쓴다.

**Tech Stack (2026-11-24 npm 확인):** Electron 45, electron-vite 6 (react-ts 템플릿), React 19, TypeScript, Vitest 5, electron-builder 26, fast-xml-parser 5, @yogesharc/thinking-orbs 0.1.2, React Bits Orb(소스 복사). 로컬 Node v26.8.2 / npm 11.19.1 / Apple Silicon.

**Spec:** `~/Desktop/research-assistant/docs/superpowers/specs/2026-11-23-research-assistant-design.md` (구현자는 이 계획과 함께 읽는다)

**실행 방식 (사용자 전역 지침으로 이미 정해짐):** 과제별로 하위 에이전트에 맡긴다. 각 과제의 "담당"에 적힌 모델을 쓴다. Sonnet은 스펙이 완전한 구현, Opus는 여러 파일을 잇는 통합, Fable(메인)은 과제 사이 검토와 마지막 전체 검증을 맡는다. 과제는 순서대로 하나씩 실행한다.

## Global Constraints

- 삭제 명령 금지: `rm`, `git rm`, `git clean`, `git reset --hard`를 쓰지 않는다. 지울 것이 생기면 멈추고 보고한다.
- 외부 요청에 사용자 이름·이메일을 넣지 않는다. HTTP `User-Agent`는 `research-assistant`만 쓴다.
- 화면 글자는 한국어, 격식체. 이모지 없음.
- 외부에서 온 글자(제목·설명)는 일반 글자로만 표시한다. `dangerouslySetInnerHTML` 금지.
- 렌더러: `contextIsolation: true`, `nodeIntegration: false`. 렌더러는 `window.api`만 쓴다.
- 여는 링크는 `http:`/`https:`만 허용한다.
- `src/main/core/**`는 `electron`을 import하지 않는다.
- 스캐폴드가 만든 버전 고정을 임의로 올리지 않는다. 추가 의존성은 `fast-xml-parser`, `@yogesharc/thinking-orbs`, `vitest`(dev) 셋뿐이다.
- Electron API는 버전 45 문서(context7 `/electron/electron`)로 확인하고 쓴다.
- AI 요약 없음. 계정·서버 없음. 데이터는 `app.getPath('userData')/state.json` 한 파일.
- 커밋 메시지 끝줄: `Co-Authored-By: Claude Mythos 5.2 <noreply@anthropic.com>`
- 1단계에서 화면에 보이는 카테고리는 `paper`, `repo`, `news` 셋이다(나머지 셋은 2단계에서 출처가 생길 때 켠다).

## 확인된 사실 (2026-11-24, 다시 조사하지 말 것)

| 출처 | 확인한 질의 형태 | 비고 |
|---|---|---|
| OpenAlex | `https://api.openalex.org/works?filter=title_and_abstract.search:"k1"\|"k2",from_publication_date:<오늘-30일>,to_publication_date:<오늘>&sort=publication_date:desc&per-page=25&select=id,doi,title,publication_date,primary_location,type,cited_by_count&api_key=<키>` | `search=`만 쓰면 본문 일치와 미래 날짜(2027년) 논문이 섞여 나온다. 반드시 위 형태. 키 없이도 응답하지만 IP 공유 하루 $0.10이라 앱은 키가 있을 때만 호출한다. |
| arXiv | `https://export.arxiv.org/api/query?search_query=all:"k1" OR all:"k2"&sortBy=submittedDate&sortOrder=descending&max_results=30` | Atom XML |
| GitHub | `https://api.github.com/search/repositories?q="k1" OR "k2" in:name,description,topics created:>=<오늘-90일>&sort=stars&order=desc&per_page=20` | 헤더 `Accept: application/vnd.github+json`, `User-Agent`. 논리 연산자 5개 제한이라 키워드 6개씩 끊는다. 분당 10회. |
| Google 뉴스 | `https://news.google.com/rss/search?q="k1" OR "k2" when:7d&hl=ko&gl=KR&ceid=KR:ko` (영문판: `hl=en-US&gl=US&ceid=US:en`) | 최대 100건 반환. `<item>`에 `title`, `link`, `guid`, `pubDate`, `source` |

- Thinking Orbs: `import { Orb } from "@yogesharc/thinking-orbs"`. props `state`(`"idle"`,`"searching"`,`"retrying"` 등), `size`(기본 20), `paused`, `label`. `currentColor`로 그리고 동작 줄이기 설정에서는 스스로 멈춘다.
- React Bits Orb: 의존성 없는 WebGL2 컴포넌트(614줄). `https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/Backgrounds/Orb/Orb.tsx`와 같은 폴더의 `Orb.css`. props에 `paused`, `colors`(기본 `['#9c43fe','#4cc2e9','#101499']`), `backgroundColor`, `followCursor`, `clickPulse`, `rotateOnHover`. `document.hidden`과 동작 줄이기를 스스로 처리한다. 부모 크기를 100% 채운다.
- electron-builder: 인증서 없이 Apple Silicon에서 실행되려면 `mac.identity: "-"`(임시 서명)과 권한 `com.apple.security.cs.disable-library-validation`, `com.apple.security.cs.allow-jit`이 필요하다.
- `gh`는 로그인되어 있고 `repo`, `workflow` 권한이 있다. git 사용자 정보도 설정되어 있다.

## File Structure

```
research-assistant/
  electron.vite.config.ts  electron-builder.yml  vitest.config.ts  package.json   (스캐폴드 + 수정)
  build/icon.svg  build/icon.png  build/entitlements.mac.plist
  resources/trayTemplate.png  trayTemplate@2x.png  trayDotTemplate.png  trayDotTemplate@2x.png  tray.png  tray-dot.png
  scripts/render-icons.mjs
  src/shared/types.ts            공용 타입 (메인·렌더러 공유)
  src/main/core/text.ts          normalizeTitle, matchKeywords, isHttpUrl, cleanKeywords
  src/main/core/profile.ts       validateProfile
  src/main/core/sources/{arxiv,openalex,github,gnews}.ts   URL 만들기 + 응답 변환
  src/main/core/merge.ts         mergeIncoming, pruneOld
  src/main/core/relevance.ts     score
  src/main/core/feed.ts          takeNew, pastItems, savedItems, unseenCounts
  src/main/core/schedule.ts      lastDue, shouldRunDaily, shouldNotify, notificationBody
  src/main/store.ts              defaultState, loadState, saveState
  src/main/collector.ts          collect
  src/main/{index,ipc,tray,scheduler,notify}.ts   Electron 연결
  src/preload/index.ts  index.d.ts
  src/renderer/src/App.tsx  styles.css  format.ts
  src/renderer/src/screens/{ProfileForm,Onboarding,Settings,Feed}.tsx
  src/renderer/src/components/{CategoryChips,ItemRow,StatusOrb,BigOrb}.tsx  components/Orb/{Orb.tsx,Orb.css}
  tests/fixtures/{arxiv.xml,openalex.json,github.json,gnews-ko.xml,gnews-en.xml}
  tests/core/*.test.ts  tests/store.test.ts  tests/collector.test.ts  tests/format.test.ts
  .github/workflows/build-windows.yml
  docs/windows-trial-checklist.md
```

## Review Focus

설계가 암시하지만 놓치기 쉬운 다섯 가지. 각 항목의 테스트는 괄호 안 과제에 들어 있다.

1. 출처가 기대와 다른 응답을 준다: GitHub 한도 초과 JSON(`{"message":...}`), Google의 HTML 페이지, 결과가 1건뿐인 XML(파서가 배열 대신 객체를 준다), 0건. 그 출처만 실패하거나 빈 목록이 되어야 한다. (Task 3)
2. 인터넷이 끊긴 채 앱이 시작된다. 앱은 뜨고, 저장된 항목은 그대로 보이고, 모든 출처가 실패로 표시된다. (Task 6)
3. 잠자기·며칠 꺼 둠·자정 넘김. 알림 주기 수집은 밀린 날 수와 무관하게 한 번만 돈다. (Task 5)
4. `state.json`이 깨져 있다(쓰는 중 강제 종료). 앱은 기본 상태로 뜨고 깨진 파일은 이름을 바꿔 남긴다. (Task 6)
5. 제목에 `<script>`·`&amp;`가 있거나 주소가 `javascript:`/`file:`이다. 글자는 그대로 보이고 그런 주소는 열리지 않는다. (Task 2, Task 3)

---

### Task 1: 뼈대, 포장, 서명 없는 앱의 알림 확인 — 담당: Opus

설계 9절이 "1단계에서 가장 먼저 확인"하라고 한 항목이다.

**Files:**
- Create: 스캐폴드 일체, `vitest.config.ts`, `docs/superpowers/plans/2026-11-24-stage1-feed-and-notifications.md`
- Modify: `electron-builder.yml`, `build/entitlements.mac.plist`, `package.json`, `src/main/index.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run build:mac`, `npm run build:win` 스크립트. 트레이 메뉴에 "알림 테스트"가 있는 실행 가능한 앱.

- [ ] **Step 1:** 이 계획 파일을 `docs/superpowers/plans/2026-11-24-stage1-feed-and-notifications.md`로 복사하고 `git init -b main`, 설계 문서와 계획을 커밋한다.
- [ ] **Step 2:** 스크래치패드 폴더에서 `npm create @quick-start/electron@latest ra-scaffold -- --template react-ts`를 실행한다(업데이터 플러그인·미러 프록시를 물으면 둘 다 아니오). 결과를 `rsync -a`로 프로젝트에 복사하되 `.git`, `node_modules`, `README.md`, 데모 자산(`src/renderer/src/assets/` 안의 로고·데모 CSS, `components/Versions.tsx`)은 제외한다. 프로젝트 안에서는 아무것도 지우지 않는다.
- [ ] **Step 3:** `npm install` 후 `npm i fast-xml-parser @yogesharc/thinking-orbs`, `npm i -D vitest`. `package.json`에 `"test": "vitest run"` 추가. `vitest.config.ts`는 `environment: 'node'`, `include: ['tests/**/*.test.ts']`.
- [ ] **Step 4:** `electron-builder.yml` 수정: `appId: com.researchassistant.app`, `productName: 연구비서`, `win.executableName: research-assistant`, `nsis.artifactName`과 `dmg.artifactName`은 `research-assistant-${version}-${arch}.${ext}`, `mac.identity: "-"`, `mac.target: [{target: dmg, arch: [arm64, x64]}]`, `win.target: [{target: nsis, arch: [x64]}]`. `afterSign`, `publish`, 카메라·마이크·폴더 사용 설명, `linux`·`appImage` 블록은 넣지 않는다. `build/entitlements.mac.plist`에 `com.apple.security.cs.allow-jit`과 `com.apple.security.cs.disable-library-validation`을 `true`로 둔다.
- [ ] **Step 5:** `src/main/index.ts`를 최소 형태로 쓴다: 단일 실행 잠금, 보안 설정을 지킨 창 하나(렌더러는 "연구비서" 글자만), 창 닫기는 숨기기, 트레이(스캐폴드의 `resources/icon.png`를 16px로 줄여 사용)와 메뉴 `열기` / `알림 테스트` / `종료`. "알림 테스트"는 제목 `연구비서`, 본문 `알림 테스트입니다`인 `Notification`을 띄운다.
- [ ] **Step 6: 확인.** `npm run typecheck && npm test`(테스트 0개 통과) → `npm run build && npx electron-builder --mac --dir` → `codesign -dv dist/mac-arm64/연구비서.app`에 `Signature=adhoc` 표시.
- [ ] **Step 7: 화면 확인 (Fable이 직접).** `dist/mac-arm64/연구비서.app`을 열어 메뉴 막대 아이콘이 보이는지, "알림 테스트"로 운영체제 알림이 뜨는지 본다. 뜨지 않으면 Task 12를 실행 대상으로 표시한다.
- [ ] **Step 8:** 커밋 `chore: scaffold electron app with tray and packaging`.

### Task 2: 공용 타입, 글자 도우미, 프로필 검증 — 담당: Sonnet

**Files:**
- Create: `src/shared/types.ts`, `src/main/core/text.ts`, `src/main/core/profile.ts`
- Modify: `tsconfig.node.json`, `tsconfig.web.json` (`src/shared/**/*`를 include에 추가)
- Test: `tests/core/text.test.ts`, `tests/core/profile.test.ts`

**Interfaces — Produces:**

```ts
// src/shared/types.ts
export type Category = 'paper' | 'repo' | 'news' | 'grant' | 'conference' | 'school';
export const CATEGORIES: Category[] = ['paper', 'repo', 'news', 'grant', 'conference', 'school'];
export const ACTIVE_CATEGORIES: Category[] = ['paper', 'repo', 'news'];   // 1단계
export const CATEGORY_LABEL: Record<Category, string> =
  { paper: '논문', repo: '저장소', news: '뉴스', grant: '과제 공고', conference: '학회', school: '학교 공지' };

export interface RawItem {
  id: string;        // 'paper:<정규화 제목>' | 'repo:<owner/name 소문자>' | 'news:<guid>'
  category: Category;
  source: string;    // 'arXiv' | 'OpenAlex' | 'GitHub' | 뉴스는 언론사 이름
  title: string; url: string;
  date: string;      // ISO 8601
  summary: string;   // 없으면 ''
  stars?: number;
}
export interface Item extends RawItem {
  matched: string[]; collectedAt: string; seenAt: string | null; saved: boolean; hidden: boolean;
}
export interface Profile { keywordsEn: string[]; keywordsKo: string[]; country: 'KR' | 'OTHER'; }
export interface Settings { notifyTime: string; openAtLogin: boolean; enabled: Record<Category, boolean>; }
export interface AppState {
  version: 1; profile: Profile | null; settings: Settings;
  openAlexKeyEnc: string | null;          // safeStorage로 암호화한 값의 base64
  items: Record<string, Item>;
  lastDailyRunAt: string | null; lastNotifiedAt: string | null;
  sourceErrors: Record<string, string>;   // 출처 이름 → 마지막 실패 메시지
}
export interface FeedGroup { category: Category; items: Item[]; }
export interface CollectStatus { running: boolean; lastFinishedAt: string | null; errors: Record<string, string>; }
export interface PublicState { profile: Profile | null; settings: Settings; hasOpenAlexKey: boolean; status: CollectStatus; }
export interface SaveInput { profile: Profile; settings: Settings; openAlexKey?: string | null; } // undefined 유지, null 삭제
export type SaveResult = { ok: true } | { ok: false; errors: string[] };
```

- `normalizeTitle(title: string): string` — NFKC, 소문자, 글자·숫자(`\p{L}\p{N}`)만 남김
- `matchKeywords(text: string, keywords: string[]): string[]` — 대소문자 무시 부분 일치, 원래 표기로 반환
- `isHttpUrl(url: string): boolean`
- `cleanKeywords(input: string[]): string[]` — 앞뒤 공백 제거, 연속 공백 하나로, `"` `,` `|` 제거, 빈 것 제거, 대소문자 무시 중복 제거, 앞에서 8개까지
- `validateProfile(input: { profile: Profile; settings: Settings }): { ok: true; profile: Profile; settings: Settings } | { ok: false; errors: string[] }` — 키워드는 `cleanKeywords`를 거친 값으로 돌려준다

국가는 `KR`(한국)과 `OTHER`(그 외) 둘이다. 한글 키워드는 한국어판 뉴스에, 영문 키워드는 영문판 뉴스에 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/core/text.test.ts
expect(normalizeTitle('  Graph-Neural  Networks: A Survey! ')).toBe('graphneuralnetworksasurvey');
expect(normalizeTitle('설명가능 AI 동향')).toBe('설명가능ai동향');
expect(matchKeywords('Explaining GNN surrogates for XAI', ['xai', 'structural analysis'])).toEqual(['xai']);
expect(isHttpUrl('https://a.b/c')).toBe(true);
for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', '']) expect(isHttpUrl(u)).toBe(false);
expect(cleanKeywords(['  XAI ', 'xai', 'a,b|"c"', '', 'graph   neural'])).toEqual(['XAI', 'abc', 'graph neural']);
expect(cleanKeywords(Array.from({ length: 12 }, (_, i) => `k${i}`))).toHaveLength(8);

// tests/core/profile.test.ts  (base = 유효한 profile/settings)
expect(validateProfile({ ...base, profile: { ...base.profile, keywordsEn: ['  '] } }))
  .toEqual({ ok: false, errors: ['영문 주제 키워드를 1개 이상 입력해 주십시오.'] });
expect(validateProfile({ ...base, settings: { ...base.settings, notifyTime: '25:00' } }))
  .toEqual({ ok: false, errors: ['알림 시각은 00:00~23:59 형식이어야 합니다.'] });
expect(validateProfile(base)).toMatchObject({ ok: true });
```

- [ ] **Step 2:** `npm test` → 실패(모듈 없음) 확인
- [ ] **Step 3:** 위 시그니처대로 구현. 알림 시각 형식은 `/^([01]\d|2[0-3]):[0-5]\d$/`.
- [ ] **Step 4:** `npm test && npm run typecheck` → 통과
- [ ] **Step 5:** 커밋 `feat: shared types, text helpers, profile validation`

### Task 3: 실제 응답 파일과 출처 변환 4종 — 담당: Sonnet

**Files:**
- Create: `src/main/core/sources/{arxiv,openalex,github,gnews}.ts`, `tests/fixtures/*`
- Test: `tests/core/sources.test.ts`

**Interfaces:**
- Consumes: `RawItem`, `normalizeTitle`, `isHttpUrl` (Task 2)
- Produces:
  - `buildArxivUrl(keywords: string[]): string` / `parseArxiv(xml: string): RawItem[]`
  - `buildOpenAlexUrl(keywords: string[], today: Date, apiKey: string): string` / `parseOpenAlex(json: string): RawItem[]`
  - `buildGithubUrls(keywords: string[], today: Date): string[]` / `parseGithub(json: string): RawItem[]`
  - `buildGnewsUrl(keywords: string[], edition: 'ko' | 'en'): string` / `parseGnews(xml: string, limit?: number): RawItem[]` (기본 `limit` 30, 날짜 최신순으로 자름)

변환 규칙:

| 출처 | id | source | title | url | date | summary | stars |
|---|---|---|---|---|---|---|---|
| arXiv | `paper:`+정규화 제목 | `arXiv` | `<title>` 공백 정리 | `<id>` | `<published>` | `<summary>` 공백 정리 후 앞 200자 | |
| OpenAlex | `paper:`+정규화 제목 | `OpenAlex` | `title` | `doi` ?? `primary_location.landing_page_url` ?? `id` | `publication_date` | `primary_location.source.display_name` ?? `''` | |
| GitHub | `repo:`+`full_name` 소문자 | `GitHub` | `full_name` | `html_url` | `created_at` | `description` ?? `''` | `stargazers_count` |
| Google 뉴스 | `news:`+`<guid>` | `<source>` 글자 ?? `Google 뉴스` | `<title>`에서 끝의 ` - 언론사` 제거 | `<link>` | `<pubDate>` | `''` | |

공통: 날짜는 `toISOString()`으로 바꾸고, 날짜가 유효하지 않거나 제목이 비었거나 주소가 `isHttpUrl`이 아니면 그 항목은 버린다. XML은 `new XMLParser({ ignoreAttributes: false, isArray: (n) => n === 'entry' || n === 'item' })`로 읽는다. 최상위 구조가 기대와 다르면(`feed` 없음, `rss.channel` 없음, `items`/`results`가 배열 아님) `Error`를 던진다.

- [ ] **Step 1: 실제 응답 저장.** "확인된 사실" 표의 질의 형태에 키워드 `"graph neural network"`, `"physics-informed"`(한국어판은 `"인공지능"`, `"구조공학"`)를 넣어 `curl`로 `tests/fixtures/`에 저장한다. OpenAlex는 `api_key` 없이, `per-page=10`으로 받는다. arXiv는 `max_results=10`, GitHub는 `per_page=10`. 각 파일에 결과가 1건 이상인지 확인한다.
- [ ] **Step 2: 실패하는 테스트 작성**

```ts
const fx = (n: string) => readFileSync(`tests/fixtures/${n}`, 'utf8');
const wellFormed = (items: RawItem[], cat: Category, prefix: string) => {
  expect(items.length).toBeGreaterThan(0);
  for (const it of items) {
    expect(it.category).toBe(cat); expect(it.id.startsWith(prefix)).toBe(true);
    expect(it.title.trim()).not.toBe(''); expect(isHttpUrl(it.url)).toBe(true);
    expect(new Date(it.date).toISOString()).toBe(it.date);
  }
};
test('fixtures', () => {
  wellFormed(parseArxiv(fx('arxiv.xml')), 'paper', 'paper:');
  wellFormed(parseOpenAlex(fx('openalex.json')), 'paper', 'paper:');
  wellFormed(parseGithub(fx('github.json')), 'repo', 'repo:');
  wellFormed(parseGnews(fx('gnews-ko.xml')), 'news', 'news:');
  expect(parseGnews(fx('gnews-ko.xml')).length).toBeLessThanOrEqual(30);
  expect(parseGithub(fx('github.json'))[0].stars).toEqual(expect.any(Number));
});
test('같은 제목은 출처가 달라도 같은 id', () => {
  // 인라인 최소 XML/JSON: 제목 'A Study of X' (arXiv) 와 'A study of X.' (OpenAlex)
  expect(parseArxiv(ARXIV_ONE)[0].id).toBe(parseOpenAlex(OPENALEX_ONE)[0].id);
});
test('결과 1건·0건', () => {
  expect(parseArxiv(ARXIV_ONE)).toHaveLength(1);        // <entry> 하나
  expect(parseArxiv(ARXIV_EMPTY)).toEqual([]);          // <feed>만 있고 entry 없음
  expect(parseGnews(GNEWS_ONE)).toHaveLength(1);
});
test('기대와 다른 응답은 던진다', () => {
  expect(() => parseGithub('{"message":"API rate limit exceeded"}')).toThrow();
  expect(() => parseGnews('<html><body>동의</body></html>')).toThrow();
  expect(() => parseOpenAlex('not json')).toThrow();
});
test('글자와 주소', () => {
  // GNEWS_ODD: 제목 'R&amp;D 예산 &lt;b&gt;확대&lt;/b&gt; - 전자신문', source '전자신문', 둘째 item의 link는 'javascript:alert(1)'
  const items = parseGnews(GNEWS_ODD);
  expect(items).toHaveLength(1);
  expect(items[0].title).toBe('R&D 예산 <b>확대</b>'); expect(items[0].source).toBe('전자신문');
});
test('URL', () => {
  const today = new Date('2026-11-24T03:00:00Z');
  const oa = new URL(buildOpenAlexUrl(['graph neural network', 'xai'], today, 'KEY'));
  expect(oa.searchParams.get('filter')).toBe(
    'title_and_abstract.search:"graph neural network"|"xai",from_publication_date:2026-10-25,to_publication_date:2026-11-24');
  expect(oa.searchParams.get('sort')).toBe('publication_date:desc'); expect(oa.searchParams.get('api_key')).toBe('KEY');
  expect(new URL(buildArxivUrl(['a b', 'c'])).searchParams.get('search_query')).toBe('all:"a b" OR all:"c"');
  expect(buildGithubUrls(['k1','k2','k3','k4','k5','k6','k7'], today)).toHaveLength(2);
  expect(new URL(buildGithubUrls(['k1'], today)[0]).searchParams.get('q')).toBe('"k1" in:name,description,topics created:>=2026-08-26');
  const g = new URL(buildGnewsUrl(['인공지능', '구조공학'], 'ko'));
  expect(g.searchParams.get('q')).toBe('"인공지능" OR "구조공학" when:7d'); expect(g.searchParams.get('ceid')).toBe('KR:ko');
});
```

- [ ] **Step 3:** `npm test` → 실패 확인
- [ ] **Step 4:** 네 파일 구현. 날짜 계산은 UTC 기준 `YYYY-MM-DD`.
- [ ] **Step 5:** `npm test && npm run typecheck` → 통과
- [ ] **Step 6:** 커밋 `feat: source adapters for arXiv, OpenAlex, GitHub, Google News`

### Task 4: 합치기, 관련도, 피드 규칙 — 담당: Sonnet

**Files:**
- Create: `src/main/core/merge.ts`, `src/main/core/relevance.ts`, `src/main/core/feed.ts`, `tests/helpers.ts`
- Test: `tests/core/merge.test.ts`, `tests/core/feed.test.ts`

`tests/helpers.ts`(Task 5·6도 쓴다): `NOW = '2026-11-24T03:00:00.000Z'`, `raw(p?: Partial<RawItem>): RawItem`, `mk(p?: Partial<Item>): Item`(기본값: `category: 'paper'`, `date: NOW`, `collectedAt: NOW`, `seenAt: null`, `matched: []`, `saved: false`, `hidden: false`), `st(p?: Partial<AppState> & { enabled?: Partial<Record<Category, boolean>> }): AppState`(기본 상태에 덮어쓰고 `enabled`는 기본값과 합친다).

**Interfaces:**
- Consumes: Task 2의 타입과 `matchKeywords`
- Produces:
  - `mergeIncoming(items: Record<string, Item>, incoming: RawItem[], keywords: string[], now: string): Record<string, Item>` — 이미 있는 id는 건드리지 않는다. `incoming` 안에서 id가 겹치면 먼저 온 것이 이긴다. 새 항목은 `matched = matchKeywords(title + ' ' + summary, keywords)`, `collectedAt = now`, `seenAt = null`, `saved = false`, `hidden = false`. 입력을 바꾸지 않는다.
  - `pruneOld(items: Record<string, Item>, now: string): Record<string, Item>` — `seenAt !== null && !saved`이고 `collectedAt`이 180일보다 오래된 것만 뺀다(출처의 조회 기간이 최대 90일이라 다시 새 소식이 되지 않는다).
  - `score(item: Item, now: Date): number`
  - `isVisible(item: Item, settings: Settings): boolean` — `!hidden && settings.enabled[item.category]`
  - `takeNew(state: AppState, now: string): { state: AppState; groups: FeedGroup[] }` — 보이는 미확인 항목을 `CATEGORIES` 순서로 묶고 묶음 안은 `score` 내림차순(같으면 날짜 최신순). 빈 묶음은 뺀다. 돌려주는 state에서는 그 항목들의 `seenAt = now`.
  - `pastItems(state: AppState, limit: number): Item[]` — 보이는 확인 항목, `seenAt` 최신순
  - `savedItems(state: AppState): Item[]` — `saved`인 항목, 날짜 최신순
  - `unseenCounts(state: AppState): Partial<Record<Category, number>>` — 보이는 미확인 수, 0인 카테고리는 키 없음

관련도 식(테스트만으로 정해지지 않으므로 고정):

```ts
const titleHits = matchKeywords(item.title, item.matched).length;
const ageDays = Math.max(0, (now.getTime() - Date.parse(item.date)) / 86_400_000);
return 3 * titleHits + (item.matched.length - titleHits)
     + 2 * Math.max(0, 1 - ageDays / 30)
     + (item.stars === undefined ? 0 : Math.min(2, Math.log10(item.stars + 1)));
```

- [ ] **Step 1: `tests/helpers.ts`를 만들고 실패하는 테스트 작성**

```ts
test('이미 있는 항목은 다시 새 소식이 되지 않는다', () => {
  const seen = mk({ id: 'paper:a', seenAt: '2026-11-01T00:00:00.000Z', title: 'old' });
  const out = mergeIncoming({ 'paper:a': seen }, [raw({ id: 'paper:a', title: 'new title' })], [], NOW);
  expect(out['paper:a']).toEqual(seen);
});
test('한 번에 온 중복은 먼저 온 출처가 남는다', () => {
  const out = mergeIncoming({}, [raw({ id: 'paper:a', source: 'OpenAlex' }), raw({ id: 'paper:a', source: 'arXiv' })], [], NOW);
  expect(Object.keys(out)).toEqual(['paper:a']); expect(out['paper:a'].source).toBe('OpenAlex');
});
test('새 항목의 초기값', () => {
  const it = mergeIncoming({}, [raw({ id: 'paper:b', title: 'XAI for bridges', summary: 'structural analysis' })], ['xai', 'structural analysis', 'gnn'], NOW)['paper:b'];
  expect(it).toMatchObject({ matched: ['xai', 'structural analysis'], collectedAt: NOW, seenAt: null, saved: false, hidden: false });
});
test('pruneOld', () => {
  const old = '2026-01-01T00:00:00.000Z';
  const out = pruneOld({ a: mk({ id: 'a', collectedAt: old, seenAt: old }), b: mk({ id: 'b', collectedAt: old, seenAt: old, saved: true }),
                         c: mk({ id: 'c', collectedAt: old, seenAt: null }) }, NOW);
  expect(Object.keys(out).sort()).toEqual(['b', 'c']);
});
test('score 순서', () => {
  const now = new Date(NOW);
  expect(score(mk({ title: 'xai', matched: ['xai'] }), now)).toBeGreaterThan(score(mk({ title: 'other', matched: [] }), now));
  expect(score(mk({ date: NOW }), now)).toBeGreaterThan(score(mk({ date: '2026-10-01T00:00:00.000Z' }), now));
  expect(score(mk({ stars: 1200 }), now)).toBeGreaterThan(score(mk({ stars: 3 }), now));
});
test('takeNew는 보이는 미확인만 묶어 주고 확인 처리한다', () => {
  const state = st({ items: { p1: mk({ id: 'p1', category: 'paper' }), r1: mk({ id: 'r1', category: 'repo' }),
    h: mk({ id: 'h', category: 'paper', hidden: true }), n: mk({ id: 'n', category: 'news' }) }, enabled: { news: false } });
  const { state: next, groups } = takeNew(state, NOW);
  expect(groups.map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([['paper', ['p1']], ['repo', ['r1']]]);
  expect(next.items.p1.seenAt).toBe(NOW); expect(next.items.n.seenAt).toBeNull(); expect(state.items.p1.seenAt).toBeNull();
  expect(takeNew(next, NOW).groups).toEqual([]);
  expect(unseenCounts(state)).toEqual({ paper: 1, repo: 1 });
});
```

- [ ] **Step 2:** `npm test` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck` → 통과
- [ ] **Step 5:** 커밋 `feat: merge, relevance, and feed rules`

### Task 5: 일정과 알림 문구 — 담당: Sonnet

**Files:**
- Create: `src/main/core/schedule.ts`
- Test: `tests/core/schedule.test.ts`

**Interfaces:**
- Consumes: `AppState`, `isVisible`, `CATEGORIES`, `CATEGORY_LABEL`
- Produces:
  - `lastDue(now: Date, notifyTime: string): Date` — 현지 시각 기준. 오늘 `HH:MM`이 지났으면 오늘 그 시각, 아니면 어제 그 시각
  - `shouldRunDaily(now: Date, notifyTime: string, lastDailyRunAt: string | null): boolean` — `null`이면 `false`(프로필이 아직 없음). 아니면 `lastDailyRunAt < lastDue`
  - `shouldNotify(state: AppState): boolean` — 보이는 미확인 항목 가운데 `collectedAt > lastNotifiedAt`인 것이 하나라도 있으면 `true`(`lastNotifiedAt`이 `null`이면 미확인이 하나라도 있으면 `true`)
  - `notificationBody(counts: Partial<Record<Category, number>>): string`

- [ ] **Step 1: 실패하는 테스트 작성** (`L(y,m,d,h,mi)`는 현지 시각 `Date` 생성 도우미)

```ts
test('lastDue', () => {
  expect(lastDue(L(2026, 11, 24, 9, 0), '09:00')).toEqual(L(2026, 11, 24, 9, 0));
  expect(lastDue(L(2026, 11, 24, 8, 59), '09:00')).toEqual(L(2026, 11, 23, 9, 0));
  expect(lastDue(L(2026, 11, 24, 0, 5), '23:50')).toEqual(L(2026, 11, 23, 23, 50));   // 자정 넘김
});
test('하루 한 번만', () => {
  const ranYesterday = L(2026, 11, 23, 9, 0).toISOString();
  expect(shouldRunDaily(L(2026, 11, 24, 8, 59), '09:00', ranYesterday)).toBe(false);
  expect(shouldRunDaily(L(2026, 11, 24, 9, 0), '09:00', ranYesterday)).toBe(true);
  expect(shouldRunDaily(L(2026, 11, 24, 9, 1), '09:00', L(2026, 11, 24, 9, 0).toISOString())).toBe(false);
  expect(shouldRunDaily(L(2026, 11, 24, 14, 0), '09:00', L(2026, 11, 20, 9, 0).toISOString())).toBe(true);  // 며칠 꺼 둠
  expect(shouldRunDaily(L(2026, 11, 24, 7, 0), '09:00', L(2026, 11, 22, 9, 0).toISOString())).toBe(true);   // 어제 분을 놓침
  expect(shouldRunDaily(L(2026, 11, 24, 14, 0), '09:00', null)).toBe(false);
});
test('shouldNotify', () => {
  const t0 = '2026-11-23T00:00:00.000Z', t1 = '2026-11-24T00:00:00.000Z';
  expect(shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t1 }) }, lastNotifiedAt: t0 }))).toBe(true);
  expect(shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t0 }) }, lastNotifiedAt: t1 }))).toBe(false);   // 그 뒤 새로 온 것이 없음
  expect(shouldNotify(st({ items: { a: mk({ id: 'a', collectedAt: t1, seenAt: t1 }) }, lastNotifiedAt: t0 }))).toBe(false);
  expect(shouldNotify(st({ items: {}, lastNotifiedAt: null }))).toBe(false);
});
test('알림 문구', () => {
  expect(notificationBody({ paper: 3, repo: 2, news: 1, conference: 1 })).toBe('새 소식 7건 (논문 3 · 저장소 2 · 뉴스 1 · 학회 1)');
  expect(notificationBody({ news: 2 })).toBe('새 소식 2건 (뉴스 2)');
});
```

- [ ] **Step 2:** `npm test` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck` → 통과
- [ ] **Step 5:** 커밋 `feat: daily schedule and notification text`

### Task 6: 저장과 수집기 — 담당: Sonnet

**Files:**
- Create: `src/main/store.ts`, `src/main/collector.ts`
- Test: `tests/store.test.ts`, `tests/collector.test.ts`

**Interfaces:**
- Consumes: Task 2~4의 타입과 함수, Task 3의 build/parse
- Produces:
  - `defaultState(): AppState` — `notifyTime: '09:00'`, `openAtLogin: true`, `enabled` 전부 `true`, 나머지는 `null`/빈 객체
  - `loadState(file: string): AppState` — 파일이 없으면 기본 상태. JSON이 깨졌거나 `version !== 1`이면 그 파일을 `state.corrupt-<시각숫자>.json`으로 이름을 바꾸고 기본 상태를 돌려준다.
  - `saveState(file: string, state: AppState): void` — `file + '.tmp'`에 쓰고 `renameSync`로 바꿔치기
  - `interface CollectDeps { fetchText(url: string, headers?: Record<string, string>): Promise<string>; now(): Date; openAlexKey: string | null; }`
  - `collect(state: AppState, deps: CollectDeps): Promise<AppState>`

`collect` 규칙: 프로필이 없으면 state를 그대로 돌려준다. 아래 순서로 출처를 돌리고, 카테고리가 꺼져 있으면 그 출처는 요청하지 않는다. 출처 하나가 던지면 `sourceErrors[이름] = 메시지`로 남기고 계속한다. 성공하면 그 이름의 오류를 지운다. 모은 `RawItem`을 순서대로 이어 `mergeIncoming`(키워드는 영문+한글) → `pruneOld`.

| 순서 | 출처 이름 | 조건 |
|---|---|---|
| 1 | `OpenAlex` | `enabled.paper` 이고 `openAlexKey`가 있음 |
| 2 | `arXiv` | `enabled.paper` |
| 3 | `GitHub` | `enabled.repo` (URL 여러 개면 차례로, 헤더 `Accept: application/vnd.github+json`, `User-Agent: research-assistant`) |
| 4 | `Google 뉴스(한국어)` | `enabled.news` 이고 `country === 'KR'` 이고 한글 키워드가 있음 |
| 5 | `Google 뉴스(영문)` | `enabled.news` |

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/store.test.ts (임시 폴더: mkdtempSync(join(tmpdir(), 'ra-')))
test('없으면 기본 상태', () => { expect(loadState(join(dir, 'state.json'))).toEqual(defaultState()); });
test('저장하고 다시 읽기', () => { saveState(f, s); expect(loadState(f)).toEqual(s); expect(existsSync(f + '.tmp')).toBe(false); });
test('깨진 파일은 남겨 두고 기본 상태로 시작', () => {
  writeFileSync(f, '{"version":1,"items":{');
  expect(loadState(f)).toEqual(defaultState());
  expect(readdirSync(dir).some((n) => n.startsWith('state.corrupt-'))).toBe(true);
});

// tests/collector.test.ts
// withProfile = st({ profile: { keywordsEn: ['graph neural network'], keywordsKo: ['인공지능'], country: 'KR' } })
// deps({ openAlexKey?, fail? }) = URL의 호스트로 fixture를 돌려주는 가짜 fetchText(부른 URL을 calls에 기록, fail에 든 호스트는 던짐), now = NOW
test('네 출처를 모아 합친다', async () => {
  const out = await collect(withProfile, deps({ openAlexKey: 'K' }));
  const cats = new Set(Object.values(out.items).map((i) => i.category));
  expect(cats).toEqual(new Set(['paper', 'repo', 'news'])); expect(out.sourceErrors).toEqual({});
});
test('키가 없으면 OpenAlex를 부르지 않는다', async () => {
  const d = deps({ openAlexKey: null }); await collect(withProfile, d);
  expect(d.calls.some((u) => u.includes('api.openalex.org'))).toBe(false);
});
test('한 출처가 실패해도 나머지는 계속한다', async () => {
  const out = await collect(withProfile, deps({ fail: ['api.github.com'] }));
  expect(Object.keys(out.sourceErrors)).toEqual(['GitHub']);
  expect(Object.values(out.items).some((i) => i.category === 'paper')).toBe(true);
});
test('인터넷이 끊겨도 저장된 항목은 그대로다', async () => {
  const before = { ...withProfile, items: { 'paper:x': mk({ id: 'paper:x' }) } };
  const out = await collect(before, deps({ fail: ['api.openalex.org', 'export.arxiv.org', 'api.github.com', 'news.google.com'], openAlexKey: 'K' }));
  expect(out.items).toEqual(before.items);
  expect(Object.keys(out.sourceErrors).sort()).toEqual(['GitHub', 'Google 뉴스(영문)', 'Google 뉴스(한국어)', 'OpenAlex', 'arXiv']);
});
test('꺼진 카테고리는 요청하지 않는다', async () => {
  const d = deps({}); await collect(st({ ...withProfile, enabled: { repo: false, news: false } }), d);
  expect(d.calls.every((u) => u.includes('arxiv.org'))).toBe(true);
});
test('성공하면 이전 오류가 지워진다', async () => {
  const out = await collect({ ...withProfile, sourceErrors: { arXiv: 'HTTP 503' } }, deps({}));
  expect(out.sourceErrors.arXiv).toBeUndefined();
});
test('프로필이 없으면 아무것도 하지 않는다', async () => {
  const d = deps({}); expect(await collect(defaultState(), d)).toEqual(defaultState()); expect(d.calls).toEqual([]);
});
```

- [ ] **Step 2:** `npm test` → 실패 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck` → 통과
- [ ] **Step 5:** 커밋 `feat: state store and collector`

### Task 7: 메인 프로세스 연결 — 담당: Opus

**Files:**
- Create: `src/main/ipc.ts`, `src/main/tray.ts`, `src/main/scheduler.ts`, `src/main/notify.ts`, `src/preload/index.d.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Consumes: Task 2~6 전부
- Produces (렌더러가 쓰는 유일한 통로):

```ts
// src/preload/index.d.ts
export interface Api {
  getState(): Promise<PublicState>;
  saveProfile(input: SaveInput): Promise<SaveResult>;
  takeNew(): Promise<FeedGroup[]>;
  getPast(): Promise<Item[]>;            // pastItems(state, 100)
  getSaved(): Promise<Item[]>;
  setSaved(id: string, saved: boolean): Promise<void>;
  hide(id: string): Promise<void>;
  refresh(): Promise<void>;              // 수집이 끝나면 resolve
  openItem(id: string): Promise<void>;   // 저장된 항목의 url이 isHttpUrl일 때만 shell.openExternal
  openHelp(which: 'openalex-key'): Promise<void>;   // https://openalex.org/settings/api
  testNotification(): Promise<void>;
  onStatus(cb: (s: CollectStatus) => void): () => void;   // 구독 해제 함수 반환
}
declare global { interface Window { api: Api } }
```

동작 규칙:

- 상태는 메인 프로세스 메모리에 하나만 두고, 바뀔 때마다 `saveState`한다.
- `collectNow()`: 동시에 하나만 돈다(도는 중이면 같은 Promise를 돌려준다). 시작과 끝에 `status` 이벤트를 렌더러로 보낸다. `fetchText`는 전역 `fetch`에 20초 제한(`AbortSignal.timeout`)을 걸고, 2xx가 아니면 `Error('HTTP <코드>')`.
- 시작 순서: 상태 읽기 → 트레이 → 창 → `collectNow()` → 일정 확인.
- 일정 확인(`tick`): 30초마다, 그리고 `powerMonitor`의 `resume`에서 실행. `shouldRunDaily`가 참이면 `lastDailyRunAt = 지금`으로 저장한 뒤 `collectNow()`, 이어서 `shouldNotify`가 참이면 알림(제목 `연구비서`, 본문 `notificationBody(unseenCounts(state))`)을 띄우고 `lastNotifiedAt = 지금`. 알림을 누르면 창을 보여 준다.
- `saveProfile`: `validateProfile` → 실패면 오류 반환. 성공이면 저장, 처음 만든 프로필이면 `lastDailyRunAt = 지금`, `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })` 적용, `collectNow()`를 기다리지 않고 시작. `openAlexKey` 문자열은 `safeStorage.encryptString`의 base64로 저장하고, `safeStorage.isEncryptionAvailable()`이 거짓이면 평문으로 저장하지 말고 오류 `'이 컴퓨터에서는 키를 안전하게 저장할 수 없습니다.'`를 돌려준다.
- 로그인 때 자동으로 시작된 경우(`--hidden` 인자 또는 로그인 항목으로 열림)에는 창을 보여 주지 않는다.
- 창: 480×760, 닫으면 숨김. `setWindowOpenHandler`는 모두 거부, `will-navigate`는 막는다. 트레이 메뉴: `열기` / `새로 고침` / `종료`. Windows에서는 트레이 아이콘 클릭으로도 연다.
- 트레이 아이콘의 점: 수집이 끝날 때와 `takeNew` 뒤에 `unseenCounts`로 갱신(`setTrayUnseen(boolean)`). 아이콘 파일은 Task 8이 만든다. 그 전에는 스캐폴드 아이콘을 쓴다.
- `takeNew`는 창이 보이는 상태에서만 확인 처리한다(숨겨져 있으면 빈 배열).
- `sandbox: true`를 먼저 시도한다. preload가 로드되지 않으면 electron-vite 문서의 sandbox 안내를 따르고 결과를 보고한다.

- [ ] **Step 1:** 위 규칙대로 구현한다. preload는 `contextBridge.exposeInMainWorld('api', …)`로 `Api`만 내놓는다.
- [ ] **Step 2:** 렌더러 `App.tsx`에 임시로 `getState()` 결과를 글자로 찍는 화면을 둔다.
- [ ] **Step 3: 확인.** `npm test && npm run typecheck && npm run build` 통과. `npm run dev`로 띄워 개발자 도구 콘솔에서 `await window.api.saveProfile({...})` → `{ok: true}`, 잠시 뒤 `await window.api.takeNew()`가 논문·저장소·뉴스 묶음을 돌려주는지, 다시 부르면 `[]`인지, `window.require`가 `undefined`인지 확인하고 결과를 보고한다.
- [ ] **Step 4:** 커밋 `feat: main process wiring, IPC, scheduler, tray, notifications`

### Task 8: 앱 아이콘과 트레이 아이콘 — 담당: Sonnet

**Files:**
- Create: `build/icon.svg`, `scripts/render-icons.mjs`, `build/icon.png`, `resources/tray*.png` 6개
- Modify: `src/main/tray.ts` (아이콘 경로)

**Interfaces:**
- Produces: `build/icon.png`(1024×1024, 투명 배경 포함) — electron-builder가 icns/ico를 만든다. `resources/trayTemplate.png`(16×16)·`trayTemplate@2x.png`(32×32)·`trayDotTemplate.png`·`trayDotTemplate@2x.png`는 검정+투명만 쓴 Mac 템플릿 이미지. `resources/tray.png`·`tray-dot.png`는 Windows용 32×32 색상.

- [ ] **Step 1:** `build/icon.svg`를 그린다: 1024 viewBox, 둥근 모서리 사각형 바탕 `#0E0B1F`, 가운데 속이 빈 고리(바깥 반지름 약 300, 두께 약 70)에 `#9c43fe` → `#4cc2e9` 선형 그러데이션, 고리 바깥으로 옅은 빛 번짐. 트레이용은 같은 고리의 단색 버전이고, 점 있는 버전은 오른쪽 위에 채운 원 하나를 더한다.
- [ ] **Step 2:** `scripts/render-icons.mjs`: Electron으로 실행(`npx electron scripts/render-icons.mjs`). 투명한 숨은 창에 SVG를 띄워 `capturePage()`로 PNG를 만들고 `nativeImage.resize`로 크기를 맞춰 저장한 뒤 종료한다.
- [ ] **Step 3: 확인.** `sips -g pixelWidth -g pixelHeight -g hasAlpha build/icon.png resources/*.png`로 크기와 투명 채널을 확인. `npm run dev`에서 메뉴 막대 아이콘이 고리로 보이는지는 Fable이 본다.
- [ ] **Step 4:** 커밋 `feat: app and tray icons`

### Task 9: 화면 틀, 첫 실행 화면, 설정 — 담당: Sonnet

**Files:**
- Create: `src/renderer/src/styles.css`, `src/renderer/src/format.ts`, `screens/ProfileForm.tsx`, `screens/Onboarding.tsx`, `screens/Settings.tsx`, `components/StatusOrb.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/index.html`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: `window.api` (Task 7), 공용 타입
- Produces:
  - `relativeDate(iso: string, now: Date): string` — 같은 날 `오늘`, 하루 전 `어제`, 2~7일 `N일 전`, 그 밖은 `YYYY-MM-DD`(현지 날짜 기준)
  - `formatStars(n: number): string` — 1000 미만은 그대로, 이상은 소수 한 자리 `k`(`1234 → '1.2k'`)
  - `<StatusOrb active={boolean} state="searching" | "retrying" label={string} />` — `active`가 300ms 넘게 이어질 때만 Thinking Orbs의 `<Orb size={18}>`와 `label` 글자를 보여 준다. 보이지 않을 때도 같은 너비를 차지한다.
  - `<ProfileForm initial={PublicState} onSaved={() => void} submitLabel={string} />`
  - `App`: `getState()`로 프로필이 없으면 `Onboarding`, 있으면 위쪽 줄 + 본문. 위쪽 줄: `연구비서`, 새 소식 건수, 수집 중이면 `<StatusOrb label="수집 중">` 아니면 `새로 고침` 버튼, `설정` 버튼. 본문은 `Feed`(Task 10, 지금은 빈 자리) 또는 `Settings`.

화면 규칙(설계 4.8):

- 글꼴은 `system-ui` 계열 하나, 본문 15px, 줄 간격 1.6, 본문 폭 최대 640px.
- 색은 CSS 변수로 두고 `prefers-color-scheme`으로 밝은/어두운 값을 바꾼다. 강조색 `--accent`는 밝은 모드 `#6D4AFF`, 어두운 모드 `#A594FF`. 그 밖은 무채색.
- 누를 수 있는 것은 `:hover`에 반응하고 `:focus-visible`에 2px 강조색 테두리.
- `ProfileForm` 입력: 영문 키워드(쉼표로 구분, 필수), 한글 키워드(선택), 국가(`한국` / `그 외`), OpenAlex 키(비밀번호 입력칸, 저장돼 있으면 `저장됨`과 `삭제` 버튼, 옆에 `발급 방법 (무료, 약 30초)` 버튼 → `openHelp`), 알림 시각(`<input type="time">`), 로그인 시 자동 실행(체크, 기본 켬). 키가 없을 때 안내: `키가 없으면 논문은 arXiv에서만 가져옵니다.` 서버가 돌려준 `errors`는 입력칸 아래에 그대로 보여 준다.
- `Settings`: `ProfileForm` + 카테고리 켜기/끄기(`ACTIVE_CATEGORIES`) + 출처 상태 목록(`status.errors`에 있으면 실패 메시지, 수집 중이면 그 줄에 `<StatusOrb state="retrying">`, 없으면 `정상`) + `알림 테스트` 버튼.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const now = new Date(2026, 10, 24, 15, 0);
expect(relativeDate(new Date(2026, 10, 24, 1, 0).toISOString(), now)).toBe('오늘');
expect(relativeDate(new Date(2026, 10, 23, 23, 0).toISOString(), now)).toBe('어제');
expect(relativeDate(new Date(2026, 10, 19, 12, 0).toISOString(), now)).toBe('5일 전');
expect(relativeDate(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe('2026-10-01');
expect(formatStars(999)).toBe('999'); expect(formatStars(1234)).toBe('1.2k'); expect(formatStars(15000)).toBe('15.0k');
```

- [ ] **Step 2:** `npm test` → 실패 확인. `vitest.config.ts`의 include가 `tests/**`라 렌더러의 `format.ts`를 그대로 import한다.
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → 통과
- [ ] **Step 5:** 커밋 `feat: app shell, onboarding, settings`

### Task 10: 피드 화면과 오브 — 담당: Opus

**Files:**
- Create: `screens/Feed.tsx`, `components/CategoryChips.tsx`, `components/ItemRow.tsx`, `components/BigOrb.tsx`, `components/Orb/Orb.tsx`, `components/Orb/Orb.css`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `window.api`, `StatusOrb`, `relativeDate`, `formatStars`, `ACTIVE_CATEGORIES`, `CATEGORY_LABEL`
- Produces: `<Feed status={CollectStatus} onCount={(n: number) => void} />`, `<BigOrb moving={boolean} />`

동작 규칙:

- `components/Orb/`에 React Bits Orb의 `Orb.tsx`와 `Orb.css`를 "확인된 사실"의 주소에서 받아 그대로 둔다(파일 첫 줄에 출처와 라이선스 `MIT + Commons Clause` 주석). `BigOrb`는 200×200 상자 안에 `<Orb paused={!moving} followCursor={false} clickPulse={false} rotateOnHover={false} backgroundColor={현재 배경색} />`을 넣는다.
- `Feed`의 탭: `새 소식` / `지난 소식` / `저장함`.
- 새 소식 목록은 이번에 창을 연 동안의 목록이다. `takeNew()`를 부르는 때: 화면이 처음 뜰 때, `visibilitychange`로 다시 보일 때, 수집이 끝났을 때(`status.running`이 참에서 거짓으로). 받은 묶음은 기존 목록의 같은 카테고리 앞쪽에 붙인다. 창이 숨겨지면 목록을 비운다. 건수가 바뀌면 `onCount`.
- 칩(`CategoryChips`)은 보기 필터다. `ACTIVE_CATEGORIES`를 모두 켠 상태로 시작하고, 누르면 그 카테고리 묶음을 감추거나 보인다. 수집 여부는 바꾸지 않는다(그것은 설정).
- 묶음마다 앞 5건을 보여 주고 나머지가 있으면 `더 보기 (N)` 버튼으로 펼친다.
- `ItemRow`: 제목(누르면 `openItem`), 둘째 줄 `출처 · 상대 날짜`(저장소는 `★1.2k` 추가), `summary`가 있으면 두 줄까지, `matched`가 있으면 `일치: a, b`, 버튼 `저장`/`저장 취소`, `관심 없음`. `관심 없음`은 `hide` 후 목록에서 뺀다.
- 빈 상태: 새 소식이 없고 수집 중이면 `<BigOrb moving />`과 `첫 소식을 모으는 중입니다`(저장된 항목이 하나도 없을 때) 또는 `새 소식을 확인하는 중입니다`. 수집 중이 아니면 `<BigOrb moving={false} />`와 `새 소식을 모두 확인했습니다`. 지난 소식·저장함이 비면 글자 한 줄만.
- 목록 뒤에는 오브를 깔지 않는다. 수집 중에 목록과 버튼의 자리가 밀리지 않는다.

- [ ] **Step 1:** 위 규칙대로 구현하고 `App`의 빈 자리에 `Feed`를 넣는다.
- [ ] **Step 2: 확인.** `npm test && npm run typecheck && npm run build` 통과. `npm run dev`로 프로필을 입력해 목록이 뜨는 것을 확인하고, 본 것과 다른 점이 있으면 보고한다.
- [ ] **Step 3:** 커밋 `feat: feed screen with category chips and orbs`

### Task 11: Windows 시험판 — 담당: Sonnet

이 과제는 사용자 GitHub 계정에 **비공개 저장소 `research-assistant`를 만들고 코드를 올린다**(설계 6절의 사용자 결정). 이 계획의 승인이 그 실행의 승인이다.

**Files:**
- Create: `.github/workflows/build-windows.yml`, `docs/windows-trial-checklist.md`

- [ ] **Step 1:** 워크플로: `on: workflow_dispatch`만(무료 빌드 시간 절약). `runs-on: windows-latest`, `actions/checkout`, `actions/setup-node`(`node-version: lts/*`, npm 캐시), `npm ci`, `npm test`, `npm run build:win`, `actions/upload-artifact`로 `dist/*.exe`.
- [ ] **Step 2:** `docs/windows-trial-checklist.md`: 지인이 볼 한 장. 설치 때 SmartScreen에서 `추가 정보 → 실행`, 그리고 확인할 것 네 가지 — 프로필 입력 뒤 목록이 뜨는지, 설정의 `알림 테스트`로 알림이 뜨는지, 창을 닫아도 트레이에 남는지, 재부팅 뒤 자동으로 시작되는지.
- [ ] **Step 3:** 커밋 후 `gh repo create research-assistant --private --source=. --push`.
- [ ] **Step 4:** `gh workflow run build-windows.yml` → `gh run watch` → 성공하면 `gh run download`로 exe를 `dist/`에 받는다. 걸린 시간(분)을 보고한다(설계 9절: 무료 빌드 시간이 충분한지).
- [ ] **Step 5:** `npm run build:mac`으로 dmg 두 개(arm64, x64)를 만든다.

### Task 12 (조건부): 알림 대체 창 — 담당: Opus

Task 1의 Step 7에서 Mac 알림이 뜨지 않았거나, 지인의 Windows 확인에서 알림이 뜨지 않았을 때만 실행한다.

**Files:** Modify `src/main/notify.ts`

- [ ] **Step 1:** 운영체제 알림 대신 앱이 직접 작은 창을 띄운다: 테두리 없는 항상 위 창(360×96), 주 화면 작업 영역의 오른쪽 아래, 앱 아이콘과 본문 글자, 누르면 피드를 열고 닫힘, 10초 뒤 저절로 닫힘, 포커스를 빼앗지 않는다(`showInactive`). 어느 방식을 쓸지는 플랫폼별 상수 하나로 정한다.
- [ ] **Step 2:** `알림 테스트`로 확인하고 커밋 `feat: in-app fallback notification window`.

---

## Verification (Fable이 직접)

1. `npm test`, `npm run typecheck`, `npm run build`가 모두 통과한다.
2. `npm run dev`로 실제 사용 흐름을 따라가며 화면을 캡처해 확인한다.
   - 첫 실행 화면에서 영문 키워드만 넣고 저장 → 큰 오브와 `첫 소식을 모으는 중입니다` → 논문·저장소·뉴스 묶음이 뜬다.
   - 칩으로 카테고리를 감추고 보인다. `더 보기`가 펼쳐진다. 항목을 누르면 기본 브라우저에서 열린다. `저장`은 저장함에, `관심 없음`은 사라진다.
   - 창을 닫았다 열면 방금 본 항목은 `지난 소식`에 있고 새 소식은 `모두 확인했습니다`이다.
   - 앱을 끝내고 다시 켜도 본 항목이 새 소식으로 돌아오지 않는다.
   - 알림 시각을 1~2분 뒤로 바꾸고 기다린다. 새 항목이 있으면 `새 소식 N건 (…)` 알림이 한 번 뜨고, 누르면 피드가 열린다. 새 항목이 없으면 알림이 없다.
   - 설정에서 뉴스를 끄면 다음 수집부터 뉴스 요청과 표시가 없다.
   - 밝은/어두운 모드를 바꿔 글자 대비와 오브 색을 본다. `동작 줄이기`를 켜면 오브가 멈춘다.
3. `npm run build:mac`으로 만든 dmg를 설치해 포장된 앱에서 2번의 알림·트레이·자동 실행을 다시 본다.
4. 앱 아이콘과 트레이 아이콘 그림을 사용자에게 보여 주고 확정받는다(설계 4.8).
5. Windows exe와 `docs/windows-trial-checklist.md`를 사용자에게 전달한다. 지인의 결과에 따라 Task 12 실행 여부를 정한다.
6. 사용자가 OpenAlex 키를 넣은 상태에서 논문에 `OpenAlex` 출처 항목이 섞여 나오는지 확인한다(키 입력은 사용자가 직접).

## 이 계획에 넣지 않은 것

- 게시판 감시와 과제 공고(2단계), 참고문헌 찾기·추세 그래프(3단계), 지인용 설치 안내와 최종 배포(4단계)
- 화면 컴포넌트 자동 테스트: 순수 함수만 자동 테스트하고 화면은 실행해서 확인한다
- 국가는 `한국` / `그 외` 두 가지만 지원한다(그 외는 영문 뉴스)

## 실행 중 바뀐 것 (2026-11-24)

계획을 실행하면서 검토와 사용자 결정으로 바뀐 내용이다. 위 본문과 다르면 이 절이 맞다.

- **Electron 44.x.** 스캐폴드가 고정한 버전을 그대로 쓴다(본문의 45는 당시 npm 최신).
- **한글 앱 이름.** `CFBundleName`을 분해형(NFD)으로 넣어야 포장된 앱이 실행된다. 포장 대상은 `out/**`, `resources/**`만 허용한다.
- **90일 규칙.** `mergeIncoming`은 날짜가 90일보다 오래된 항목을 받지 않는다. arXiv에 날짜 범위가 없어, 180일 뒤 정리된 논문이 다시 새 소식이 될 수 있었기 때문이다.
- **출처 변환.** 숫자 문자 참조(`&#39;`)를 풀고, arXiv의 오류 항목은 실패로 처리하고, 제목에 글자·숫자가 없는 항목은 버린다. 뉴스 id는 guid가 아니라 제목+언론사로 만든다(guid가 요청마다 바뀌는 것을 확인).
- **일정.** 어제의 알림 시각은 날짜 생성자로 직접 만든다(서머타임). 오프라인이거나 그날 수집이 전부 실패하면 그날 분을 쓰지 않고 다시 시도한다.
- **수집기.** 건너뛴 출처의 이전 오류는 지운다. 상태 파일은 디스크에 내려쓴 뒤 교체한다.
- **메인 프로세스.** 수집 결과는 살아 있는 상태에 새 id만 더하는 방식으로 적용한다(`applyCollected`). 수집 제어·요청·일정 확인은 테스트 가능한 순수 모듈로 옮겼다. 수집 중 프로필을 저장하면 끝난 뒤 한 번 더 수집한다. 로그인 항목은 포장된 앱에서만 등록한다. 요청은 Electron의 `net.fetch`로 보낸다.
- **화면.** 사용자가 색(차콜·앰버), 아이콘(원자), 오브(마우스에 반응하는 점 구)를 바꿨다(Task 10b, 10c 추가). 창이 보이는지는 메인 프로세스가 알려 주고, 새 소식 목록이 실제로 표시될 때만 확인 처리한다. 관심 없음은 저장도 해제한다.
- **Task 11 분리.** 11a(설정 정리, 워크플로, 확인 목록)는 로컬에서 끝냈고, 11b(GitHub 저장소 생성, 올리기, Windows 빌드, dmg)는 최종 검토의 수정이 끝난 코드로 한 번만 한다.
- **버전.** 시험판이므로 0.1.0.
