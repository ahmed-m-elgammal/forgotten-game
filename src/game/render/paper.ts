// ============================================================
// paper.ts — the notebook look: grain, line boil, handwriting.
// ------------------------------------------------------------
// WHY: every stroke in this game is drawn live with a small
// seeded jitter that re-randomizes every ~120ms (the classic
// "line boil" of hand-drawn animation). Keeping all wobble in
// one place makes the whole world feel drawn by the same pen.
// No external assets — everything is procedural canvas.
// ============================================================

export const INK = '#2b2620'
export const PAPER = '#f5ecd9'
export const PAPER_DARK = '#e7d9b8'
export const AMBER = '#d99a2b' // the color of "about to be forgotten"

export const HAND_FONT =
  '"Comic Sans MS","Segoe Print","Chalkboard SE","Comic Neue",cursive,sans-serif'

// ---- reduced motion ----------------------------------------------
let rmCache: boolean | null = null
/** prefers-reduced-motion: boil shrinks, shake/particles go quiet. */
export function reducedMotion(): boolean {
  if (rmCache === null) {
    rmCache =
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return rmCache
}

// ---- deterministic noise / boil -----------------------------------
/** Deterministic pseudo-random in [0,1) from a numeric seed. */
export function sRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Re-seeds roughly every 120ms — the boiling line rate. */
export function boilTick(time: number): number {
  return Math.floor(time * 8)
}

/** Signed jitter in [-amp, amp) that changes with the boil tick. */
export function jit(seed: number, time: number, amp: number): number {
  const a = reducedMotion() ? amp * 0.3 : amp
  return (sRand(seed * 7.31 + boilTick(time) * 131.7) * 2 - 1) * a
}

// ---- wobbly primitives --------------------------------------------
/** A hand-drawn line: short segments, each vertex jittered. */
export function wobblyLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  time: number,
  amp = 1.1,
  step = 26,
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const n = Math.max(2, Math.ceil(len / step))
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const edge = i === 0 || i === n ? 0.4 : 1
    const px = x1 + dx * t + jit(seed + i, time, amp) * edge
    const py = y1 + dy * t + jit(seed + i + 50, time, amp) * edge
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

/** Wobbly rectangle as a PATH (fill or stroke it afterwards). */
export function wobblyRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  time: number,
  amp = 1.2,
): void {
  const pts: Array<[number, number]> = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
  ctx.beginPath()
  ctx.moveTo(
    pts[0][0] + jit(seed, time, amp),
    pts[0][1] + jit(seed + 1, time, amp),
  )
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    const mx = (a[0] + b[0]) / 2 + jit(seed + i * 3, time, amp * 1.4)
    const my = (a[1] + b[1]) / 2 + jit(seed + i * 3 + 1, time, amp * 1.4)
    ctx.lineTo(mx, my)
    ctx.lineTo(
      b[0] + jit(seed + i * 7, time, amp * 0.7),
      b[1] + jit(seed + i * 7 + 1, time, amp * 0.7),
    )
  }
  ctx.closePath()
}

/** Wobbly rectangle, stroked with the current style. */
export function wobblyRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  time: number,
  amp = 1.2,
): void {
  wobblyRectPath(ctx, x, y, w, h, seed, time, amp)
  ctx.stroke()
}

/** Dashed ghost outline (used for platforms SOLIDITY forgot). */
export function dashRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  time: number,
  color: string,
  alpha = 0.8,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.setLineDash([6, 5])
  ctx.lineJoin = 'round'
  ctx.translate(
    x + w / 2 + jit(seed, time, 0.6),
    y + h / 2 + jit(seed + 9, time, 0.6),
  )
  ctx.rotate(jit(seed + 3, time, 0.004))
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Diagonal hatching clipped to a rect — the universal "danger" cue. */
export function hatchRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
  gap = 8,
  seed = 1,
  time = 0,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineWidth = 1.6
  for (let d = -h; d < w + h; d += gap) {
    ctx.beginPath()
    ctx.moveTo(x + d + jit(seed + d, time, 0.5), y)
    ctx.lineTo(x + d - h + jit(seed + d + 7, time, 0.5), y + h)
    ctx.stroke()
  }
  ctx.restore()
}

