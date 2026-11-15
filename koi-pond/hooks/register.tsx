import type { Register } from 'claude-code'

// Pixel-art pond: everything lives on a 320x200 grid, drawn as crisp rects.
const K = 1.5 // finer grid: 1.5x the pixels of the 320x200 design
const W = 480
const H = 300
const sc = (pts: number[][]) => pts.map(p => p.map(v => v * K))

type Grid = Map<string, string> // "x,y" -> color

const put = (g: Grid, x: number, y: number, c: string) => {
  x = Math.round(x)
  y = Math.round(y)
  if (x >= 0 && y >= 0 && x < W && y < H) g.set(x + ',' + y, c)
}

const disc = (g: Grid, cx: number, cy: number, rx: number, ry: number, c: string) => {
  for (let y = Math.floor(-ry); y <= ry; y++)
    for (let x = Math.floor(-rx); x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) put(g, cx + x, cy + y, c)
}

const ringPx = (g: Grid, cx: number, cy: number, r: number, c: string) => {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180
    put(g, cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.62, c)
  }
}

// Merge pixels into horizontal runs, one <path> per color.
const emit = (g: Grid, extra = '') => {
  const byColor = new Map<string, Array<[number, number]>>()
  for (const [k, c] of g) {
    const [x, y] = k.split(',').map(Number)
    if (!byColor.has(c)) byColor.set(c, [])
    byColor.get(c)!.push([x, y])
  }
  let out = ''
  for (const [c, pts] of byColor) {
    pts.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    let d = ''
    let i = 0
    while (i < pts.length) {
      const [x, y] = pts[i]
      let w = 1
      while (i + w < pts.length && pts[i + w][1] === y && pts[i + w][0] === x + w) w++
      d += `M${x} ${y}h${w}v1h-${w}z`
      i += w
    }
    out += `<path fill="${c}" ${extra} d="${d}"/>`
  }
  return out
}

// ---- koi: a chain of body segments that follows the head's path ------------
type Fish = { base: string; patch: string; accent: string; left: string; right: string; fin: string; pts: number[][]; dur: number; phase: number; len: number }

// Radius of each body segment from head to tail, in design pixels.
const PROFILE = [3.4, 4.6, 5.2, 5.0, 4.4, 3.6, 2.9, 2.2, 1.6]
const SPACING = 3.2 // distance between segments, design pixels
const SWAY = 0.17 // how much the tail end sways, design pixels per segment

type Pt = { x: number; y: number }

// Point at arc distance `d` back along a fish's trail (index 0 is the head).
const atArc = (trail: Pt[], d: number): Pt => {
  let acc = 0
  for (let j = 0; j + 1 < trail.length; j++) {
    const a = trail[j]!
    const b = trail[j + 1]!
    const len = Math.hypot(a.x - b.x, a.y - b.y)
    if (acc + len >= d) {
      const u = len > 0 ? (d - acc) / len : 0
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
    }
    acc += len
  }
  const last = trail[trail.length - 1]!
  return { x: last.x, y: last.y }
}

