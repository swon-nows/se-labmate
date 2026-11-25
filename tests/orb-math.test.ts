import { describe, expect, it } from 'vitest'
import {
  approach,
  dotBase,
  dotRadius,
  ALPHA_STEPS,
  alphaStep,
  canvasScale,
  frameGap,
  pointCount,
  projectAll,
  speedTarget,
  spherePoints,
  stepAlpha
} from '../src/renderer/src/orb-math'
import type { OrbFrame, Point } from '../src/renderer/src/orb-math'

const project = (p: Point, f: OrbFrame, radius: number): { x: number; y: number; d: number } => {
  const out = new Float64Array(3)
  projectAll([p], f, radius, out)
  return { x: out[0], y: out[1], d: out[2] }
}

describe('spherePoints', () => {
  it('n개의 단위 벡터, y는 +1 근처에서 -1 근처로 엄격히 줄어든다', () => {
    for (const n of [48, 150]) {
      const pts = spherePoints(n)
      expect(pts).toHaveLength(n)
      for (const p of pts) expect(Math.abs(Math.hypot(p.x, p.y, p.z) - 1)).toBeLessThan(1e-9)
      for (let i = 1; i < n; i++) expect(pts[i].y).toBeLessThan(pts[i - 1].y)
      expect(pts[0].y).toBeCloseTo(1 - 1 / n, 12)
      expect(pts[n - 1].y).toBeCloseTo(-1 + 1 / n, 12)
    }
  })
})

describe('pointCount, dotBase, dotRadius', () => {
  it('200px은 150개 그대로, 작은 오브는 점이 커진 만큼 적다 (22px → 28, 16px → 22)', () => {
    expect(pointCount(200)).toBe(150)
    expect(pointCount(22)).toBe(28)
    expect(pointCount(16)).toBe(22)
  })
  it('점 기본 반지름은 size·0.0105, 1px 아래로 내려가지 않는다', () => {
    expect(dotBase(200)).toBeCloseTo(2.1, 12)
    expect(dotBase(22)).toBe(1)
  })
  it('점 반지름은 기본·(0.45 + 0.75·깊이), 0.9px 아래로 내려가지 않고, 200px 오브는 바뀌지 않는다', () => {
    for (const d of [0, 0.5, 1]) expect(dotRadius(200, d)).toBe(dotBase(200) * (0.45 + 0.75 * d))
    expect(dotRadius(22, 0)).toBe(0.9)
    expect(dotRadius(22, 1)).toBeCloseTo(1.2, 12)
    expect(dotRadius(16, 0.2)).toBe(0.9)
  })
})

describe('speedTarget, approach', () => {
  it('수집 중 2.8, 마우스만 올리면 1.1, 그 밖은 0.35', () => {
    expect(speedTarget(true, false)).toBe(2.8)
    expect(speedTarget(true, true)).toBe(2.8)
    expect(speedTarget(false, true)).toBe(1.1)
    expect(speedTarget(false, false)).toBe(0.35)
  })
  it('목표 쪽으로 min(1, dt·rate)만큼 다가가고 넘치지 않는다', () => {
    expect(approach(0.35, 2.8, 5, 0.1)).toBeCloseTo(0.35 + 2.45 * 0.5, 12)
    expect(approach(0.35, 2.8, 5, 1)).toBe(2.8)
  })
})

describe('projectAll', () => {
  const frames = [
    { rot: 0, tiltX: 0, tiltY: 0, time: 0, busy: false, burst: 0 },
    { rot: 1.3, tiltX: 0.7, tiltY: -1, time: 2.2, busy: true, burst: 0 },
    { rot: -4, tiltX: -1, tiltY: 1, time: 9.9, busy: false, burst: 1 },
    { rot: 2, tiltX: 0.2, tiltY: 0.4, time: 0.5, busy: true, burst: 0.4 }
  ]
  it('깊이는 [0, 1], 중심에서의 거리는 반지름·활성 배율 이하', () => {
    const radius = 72
    for (const f of frames)
      for (const p of spherePoints(150)) {
        const q = project(p, f, radius)
        expect(q.d).toBeGreaterThanOrEqual(0)
        expect(q.d).toBeLessThanOrEqual(1)
        const breathe = 1 + 0.03 * Math.sin(f.time * 1.6)
        const wave = f.busy ? 1 + 0.09 * Math.sin(f.time * 7 + p.y * 5) : 1
        const max = radius * breathe * (1 + 0.22 * f.burst) * wave
        expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(max + 1e-9)
      }
  })
  it('기울기 없이 돌지 않은 정면 점은 중심에, 가장 가깝다', () => {
    const q = project({ x: 0, y: 0, z: 1 }, frames[0], 72)
    expect(q.x).toBeCloseTo(0, 12)
    expect(q.y).toBeCloseTo(0, 12)
    expect(q.d).toBeCloseTo(1, 12)
  })
})

describe('그리기 단계', () => {
  it('여러 점을 한 번에 계산해도 점 하나씩 계산한 값과 같다', () => {
    const pts = spherePoints(28)
    const f = { rot: 1.3, tiltX: 0.7, tiltY: -1, time: 2.2, busy: true, burst: 0.4 }
    const out = new Float64Array(pts.length * 3)
    projectAll(pts, f, 8, out)
    pts.forEach((p, i) => {
      const q = project(p, f, 8)
      expect([out[3 * i], out[3 * i + 1], out[3 * i + 2]]).toEqual([q.x, q.y, q.d])
    })
  })
  it('밝기 단계는 0…7, 단계의 밝기는 0.22와 1 사이에서 깊이를 따라 커진다', () => {
    expect(alphaStep(0)).toBe(0)
    expect(alphaStep(1)).toBe(ALPHA_STEPS - 1)
    expect(alphaStep(0.5)).toBe(4)
    for (let s = 0; s < ALPHA_STEPS; s++) {
      expect(stepAlpha(s)).toBeGreaterThan(0.22)
      expect(stepAlpha(s)).toBeLessThan(1)
      if (s > 0) expect(stepAlpha(s)).toBeGreaterThan(stepAlpha(s - 1))
    }
    // 단계로 묶어도 원래 밝기(0.22 + 0.78·깊이)와 반 단계 넘게 다르지 않다
    for (const d of [0, 0.1, 0.33, 0.5, 0.77, 1])
      expect(Math.abs(stepAlpha(alphaStep(d)) - (0.22 + 0.78 * d))).toBeLessThanOrEqual(
        0.78 / ALPHA_STEPS / 2 + 1e-12
      )
  })
  it('빠를 때는 12ms, 천천히 돌 때는 30ms 간격. 캔버스는 적어도 2배', () => {
    expect(frameGap(true)).toBe(12)
    expect(frameGap(false)).toBe(30)
    expect(canvasScale(1)).toBe(2)
    expect(canvasScale(1.25)).toBe(2)
    expect(canvasScale(3)).toBe(3)
    expect(canvasScale(0)).toBe(2)
  })
})
