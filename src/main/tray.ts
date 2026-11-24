import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null // module scope so the tray is not garbage-collected

export function createTray(actions: { open(): void; refresh(): void; quit(): void }): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('연구비서')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: () => actions.open() },
      { label: '새로 고침', click: () => actions.refresh() },
      { label: '종료', click: () => actions.quit() }
    ])
  )
  if (process.platform === 'win32') tray.on('click', () => actions.open())
}

export function setTrayUnseen(hasUnseen: boolean): void {
  // 아이콘(점 있음/없음)을 바꾸는 곳은 여기 하나다. Task 8 전까지는 툴팁만 바꾼다.
  tray?.setToolTip(hasUnseen ? '연구비서 — 새 소식 있음' : '연구비서')
}
