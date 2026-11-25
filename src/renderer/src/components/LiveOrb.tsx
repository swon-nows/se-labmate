import { useEffect, useRef, useState } from 'react'
import {
  ALPHA_STEPS,
  BURST_DECAY,
  alphaStep,
  approach,
  canvasScale,
  dotRadius,
  frameGap,
  pointCount,
  projectAll,
  speedTarget,
  spherePoints,
  stepAlpha
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
    const projected = new Float64Array(points.length * 3)
    const steps = new Uint8Array(points.length)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const m = { rot: 0, speed: 0.35, tx: 0, ty: 0, burst: 0, wasBusy: input.current.busy }
    let color = getComputedStyle(canvas).color
    let raf = 0
    let last = 0
    let onScreen = true

    const draw = (time: number): void => {
      const scale = canvasScale(window.devicePixelRatio)
      const px = Math.round(size * scale)
      if (canvas.width !== px) canvas.width = canvas.height = px
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = color
      projectAll(
        points,
        { rot: m.rot, tiltX: m.tx, tiltY: m.ty, time, busy: input.current.busy, burst: m.burst },
        0.36 * size,
        projected
      )
      for (let i = 0; i < points.length; i++) steps[i] = alphaStep(projected[3 * i + 2])
      const c = size / 2
      for (let step = 0; step < ALPHA_STEPS; step++) {
        ctx.globalAlpha = stepAlpha(step)
        ctx.beginPath()
        for (let i = 0; i < points.length; i++) {
          if (steps[i] !== step) continue
          const x = c + projected[3 * i]
          const y = c + projected[3 * i + 1]
          const r = dotRadius(size, projected[3 * i + 2])
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, 2 * Math.PI)
        }
        ctx.fill()
      }
    }

    const moving = (): boolean =>
      !reduce.matches && document.visibilityState === 'visible' && onScreen

    const tick = (now: number): void => {
      raf = 0
      if (!moving()) return update() // 멈춰야 하면 (동작 줄이기라면 멈춘 한 장을 그리고) 고리를 끝낸다
      const i = input.current
      // 화면 주사율만큼 다 그리지 않는다. 간격이 안 됐으면 이번 프레임은 건너뛴다.
      const lively = i.busy || i.hover || i.pointer || m.wasBusy || m.burst > 0.01
      if (last && now - last < frameGap(lively)) {
        raf = requestAnimationFrame(tick)
        return
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
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

    // 멈춘 한 장: 튐과 시간은 0으로 둔다(튀던 중에 멈춰도 커진 채 남지 않게).
    const drawStill = (): void => {
      m.burst = 0
      m.wasBusy = input.current.busy
      draw(0)
    }
    // 움직여도 되면 고리를 돌리고, 동작 줄이기면 멈춘 한 장을 그린다.
    const update = (): void => {
      if (moving()) {
        if (!raf) {
          last = 0
          m.wasBusy = input.current.busy // 멈춘 동안 끝난 수집으로 다시 돌 때 늦게 튀지 않게 한다
          raf = requestAnimationFrame(tick)
        }
        return
      }
      cancelAnimationFrame(raf)
      raf = 0
      if (reduce.matches) drawStill()
    }
    const onScheme = (): void => {
      color = getComputedStyle(canvas).color
      update()
    }
    redrawStill.current = () => {
      if (reduce.matches) drawStill()
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
