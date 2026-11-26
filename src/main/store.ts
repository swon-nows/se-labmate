import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_REPO_COUNT, MAX_REPO_COUNT } from '../shared/types'
import type { AppState } from '../shared/types'

export function defaultState(): AppState {
  return {
    version: 2,
    profile: null,
    settings: {
      notifyTime: '09:00',
      openAtLogin: true,
      enabled: { paper: true, repo: true, news: true, grant: true, conference: true, school: true },
      repoCount: DEFAULT_REPO_COUNT
    },
    openAlexKeyEnc: null,
    items: {},
    lastDailyRunAt: null,
    lastNotifiedAt: null,
    sourceErrors: {},
    boards: [],
    boardKnown: {}
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function isState(v: unknown): v is AppState {
  return (
    isObject(v) &&
    v.version === 2 &&
    Array.isArray(v.boards) &&
    isObject(v.boardKnown) &&
    isObject(v.items) &&
    isObject(v.settings) &&
    isObject(v.settings.enabled)
  )
}

// 저장된 repoCount가 1~MAX_REPO_COUNT의 정수가 아니면(옛 파일에는 없다) 기본값으로 바꿔 늘 쓸 수 있는 값을 둔다.
function withDefaults(state: AppState): AppState {
  const n = state.settings.repoCount
  if (Number.isInteger(n) && n >= 1 && n <= MAX_REPO_COUNT) return state
  return { ...state, settings: { ...state.settings, repoCount: DEFAULT_REPO_COUNT } }
}

// v1 → v2(메모리에서만): OpenAlex의 저널 이름을 summary에서 venue로 옮긴다.
function migrateV1(v: Record<string, unknown>): unknown {
  if (!isObject(v.items)) return { ...v, version: 2, boards: [], boardKnown: {} }
  const items = Object.fromEntries(
    Object.entries(v.items).map(([id, it]) => [
      id,
      isObject(it) && it.source === 'OpenAlex' && it.summary && !it.venue
        ? { ...it, venue: it.summary, summary: '' }
        : it
    ])
  )
  return { ...v, version: 2, boards: [], boardKnown: {}, items }
}

// 옛 앱(v0.1)이 같은 폴더의 이 파일을 계속 쓰므로 읽기만 한다. 쓸 수 없는 내용이면 없는 것으로 본다.
function loadLegacy(legacyFile: string): AppState {
  try {
    const value: unknown = JSON.parse(readFileSync(legacyFile, 'utf8'))
    const migrated = isObject(value) && value.version === 1 ? migrateV1(value) : null
    if (isState(migrated)) return withDefaults(migrated)
  } catch {
    // 읽거나 해석할 수 없는 옛 파일
  }
  return defaultState()
}

// onCorrupt: 깨진 파일을 옮겨 둔 경로를 받는다(사용자에게 알리기 위해).
// legacyFile: file이 아직 없을 때만 읽는 v1 파일. 고치지도 옮기지도 않는다.
export function loadState(
  file: string,
  onCorrupt?: (backupPath: string) => void,
  legacyFile?: string
): AppState {
  if (!existsSync(file)) return legacyFile ? loadLegacy(legacyFile) : defaultState()
  const text = readFileSync(file, 'utf8') // 읽기 오류는 깨진 파일이 아니므로 그대로 던진다
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    value = null
  }
  if (isState(value)) return withDefaults(value)
  // 깨진 파일은 지우지 않고 옆에 남겨 둔다.
  const backup = join(dirname(file), `state.corrupt-${Date.now()}.json`)
  renameSync(file, backup)
  onCorrupt?.(backup)
  return defaultState()
}

export function saveState(file: string, state: AppState): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  // 이름을 바꾸기 전에 디스크까지 내려 쓴다. 전원이 나가도 빈 파일이 좋은 파일을 대신하지 않게 한다.
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, JSON.stringify(state)) // writeSync와 달리 부분 쓰기를 끝까지 이어 쓴다
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  replace(tmp, file)
}

// Windows에서는 백신 등이 파일을 잠시 쥐고 있으면 이름 바꾸기가 실패한다. 50ms 간격으로 다섯 번까지 다시 해 본다.
function replace(from: string, to: string): void {
  for (let retry = 0; ; retry++) {
    try {
      return renameSync(from, to)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      if (
        process.platform !== 'win32' ||
        retry === 5 ||
        !['EPERM', 'EBUSY', 'EACCES'].includes(code)
      )
        throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}