const koiGrid = (f: Fish, trail: Pt[], t: number) => {
  const g: Grid = new Map()
  const n = PROFILE.length
  const seg = (i: number) => {
    const d = Math.max(0, i) * SPACING * K
    const p = atArc(trail, d)
    const ahead = atArc(trail, Math.max(0, d - 1.5 * K))
    const behind = atArc(trail, d + 1.5 * K)
    const ang = Math.atan2(ahead.y - behind.y, ahead.x - behind.x)
    const sway = Math.sin(t * 1.5 - i * 0.75) * SWAY * i * K
    return { x: p.x - Math.sin(ang) * sway, y: p.y + Math.cos(ang) * sway, ang }
  }
  // tail fin: a solid, widening leaf shape trailing the last body segment
  const tailLen = 3.2 // in segments
  for (let k = 0; k <= tailLen; k += 0.08) {
    const q = seg(n - 1.6 + k)
    const half = (1.4 + 3.4 * Math.sin((Math.min(k / tailLen, 1) * Math.PI) / 1.6)) * 0.85 * K
    for (let s = -half; s <= half; s += 0.3) {
      put(g, q.x - Math.sin(q.ang) * s, q.y + Math.cos(q.ang) * s, f.fin)
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    const c = seg(i)
    const r = PROFILE[i]! * K
    const sa = Math.sin(c.ang)
    const ca = Math.cos(c.ang)
    const R = Math.ceil(r)
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const side = -dx * sa + dy * ca // which flank of the body this pixel is on
        const col = (side > 0 ? f.left : f.right)[i]
        put(g, c.x + dx, c.y + dy, col === 'p' ? f.patch : col === 'a' ? f.accent : f.base)
      }
    if (i === 2) {
      // pectoral fins, a gentle flutter
      const flap = (Math.sin(t * 2.4) + 1) * 0.5
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4 + flap * 3; k++) {
          put(g, c.x - sa * side * (r + k * 0.8) - ca * k * 0.6, c.y + ca * side * (r + k * 0.8) - sa * k * 0.6, f.fin)
        }
      }
    }
    if (i === 0) {
      for (const side of [-1, 1]) put(g, c.x + ca * r * 0.45 - sa * side * r * 0.62, c.y + sa * r * 0.45 + ca * side * r * 0.62, '#10262b')
    }
  }
  return g
}

const fishSvg = (f: Fish, trail: Pt[], t: number) => {
  const g = koiGrid(f, trail, t)
  const shade: Grid = new Map()
  for (const k of g.keys()) shade.set(k, '#04161a')
  return `<g transform="translate(2 4)" opacity="0.3">${emit(shade)}</g>${emit(g)}`
}

// Position and heading along a closed Catmull-Rom loop at phase u in [0,1).
const along = (pts: number[][], u: number) => {
  const n = pts.length
  const P = (i: number) => pts[((i % n) + n) % n] as number[]
  const sIdx = (((u % 1) + 1) % 1) * n
  const i = Math.floor(sIdx)
  const t = sIdx - i
  const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)] as [number[], number[], number[], number[]]
  const bez = (k: number) => {
    const c1 = p1[k]! + (p2[k]! - p0[k]!) / 6
    const c2 = p2[k]! - (p3[k]! - p1[k]!) / 6
    const m = 1 - t
    const pos = m * m * m * p1[k]! + 3 * m * m * t * c1 + 3 * m * t * t * c2 + t * t * t * p2[k]!
    const d = 3 * m * m * (c1 - p1[k]!) + 6 * m * t * (c2 - c1) + 3 * t * t * (p2[k]! - c2)
    return [pos, d] as const
  }
  const [x, dx] = bez(0)
  const [y, dy] = bez(1)
  return { x, y, ang: Math.atan2(dy, dx) }
}

const loopLength = (pts: number[][]) => {
  let total = 0
  let prev = along(pts, 0)
  for (let i = 1; i <= 240; i++) {
    const cur = along(pts, i / 240)
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y)
    prev = cur
  }
  return total
}

const makeFish = (f: Omit<Fish, 'len'>): Fish => ({ ...f, len: loopLength(f.pts) })
// left/right: one letter per body segment, head to tail (b base, p patch, a accent)
const FISH: Fish[] = [
  makeFish({ base: '#f4efe6', patch: '#e8571f', accent: '#2b2b30', fin: '#dcd6cb', left: 'bppbbabbb', right: 'bbpppbabb', pts: sc([[52, 128], [124, 156], [204, 140], [256, 96], [200, 56], [112, 66], [66, 94]]), dur: 170, phase: 0.1 }),
  makeFish({ base: '#e9772b', patch: '#fbf3e4', accent: '#f2b24a', fin: '#d4691f', left: 'bbppbbbab', right: 'bbbbpppbb', pts: sc([[248, 172], [180, 180], [140, 128], [176, 92], [236, 112]]), dur: 140, phase: 0.55 }),
  makeFish({ base: '#f2d9a8', patch: '#d63a2a', accent: '#d63a2a', fin: '#e4c690', left: 'bbpppbbbb', right: 'bppbbbapb', pts: sc([[60, 36], [128, 24], [180, 48], [140, 80], [84, 66]]), dur: 120, phase: 0.3 }),
]

