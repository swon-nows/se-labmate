import type {
  BoardInput,
  BoardResult,
  CollectStatus,
  FeedGroup,
  Item,
  PreviewResult,
  PublicState,
  SaveInput,
  SaveResult,
  UpdateInfo
} from '../shared/types'

export interface Api {
  getState(): Promise<PublicState>
  saveProfile(input: SaveInput): Promise<SaveResult>
  takeNew(): Promise<FeedGroup[]>
  getPast(): Promise<Item[]> // pastItems(state, 100): 카테고리마다 100건까지
  getSaved(): Promise<Item[]>
  setSaved(id: string, saved: boolean): Promise<void>
  hide(id: string): Promise<void>
  refresh(): Promise<void> // 수집이 끝나면 resolve
  openItem(id: string): Promise<void> // 저장된 항목의 url이 isHttpUrl일 때만 shell.openExternal
  openHelp(which: 'openalex-key'): Promise<void> // https://openalex.org/settings/api
  testNotification(): Promise<void>
  previewBoard(url: string): Promise<PreviewResult> // 등록 전 미리 보기: 앞 5건
  addBoard(input: BoardInput): Promise<BoardResult> // 저장한 뒤 수집을 시작한다
  removeBoard(id: string): Promise<void> // 이미 모은 항목은 남긴다
  openUpdate(): Promise<void> // 알고 있는 새 릴리스 페이지를 연다. 인자를 받지 않는다
  onStatus(cb: (s: CollectStatus) => void): () => void // 구독 해제 함수 반환
  onUpdate(cb: (u: UpdateInfo | null) => void): () => void // 새 버전을 알게 될 때마다. 구독 해제 함수 반환
  // 창이 열려 있는지(트레이로 닫지 않았고, 내리지 않았고, 앱을 가리지 않음. 다른 창에 덮인 것은 열린 것).
  // 구독하면 지금 값을 한 번 받고, 이후 바뀔 때마다 받는다.
  onWindowVisible(cb: (visible: boolean) => void): () => void
}
declare global {
  interface Window {
    api: Api
  }
}
