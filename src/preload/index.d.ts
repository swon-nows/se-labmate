import type {
  CollectStatus,
  FeedGroup,
  Item,
  PublicState,
  SaveInput,
  SaveResult
} from '../shared/types'

export interface Api {
  getState(): Promise<PublicState>
  saveProfile(input: SaveInput): Promise<SaveResult>
  takeNew(): Promise<FeedGroup[]>
  getPast(): Promise<Item[]> // pastItems(state, 100)
  getSaved(): Promise<Item[]>
  setSaved(id: string, saved: boolean): Promise<void>
  hide(id: string): Promise<void>
  refresh(): Promise<void> // 수집이 끝나면 resolve
  openItem(id: string): Promise<void> // 저장된 항목의 url이 isHttpUrl일 때만 shell.openExternal
  openHelp(which: 'openalex-key'): Promise<void> // https://openalex.org/settings/api
  testNotification(): Promise<void>
  onStatus(cb: (s: CollectStatus) => void): () => void // 구독 해제 함수 반환
}
declare global {
  interface Window {
    api: Api
  }
}
