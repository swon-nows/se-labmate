// 창이 사용자에게 열려 있는가: 트레이로 닫지 않았고, 내리지 않았고, (macOS) 앱을 가리지 않았다.
// 다른 창에 덮인 것은 열려 있는 것으로 본다. macOS의 hide·show 이벤트와 isVisible()은 덮임을 따르므로 쓰지 않는다.
export const isWindowOpen = (
  closedToTray: boolean,
  minimised: boolean,
  appHidden: boolean
): boolean => !closedToTray && !minimised && !appHidden
