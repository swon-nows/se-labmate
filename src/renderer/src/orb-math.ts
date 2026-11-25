// 점으로 된 구(오브)의 계산. 사용자가 승인한 견본의 상수를 그대로 쓴다.
export interface Point {
  x: number
  y: number
  z: number
}

export interface OrbFrame {
  rot: number // 세로축 회전각
  tiltX: number // 포인터 x (-1…1)를 따라가는 값. 각도는 0.6배
  tiltY: number // 포인터 y (-1…1)를 따라가는 값. 각도는 0.6배
  time: number // 초
  busy: boolean
  burst: number // 수집이 끝날 때 1, 이후 줄어든다
}

export const BURST_DECAY = 0.02 // 1초 뒤 남는 비율: burst *= 0.02^dt

// 피보나치 구: y가 +1 근처에서 -1 근처로 고르게 내려간다.
export function spherePoints(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.399963
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r }
  })
}

// 작은 오브는 점을 키운 만큼 적게: 1.5·size − 5개, 22~150개 (16px → 22, 22px → 28, 103px 이상 → 150).
export const pointCount = (size: number): number =>
  Math.min(150, Math.max(22, Math.round(1.5 * size - 5)))

export const dotBase = (size: number): number => Math.max(1, size * 0.0105)

// 1배 화면의 22px·16px 오브에서도 점이 보이도록 0.9px 아래로 내리지 않는다. 200px 오브는 가장 작은 점도 0.945px라 그대로다.
export const dotRadius = (size: number, depth: number): number =>
  Math.max(0.9, dotBase(size) * (0.45 + 0.75 * depth))

export const speedTarget = (busy: boolean, hover: boolean): number =>
  busy ? 2.8 : hover ? 1.1 : 0.35

export const approach = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * Math.min(1, dt * rate)

// 정사영. 돌린 뒤 포인터 쪽으로 기울인다(견본과 같은 순서). out에 점마다 x, y(중심에서의 화면 거리, px), 깊이(0…1)를 쓴다.
// 삼각함수는 프레임당 한 번만 계산하고 점마다 객체를 만들지 않는다(느린 PC에서 끊기지 않게).
export function projectAll(points: Point[], f: OrbFrame, radius: number, out: Float64Array): void {
  const cr = Math.cos(f.rot)
  const sr = Math.sin(f.rot)
  const ca = Math.cos(f.tiltX * 0.6)
  const sa = Math.sin(f.tiltX * 0.6)
  const cb = Math.cos(f.tiltY * 0.6)
  const sb = Math.sin(f.tiltY * 0.6)
  const base = radius * (1 + 0.03 * Math.sin(f.time * 1.6)) * (1 + 0.22 * f.burst)
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const x = p.x * cr + p.z * sr
    const z = -p.x * sr + p.z * cr
    const x1 = x * ca + z * sa
    const z1 = -x * sa + z * ca
    const y1 = p.y * cb - z1 * sb
    const z2 = p.y * sb + z1 * cb
    const scale = f.busy ? base * (1 + 0.09 * Math.sin(f.time * 7 + p.y * 5)) : base
    out[3 * i] = x1 * scale
    out[3 * i + 1] = y1 * scale
    out[3 * i + 2] = Math.min(1, Math.max(0, (z2 + 1) / 2))
  }
}

// 밝기는 깊이에 따라 0.22…1. 단계로 묶어 단계마다 한 번에 칠한다(점마다 칠하면 상태 변경이 150번).
export const ALPHA_STEPS = 8
export const alphaStep = (depth: number): number =>
  Math.min(ALPHA_STEPS - 1, Math.floor(depth * ALPHA_STEPS))
export const stepAlpha = (step: number): number => 0.22 + (0.78 * (step + 0.5)) / ALPHA_STEPS

// 이전 그림과의 최소 간격(ms). 움직임이 빠를 때는 초당 60장 안팎(144Hz 화면에서도), 천천히 돌 때는 30장이면 충분하다.
export const frameGap = (lively: boolean): number => (lively ? 12 : 30)

// 캔버스 배율. 1배 화면에서는 1px 안팎의 점이 반 픽셀씩 움직이며 깜빡이므로 적어도 2배로 그려 줄여 보인다.
export const canvasScale = (devicePixelRatio: number): number => Math.max(2, devicePixelRatio || 1)
