import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
// `?asset` points at the file inside resources/ (app.asar/resources/ when packaged, unpacked by
// electron-builder). createFromPath finds the "@2x" file next to it, so Retina menu bars get 32 px.
import trayTemplate from '../../resources/trayTemplate.png?asset'
import trayDotTemplate from '../../resources/trayDotTemplate.png?asset'
import trayColor from '../../resources/tray.png?asset'
import trayDotColor from '../../resources/tray-dot.png?asset'

let tray: Tray | null = null // module scope so the tray is not garbage-collected

function trayImage(hasUnseen: boolean): NativeImage {
  if (process.platform !== 'darwin') {
    return nativeImage.createFromPath(hasUnseen ? trayDotColor : trayColor)
  }
  const image = nativeImage.createFromPath(hasUnseen ? trayDotTemplate : trayTemplate)
  image.setTemplateImage(true) // the menu bar tints it for light/dark
  return image
}

export function createTray(actions: { open(): void; refresh(): void; quit(): void }): void {
  tray = new Tray(trayImage(false))
  tray.setToolTip('SE LabMate')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: () => actions.open() },
      { label: 'Refresh', click: () => actions.refresh() },
      { label: 'Quit', click: () => actions.quit() }
    ])
  )
  if (process.platform === 'win32') tray.on('click', () => actions.open())
}

export function setTrayUnseen(hasUnseen: boolean): void {
  tray?.setImage(trayImage(hasUnseen))
  tray?.setToolTip(hasUnseen ? 'SE LabMate — new items' : 'SE LabMate')
}
