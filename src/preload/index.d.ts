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
  // 창이 열려 있는지(트레이로 닫지 않았고, 내리지 않았고, 앱을 가리지 않음. 다른 창에 덮인 것은 열린 것).
  // 구독하면 지금 값을 한 번 받고, 이후 바뀔 때마다 받는다.
  onWindowVisible(cb: (visible: boolean) => void): () => void
}
declare global {
  interface Window {
    api: Api
  }
}
