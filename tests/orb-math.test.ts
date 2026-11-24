import { describe, expect, it } from 'vitest'
import {
  approach,
  dotBase,
  pointCount,
  project,
  speedTarget,
  spherePoints
} from '../src/renderer/src/orb-math'

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

describe('pointCount, dotBase', () => {
  it('100px 이상은 150개, 22px은 48개, 작을수록 적다', () => {
    expect(pointCount(100)).toBe(150)
    expect(pointCount(200)).toBe(150)
    expect(pointCount(22)).toBe(48)
    expect(pointCount(16)).toBeLessThan(pointCount(22))
  })
  it('점 기본 반지름은 size·0.0105, 0.6px 아래로 내려가지 않는다', () => {
    expect(dotBase(200)).toBeCloseTo(2.1, 12)
    expect(dotBase(22)).toBe(0.6)
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

describe('project', () => {
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