/** Rounded-rect PATH helper (no stroke/fill — caller decides). */
export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

// ---- handwriting ---------------------------------------------------
export interface HandTextOpts {
  color?: string
  align?: 'left' | 'center' | 'right'
  alpha?: number
  seed?: number
  time?: number
  rot?: number
}

/** Handwritten text: per-character jitter makes it look scribbled. */
export function handText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  opts?: HandTextOpts,
): void {
  const o = opts ?? {}
  const color = o.color ?? INK
  const align = o.align ?? 'left'
  const alpha = o.alpha ?? 1
  const seed = o.seed ?? 1
  const time = o.time ?? 0
  const rot = o.rot ?? 0
  ctx.save()
  ctx.font = `${size}px ${HAND_FONT}`
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  ctx.textBaseline = 'alphabetic'
  const widths: number[] = []
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const w = ctx.measureText(text[i]).width
    widths.push(w)
    total += w
  }
  let ox = x
  if (align === 'center') ox = x - total / 2
  else if (align === 'right') ox = x - total
  ctx.translate(ox, y)
  if (rot) ctx.rotate(rot)
  let cx = 0
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(
      text[i],
      cx + jit(seed + i, time, size * 0.035),
      jit(seed + i + 31, time, size * 0.045),
    )
    cx += widths[i]
  }
  ctx.restore()
}

// ---- small sketchy glyphs ------------------------------------------
/** A shrinking countdown arc + seconds scribble — the fairness cue. */
export function countdownScribble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frac: number,
  secs: number,
  color: string,
  seed: number,
  time: number,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.4
  const f = Math.max(0, Math.min(1, frac))
  ctx.beginPath()
  ctx.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f)
  ctx.stroke()
  const a = -Math.PI / 2 + Math.PI * 2 * f
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 2.2, 0, Math.PI * 2)
  ctx.fill()
  handText(ctx, `${Math.max(1, Math.ceil(secs))}`, x, y + 22, 11, {
    color,
    align: 'center',
    seed,
    time,
  })
  ctx.restore()
}

/** Scribbled-out cross-hatch over a circle (a forgotten token). */
export function scribbleOver(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  time: number,
  color: string,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  for (let i = 0; i < 3; i++) {
    const y = cy - r * 0.5 + i * r * 0.5
    wobblyLine(ctx, cx - r * 0.8, y + r * 0.2, cx + r * 0.8, y - r * 0.2, seed + i, time, 0.8)
  }
  ctx.restore()
}

/** A tiny paper clip (the "kept/pinned" mark). */
export function clipGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  time: number,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  const w = s * 0.55
  const h = s
  const jx = jit(x, time, 0.6)
  const jy = jit(y + 3, time, 0.6)
  roundedRectPath(ctx, x - w / 2 + jx, y - h / 2 + jy, w, h, w / 2)
  ctx.stroke()
  roundedRectPath(
    ctx,
    x - w / 2 + 2.6 + jx,
    y - h / 2 + 2.6 + jy,
    w - 5.2,
    h - 5.2,
    Math.max(1, w / 2 - 2.6),
  )
  ctx.stroke()
  ctx.restore()
}

// ---- paper grain ----------------------------------------------------
/** Pre-rendered low-alpha noise tile, tiled with a slow drift. */
export function makeGrainTile(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 180
  c.height = 180
  const g = c.getContext('2d')
  if (!g) return c
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(43,38,32,${0.02 + sRand(i) * 0.035})`
    g.fillRect(sRand(i * 3) * 180, sRand(i * 5 + 1) * 180, 1.4, 1.4)
  }
  for (let i = 0; i < 26; i++) {
    // faint paper fibers
    g.strokeStyle = 'rgba(43,38,32,0.025)'
    g.lineWidth = 0.8
    const x = sRand(i * 11) * 180
    const y = sRand(i * 13) * 180
    const a = sRand(i * 17) * Math.PI
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7)
    g.stroke()
  }
  return c
}