// ---- living pond: pellets, splashes, and fish that steer ------------------
type FishState = { x: number; y: number; th: number; trail: Pt[] }
type Pellet = { x: number; y: number; born: number }
type Splash = { x: number; y: number; born: number; big: boolean }

const TRAIL_MAX = 120 * K
const initState = (f: Fish): FishState => {
  const p = along(f.pts, f.phase)
  const trail: Pt[] = []
  for (let k = 0; k <= TRAIL_MAX; k++) {
    const q = along(f.pts, f.phase - k / f.len)
    trail.push({ x: q.x, y: q.y })
  }
  return { x: p.x, y: p.y, th: p.ang, trail }
}

let fishState: FishState[] = FISH.map(initState)
let pellets: Pellet[] = []
let splashes: Splash[] = []
let frame = 0
let isOn = false
let isTicking = false

const drop = (count: number) => {
  const t = frame * 0.1
  for (let i = 0; i < count; i++) {
    // land in the margins either side of the chat column, where the pond shows
    const left = Math.random() < 0.5
    const p = { x: (left ? 14 + Math.random() * 46 : 262 + Math.random() * 44) * K, y: (24 + Math.random() * 150) * K, born: t }
    pellets.push(p)
    splashes.push({ x: p.x, y: p.y, born: t, big: false })
  }
}

// One physics tick (0.1 s): each fish steers toward the nearest pellet in reach,
// else toward a point just ahead on its own loop. Turns are slow and gentle.
const step = () => {
  const t = frame * 0.1
  pellets = pellets.filter(p => t - p.born < 80)
  splashes = splashes.filter(s => t - s.born < 2.4)
  FISH.forEach((f, i) => {
    const st = fishState[i]!
    const base = (f.len / f.dur) * 0.1
    const ghost = along(f.pts, t / f.dur + f.phase + 0.012)
    let target: Pt = ghost
    let prey: Pellet | null = null
    let best = 260 * K
    for (const p of pellets) {
      const d = Math.hypot(p.x - st.x, p.y - st.y)
      if (d < best) {
        best = d
        prey = p
        target = p
      }
    }
    const dist = Math.hypot(target.x - st.x, target.y - st.y)
    const want = Math.atan2(target.y - st.y, target.x - st.x)
    const diff = Math.atan2(Math.sin(want - st.th), Math.cos(want - st.th))
    const turn = prey ? 0.07 : 0.05
    st.th += Math.max(-turn, Math.min(turn, diff))
    const speed = prey ? base * (dist > 12 * K ? 2.4 : 1.1) : base * (1 + Math.min(dist / (25 * K), 1.5))
    st.x += Math.cos(st.th) * speed
    st.y += Math.sin(st.th) * speed
    st.trail.unshift({ x: st.x, y: st.y })
    let acc = 0
    for (let j = 0; j + 1 < st.trail.length; j++) {
      acc += Math.hypot(st.trail[j]!.x - st.trail[j + 1]!.x, st.trail[j]!.y - st.trail[j + 1]!.y)
      if (acc > TRAIL_MAX) {
        st.trail.length = j + 2
        break
      }
    }
    if (prey && dist < 2.4 * K) {
      pellets = pellets.filter(p => p !== prey)
      splashes.push({ x: prey.x, y: prey.y, born: t, big: true })
    }
  })
}

const pelletsSvg = () => {
  const g: Grid = new Map()
  for (const p of pellets) {
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) {
      put(g, p.x + dx!, p.y + dy! + 2, '#0a2c33')
      put(g, p.x + dx!, p.y + dy!, dx === 1 && dy === 1 ? '#fff4c2' : '#f0cf6a')
    }
  }
  return emit(g)
}

