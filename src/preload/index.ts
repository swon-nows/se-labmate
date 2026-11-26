// sandbox: true에서 preload는 'electron'만 require할 수 있다. 나머지는 타입만 가져온다.
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { CollectStatus, UpdateInfo } from '../shared/types'
import type { Api } from './index.d'

const api: Api = {
  getState: () => ipcRenderer.invoke('getState'),
  saveProfile: (input) => ipcRenderer.invoke('saveProfile', input),
  takeNew: () => ipcRenderer.invoke('takeNew'),
  getPast: () => ipcRenderer.invoke('getPast'),
  getSaved: () => ipcRenderer.invoke('getSaved'),
  setSaved: (id, saved) => ipcRenderer.invoke('setSaved', id, saved),
  hide: (id) => ipcRenderer.invoke('hide', id),
  refresh: () => ipcRenderer.invoke('refresh'),
  openItem: (id) => ipcRenderer.invoke('openItem', id),
  openHelp: (which) => ipcRenderer.invoke('openHelp', which),
  testNotification: () => ipcRenderer.invoke('testNotification'),
  previewBoard: (url) => ipcRenderer.invoke('previewBoard', url),
  addBoard: (input) => ipcRenderer.invoke('addBoard', input),
  removeBoard: (id) => ipcRenderer.invoke('removeBoard', id),
  openUpdate: () => ipcRenderer.invoke('openUpdate'),
  installUpdate: () => ipcRenderer.invoke('installUpdate'),
  onStatus: (cb) => {
    const listener = (_e: IpcRendererEvent, s: CollectStatus): void => cb(s)
    ipcRenderer.on('status', listener)
    return () => {
      ipcRenderer.removeListener('status', listener)
    }
  },
  onUpdate: (cb) => {
    const listener = (_e: IpcRendererEvent, u: UpdateInfo | null): void => cb(u)
    ipcRenderer.on('update', listener)
    return () => {
      ipcRenderer.removeListener('update', listener)
    }
  },
  onWindowVisible: (cb) => {
    let subscribed = true
    const listener = (_e: IpcRendererEvent, visible: boolean): void => cb(visible)
    ipcRenderer.on('window-visible', listener)
    // 창이 먼저 보여졌어도 놓치지 않게 지금 값을 한 번 묻는다. 같은 통로라 순서가 지켜진다.
    ipcRenderer.invoke('windowVisible').then(
      (visible: boolean) => {
        if (subscribed) cb(visible)
      },
      () => undefined
    )
    return () => {
      subscribed = false
      ipcRenderer.removeListener('window-visible', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
