import { Notification } from 'electron'

let shown: Notification | null = null // 참조를 잡아 두지 않으면 GC되어 click이 오지 않는다

export function notify(body: string, onClick: () => void): void {
  if (!Notification.isSupported()) return
  shown = new Notification({ title: 'SE LabMate', body })
  shown.on('click', onClick)
  shown.show()
}