const splashSvg = (t: number) => {
  const g: Grid = new Map()
  for (const s of splashes) {
    const idx = Math.floor((t - s.born) / 0.6)
    const radii = s.big ? [4, 8, 12, 16] : [3, 6, 9, 12]
    if (idx >= 0 && idx < 4) ringPx(g, s.x, s.y, radii[idx]! * K, idx < 2 ? '#a9e3dc' : '#6fc0b8')
  }
  return emit(g)
}

// ---- water: flat bands with checker-dithered seams ------------------------
const BANDS = ['#0a3038', '#0f4350', '#175a63', '#1f7076', '#2a8a88']
const water = () => {
  let out = `<defs>`
  for (let i = 1; i < BANDS.length; i++)
    out += `<pattern id="d${i}" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${BANDS[i - 1]}"/><rect width="1" height="1" fill="${BANDS[i]}"/><rect x="1" y="1" width="1" height="1" fill="${BANDS[i]}"/></pattern>`
  out += `</defs><rect width="${W}" height="${H}" fill="${BANDS[0]}"/>`
  for (let i = 1; i < BANDS.length; i++) {
    const k = 1 - i / BANDS.length
    const rx = (235 * k + 20) * K
    const ry = (150 * k + 14) * K
    out += `<ellipse cx="${150 * K}" cy="${88 * K}" rx="${rx + 7}" ry="${ry + 5}" fill="url(#d${i})"/><ellipse cx="${150 * K}" cy="${88 * K}" rx="${rx}" ry="${ry}" fill="${BANDS[i]}"/>`
  }
  return out
}

const scenery = () => {
  const g: Grid = new Map()
  // pond-floor stones
  const stone = (x: number, y: number, rx: number, ry: number) => {
    disc(g, x, y, rx, ry, '#0c3a42')
    disc(g, x - 1, y - 1, rx - 2, Math.max(1, ry - 2), '#124a52')
  }
  stone(52 * K, 172 * K, 14 * K, 5 * K)
  stone(268 * K, 38 * K, 17 * K, 6 * K)
  stone(176 * K, 186 * K, 10 * K, 4 * K)
  return emit(g)
}

