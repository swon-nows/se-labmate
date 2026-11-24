// sandbox: true에서 preload는 'electron'만 require할 수 있다. 나머지는 타입만 가져온다.
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { CollectStatus } from '../shared/types'
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
  onStatus: (cb) => {
    const listener = (_e: IpcRendererEvent, s: CollectStatus): void => cb(s)
    ipcRenderer.on('status', listener)
    return () => {
      ipcRenderer.removeListener('status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
