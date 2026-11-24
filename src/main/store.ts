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
import type { AppState } from '../shared/types'

export function defaultState(): AppState {
  return {
    version: 1,
    profile: null,
    settings: {
      notifyTime: '09:00',
      openAtLogin: true,
      enabled: { paper: true, repo: true, news: true, grant: true, conference: true, school: true }
    },
    openAlexKeyEnc: null,
    items: {},
    lastDailyRunAt: null,
    lastNotifiedAt: null,
    sourceErrors: {}
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function isState(v: unknown): v is AppState {
  return (
    isObject(v) &&
    v.version === 1 &&
    isObject(v.items) &&
    isObject(v.settings) &&
    isObject(v.settings.enabled)
  )
}

export function loadState(file: string): AppState {
  if (!existsSync(file)) return defaultState()
  const text = readFileSync(file, 'utf8') // 읽기 오류는 깨진 파일이 아니므로 그대로 던진다
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    value = null
  }
  if (isState(value)) return value
  // 깨진 파일은 지우지 않고 옆에 남겨 둔다.
  renameSync(file, join(dirname(file), `state.corrupt-${Date.now()}.json`))
  return defaultState()
}

export function saveState(file: string, state: AppState): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  // 이름을 바꾸기 전에 디스크까지 내려 쓴다. 전원이 나가도 빈 state.json이 좋은 파일을 대신하지 않게 한다.
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, JSON.stringify(state)) // writeSync와 달리 부분 쓰기를 끝까지 이어 쓴다
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
}
