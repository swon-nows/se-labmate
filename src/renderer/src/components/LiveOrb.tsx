import { useEffect, useRef, useState } from 'react'
import {
  BURST_DECAY,
  approach,
  dotBase,
  pointCount,
  project,
  speedTarget,
  spherePoints
} from '../orb-math'
import { OrbBoundary } from './OrbBoundary'

interface Props {
  size: number
  busy: boolean
  hover?: boolean // 장식으로 쓸 때 부모가 정한다
  onActivate?: () => void // 있으면 진짜 버튼이 된다
  label?: string
}

// 장식이 실패해도 그 자리만 비운다.
export function LiveOrb(props: Props): React.JSX.Element {
  return (
    <OrbBoundary>
      <Orb {...props} />
    </OrbBoundary>
  )
}

const canDraw = (): boolean => document.createElement('canvas').getContext('2d') !== null

function Orb({ size, busy, hover = false, onActivate, label }: Props): React.JSX.Element | null {
  const [drawable] = useState(canDraw)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 그리기 고리가 매 프레임 읽는 최신 입력
  const input = useRef({ busy, hover, pointer: false, px: 0, py: 0 })
  const redrawStill = useRef<(() => void) | null>(null)

  useEffect(() => {
    input.current.busy = busy
    input.current.hover = hover
    redrawStill.current?.()
  }, [busy, hover])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const points = spherePoints(pointCount(size))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const m = { rot: 0, speed: 0.35, tx: 0, ty: 0, burst: 0, wasBusy: input.current.busy }
    let color = getComputedStyle(canvas).color
    let raf = 0
    let last = 0
    let onScreen = true

    const draw = (time: number): void => {
      const dpr = window.devicePixelRatio || 1
      const px = Math.round(size * dpr)
      if (canvas.width !== px) canvas.width = canvas.height = px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = color
      const frame = {
        rot: m.rot,
        tiltX: m.tx,
        tiltY: m.ty,
        time,
        busy: input.current.busy,
        burst: m.burst
      }
      const base = dotBase(size)
      for (const p of points) {
        const q = project(p, frame, 0.36 * size)
        ctx.globalAlpha = 0.22 + 0.78 * q.d
        ctx.beginPath()
        ctx.arc(size / 2 + q.x, size / 2 + q.y, base * (0.45 + 0.75 * q.d), 0, 2 * Math.PI)
        ctx.fill()
      }
    }

    const moving = (): boolean =>
      !reduce.matches && document.visibilityState === 'visible' && onScreen

    const tick = (now: number): void => {
      raf = 0
      if (!moving()) return
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const i = input.current
      if (m.wasBusy && !i.busy) m.burst = 1 // 수집이 끝나면 한 번 튄다
      m.wasBusy = i.busy
      m.speed = approach(m.speed, speedTarget(i.busy, i.hover || i.pointer), 5, dt)
      m.rot += m.speed * dt
      m.tx = approach(m.tx, i.pointer ? i.px : 0, 6, dt)
      m.ty = approach(m.ty, i.pointer ? i.py : 0, 6, dt)
      m.burst *= Math.pow(BURST_DECAY, dt)
      draw(now / 1000)
      raf = requestAnimationFrame(tick)
    }

    // 움직여도 되면 고리를 돌리고, 동작 줄이기면 멈춘 한 장을 그린다.
    const update = (): void => {
      if (moving()) {
        if (!raf) {
          last = 0
          raf = requestAnimationFrame(tick)
        }
        return
      }
      cancelAnimationFrame(raf)
      raf = 0
      if (reduce.matches) draw(0)
    }
    const onScheme = (): void => {
      color = getComputedStyle(canvas).color
      update()
    }
    redrawStill.current = () => {
      if (reduce.matches) draw(0)
    }
    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      update()
    })
    seen.observe(canvas)
    reduce.addEventListener('change', update)
    dark.addEventListener('change', onScheme)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('resize', update) // 화면 배율이 바뀌면 멈춘 그림도 다시 그린다
    update()
    return () => {
      cancelAnimationFrame(raf)
      redrawStill.current = null
      seen.disconnect()
      reduce.removeEventListener('change', update)
      dark.removeEventListener('change', onScheme)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('resize', update)
    }
  }, [size])

  if (!drawable) return null
  const canvas = (
    <canvas
      ref={canvasRef}
      className="live-orb-canvas"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
  if (!onActivate) return canvas
  return (
    <button
      type="button"
      className="live-orb-button"
      aria-label={label}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onActivate()
      }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width - 0.5) * 2
        const py = ((e.clientY - r.top) / r.height - 0.5) * 2
        Object.assign(input.current, { pointer: true, px, py })
      }}
      onPointerLeave={() => {
        input.current.pointer = false
      }}
    >
      {canvas}
    </button>
  )
}
