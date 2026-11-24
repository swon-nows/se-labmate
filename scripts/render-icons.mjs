// Renders build/*.svg into build/icon.png and the resources/*.png icons, then checks its own output.
// Run: npx electron scripts/render-icons.mjs  (exits non-zero on any failure)
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, cannot declare return types */
import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const TRAY_COLOR = '#8f7bff' // readable on both light and dark Windows taskbars
// [svg, png, pixel size, kind]; tray SVGs draw in currentColor, so the kind picks the colour
const jobs = [
  ['icon.svg', 'build/icon.png', 1024, 'icon'],
  ['icon.svg', 'resources/icon.png', 512, 'icon'],
  ['tray.svg', 'resources/trayTemplate.png', 16, 'template'],
  ['tray.svg', 'resources/trayTemplate@2x.png', 32, 'template'],
  ['tray-dot.svg', 'resources/trayDotTemplate.png', 16, 'template'],
  ['tray-dot.svg', 'resources/trayDotTemplate@2x.png', 32, 'template'],
  ['tray.svg', 'resources/tray.png', 32, 'color'],
  ['tray-dot.svg', 'resources/tray-dot.png', 32, 'color']
]

async function render(svgFile, size, kind) {
  const svg = readFileSync(resolve(root, 'build', svgFile), 'utf8')
  const color = kind === 'color' ? TRAY_COLOR : '#000'
  const html = `<!doctype html><style>html,body{margin:0;background:transparent;color:${color}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  const win = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((done) => setTimeout(done, 200)) // let the offscreen surface paint once
    return await win.webContents.capturePage()
  } finally {
    win.destroy()
  }
}

// Returns a list of problems with one written PNG (empty when it is fine).
function verify(file, size, kind) {
  const path = resolve(root, file)
  const bytes = readFileSync(path)
  const problems = []
  // createFromPath is how the app loads these; it reads "@2x" files as 2x, so exact pixels come from the buffer
  if (nativeImage.createFromPath(path).isEmpty())
    problems.push('createFromPath decoded an empty image')
  const image = nativeImage.createFromBuffer(bytes)
  const { width, height } = image.getSize()
  if (width !== size || height !== size)
    problems.push(`is ${width}x${height}, expected ${size}x${size}`)
  if (bytes[25] !== 6) problems.push('has no alpha channel (PNG colour type is not RGBA)')
  const px = image.toBitmap() // BGRA, premultiplied
  const at = (x, y) => px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)
  // the rounded square leaves a 100/1024 transparent margin, which also holds for the glow
  const margin = (size * 100) / 1024
  let opaque = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [b, g, r, a] = at(x, y)
      if (a > 0) opaque++
      if (kind === 'template' && (b || g || r))
        problems.push(`template pixel ${x},${y} is not black`)
      if (kind === 'color' && a === 255 && (r !== 0x8f || g !== 0x7b || b !== 0xff))
        problems.push(`tray pixel ${x},${y} is not ${TRAY_COLOR}`)
      const inMargin = x < margin || y < margin || x >= size - margin || y >= size - margin
      if (kind === 'icon' && inMargin && a)
        problems.push(`icon margin pixel ${x},${y} is not transparent`)
    }
  }
  if (opaque === 0) problems.push('is fully transparent')
  return [...new Set(problems)].slice(0, 5)
}

app.dock?.hide()
app.on('window-all-closed', () => {}) // keep running between jobs, when no window is open
app
  .whenReady()
  .then(async () => {
    const failures = []
    for (const [svg, file, size, kind] of jobs) {
      const image = await render(svg, size, kind)
      writeFileSync(resolve(root, file), image.toPNG())
      for (const problem of verify(file, size, kind)) failures.push(`${file}: ${problem}`)
      console.log(`wrote ${file} (${size}x${size})`)
    }
    if (failures.length) throw new Error(`verification failed:\n${failures.join('\n')}`)
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