const padG = (x: number, y: number, r: number, bloom?: string) => {
  const g: Grid = new Map()
  disc(g, x + 2, y + 2, r, r * 0.8, '#05202a')
  disc(g, x, y, r, r * 0.8, '#2c7a4b')
  disc(g, x - 1, y - 1, r - 2, r * 0.8 - 2, '#3b9560')
  for (let i = 0; i <= r; i++) put(g, x + i, y - Math.floor(i * 0.18), '#175a63')
  for (let i = 2; i < r - 1; i += 3) put(g, x - i, y - 1, '#2c7a4b')
  if (bloom) {
    const bx = x - Math.floor(r / 3)
    ;[[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => put(g, bx + dx!, y + dy!, bloom))
    ;[[0, -3], [0, 3], [-3, 0], [3, 0]].forEach(([dx, dy]) => put(g, bx + dx!, y + dy!, '#ffffff'))
    put(g, bx, y, '#f6d36b')
    put(g, bx + 1, y, '#f6d36b')
  }
  return emit(g)
}

const reedG = (x: number, flip: number) => {
  const g: Grid = new Map()
  const stalks: Array<[number, number, number]> = [[0, 42, 6], [5, 58, -3], [-6, 34, 8], [10, 40, 3], [-11, 26, -4]]
  for (const [dx0, h0, bend0] of stalks) {
    const [dx, h, bend] = [dx0 * K, Math.round(h0 * K), bend0 * K]
    for (let t = 0; t <= h; t++) {
      const bx = Math.round((bend * t * t) / (h * h))
      put(g, x + flip * (dx + bx), H - t, t % 5 === 0 ? '#1f5a3a' : '#173f31')
    }
  }
  const tipX = x + flip * Math.round(2 * K)
  for (let t = Math.round(40 * K); t < Math.round(50 * K); t++) {
    put(g, tipX, H - t, '#5a3f26')
    put(g, tipX + 1, H - t, '#6d4d2f')
  }
  return emit(g)
}

const ringsAt = (x: number, y: number) =>
  [3, 6, 10, 15].map((r0, i) => {
    const g: Grid = new Map()
    ringPx(g, x, y, r0 * K, i < 3 ? '#a9e3dc' : '#6fc0b8')
    return emit(g)
  })

const sparkleG = (x: number, y: number) => {
  const g: Grid = new Map()
  put(g, x, y, '#d9f5e8')
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(g, x + dx!, y + dy!, '#8fd6c8')
  return emit(g)
}

// Everything that never moves, built once.
const STATIC = water() + scenery()
const PADS = [
  { svg: padG(38 * K, 66 * K, 10 * K), period: 1.8 },
  { svg: padG(266 * K, 164 * K, 13 * K, '#f7a8c4'), period: 2.3 },
  { svg: padG(284 * K, 140 * K, 7 * K), period: 1.5 },
  { svg: padG(152 * K, 176 * K, 9 * K), period: 2.1 },
  { svg: padG(236 * K, 26 * K, 8 * K, '#fbd0e0'), period: 1.9 },
]
const REEDS = [{ svg: reedG(10 * K, 1), flip: 1 }, { svg: reedG(310 * K, -1), flip: -1 }]
const RIPPLES = [
  { rings: ringsAt(210 * K, 76 * K), off: 0 },
  { rings: ringsAt(86 * K, 144 * K), off: 10 },
  { rings: ringsAt(156 * K, 40 * K), off: 18 },
]
const PAD_SVG = PADS.map(p => p.svg).join('')
const REED_SVG = REEDS.map(r => r.svg).join('')
const _SPARKLES_UNUSED = [[44, 40], [120, 22], [206, 66], [262, 118], [90, 128], [180, 150], [296, 70], [30, 110]].map(([x, y], i) => ({
  svg: sparkleG(Math.round(x! * K), Math.round(y! * K)),
  period: 5 + (i % 4),
  off: i * 1.3,
}))

// One frame of the pond at time `t` seconds. Kept calm: no blinking, no jitter.
const scene = (t: number) => {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${STATIC}${PAD_SVG}${REED_SVG}`
  for (const r of RIPPLES) {
    const idx = Math.floor((((t + r.off) % 30) / 30) * 12)
    if (idx < 4) out += r.rings[idx]
  }
  out += pelletsSvg() + splashSvg(t)
  FISH.forEach((f, i) => (out += fishSvg(f, fishState[i]!.trail, t)))
  return out + '</svg>'
}

const GLASS = { blur: 14, tint: 'rgba(8, 40, 46, 1)', opacity: 0.5 }


const startTicker = ($: { clock: { every: (ms: number, fn: () => void) => unknown }; ui: { invalidate: (e: 'ui.render') => void } }) => {
  if (isTicking) return
  isTicking = true
  $.clock.every(100, () => {
    if (!isOn) return
    frame += 1
    step()
    $.ui.invalidate('ui.render')
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pond',
      description: 'Koi pond theme: /pond on (default) or /pond off',
    })
    await $.theme.set({ backdrop: { scene: 'koi-pond', glass: GLASS }, overrideColorScheme: 'dark' })
    isOn = true
    startTicker($)

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (isOn) drop(2)

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (isOn) drop(1)

    return next(e)
  })

  on('command.run', { command: 'pond' }, async ($, e) => {
    if (e.args.trim() === 'off') {
      isOn = false
      await $.theme.clear()

      return { text: 'Pond cleared.' }
    }
    const r = await $.theme.set({ backdrop: { scene: 'koi-pond', glass: GLASS }, overrideColorScheme: 'dark' })
    isOn = true
    startTicker($)

    return {
      text: r.isDrawn
        ? 'The koi are back.'
        : `Nothing is drawing the backdrop: ${r.reason}`,
    }
  })

  on('ui.render', { component: 'Backdrop', props: { scene: 'koi-pond' } }, ($, e, next) => {
    if (e.surface === 'terminal') return next(e)
    const { Svg } = $.ui.resolve(e)

    return <Svg source={scene(frame * 0.1)} alt="A calm pixel-art pond with koi swimming among lily pads" isInteractive />
  })
}
