// ============================================================
// fx.ts — transient presentation effects (v1.3 "ink & sound").
// ------------------------------------------------------------
// Everything here is VISUAL ONLY: the renderer diffs engine
// state between frames and spawns from those transitions, the
// layer advances with the engine-clock delta (so effects freeze
// when the page holds still), and nothing reads or writes game
// state. The vocabulary is all stationery:
//   · crumbs     — eraser bits a rule sheds as it is forgotten
//   · ghosts     — the dashed outline that outlives a thing
//   · drops      — ink flecks that kick up on jumps / new lines
//   · splats     — the margin takes you: a burst of ink
//   · dust       — soft paper-dust puffs on landings / restores
//   · graphite   — pencil specks where the Observer writes
//   · nibs       — the Observer's pen tip, tracing a circle live
// ============================================================
import { GRAPHITE, INK, dashRect, jit, sRand } from './paper'

type ParticleKind = 'crumb' | 'drop' | 'splat' | 'dust' | 'graphite'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number // gravity, px/s²
  drag: number // exponential horizontal drag /s
  t: number // age
  life: number
  size: number
  color: string
  kind: ParticleKind
  seed: number
}

interface Ghost {
  x: number
  y: number
  w: number
  h: number
  t: number
  dur: number
}

interface Nib {
  cx: number
  cy: number
  rx: number
  ry: number
  t: number
  dur: number
  seed: number
  dustClock: number
}

const CRUMB_COLORS = ['#c98d84', '#b9a58e', '#93866f']
const CIRCLE_SWEEP = Math.PI * 2.05 // matches the uncircled mark

export class FxLayer {
  private particles: Particle[] = []
  private ghosts: Ghost[] = []
  private nibs: Nib[] = []

  /** a new page is blank again */
  clear(): void {
    this.particles = []
    this.ghosts = []
    this.nibs = []
  }

  // ---- spawners -------------------------------------------------------
  /** eraser bits pop off a rect (a rule just forgot it) */
  spawnCrumbs(x: number, y: number, w: number, h: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + sRand(i * 3.1 + x) * w,
        y: y + sRand(i * 7.7 + y) * h,
        vx: (sRand(i * 13.3) - 0.5) * 110,
        vy: -30 - sRand(i * 5.9) * 120,
        g: 560,
        drag: 1.6,
        t: 0,
        life: 0.45 + sRand(i * 2.3) * 0.45,
        size: 1.4 + sRand(i * 11.1) * 1.9,
        color: CRUMB_COLORS[i % CRUMB_COLORS.length],
        kind: 'crumb',
        seed: i,
      })
    }
  }

  /** a small puff of crumbs around a point (a rule with no body lets go) */
  spawnPuff(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + sRand(i) * 0.8
      const r = 12 + sRand(i * 3.7) * 14
      this.particles.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.7,
        vx: Math.cos(a) * 46,
        vy: Math.sin(a) * 34 - 34,
        g: 300,
        drag: 2.2,
        t: 0,
        life: 0.4 + sRand(i * 1.9) * 0.3,
        size: 1.3 + sRand(i * 8.3) * 1.4,
        color: CRUMB_COLORS[i % CRUMB_COLORS.length],
        kind: 'crumb',
        seed: i,
      })
    }
  }

  spawnGhost(x: number, y: number, w: number, h: number, dur = 1.35): void {
    this.ghosts.push({ x, y, w, h, t: 0, dur })
  }

  /** ink flecks kicked up from a point (jumps, fresh lines, springs) */
  spawnDrops(x: number, y: number, color: string, count = 3, power = 1): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (sRand(i * 4.3) - 0.5) * 10,
        y,
        vx: (sRand(i * 9.1) - 0.5) * 130 * power,
        vy: -60 - sRand(i * 6.6) * 90 * power,
        g: 900,
        drag: 0.4,
        t: 0,
        life: 0.35 + sRand(i * 2.9) * 0.25,
        size: 1.4 + sRand(i * 12.4) * 1.4,
        color,
        kind: 'drop',
        seed: i,
      })
    }
  }

  /** the margin takes you — ink bursts back up from the edge */
  spawnSplat(x: number, y: number): void {
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (sRand(i * 3.3) - 0.5) * 2.2
      const sp = 90 + sRand(i * 7.1) * 210
      this.particles.push({
        x: x + (sRand(i) - 0.5) * 18,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 620,
        drag: 0.8,
        t: 0,
        life: 0.5 + sRand(i * 5.2) * 0.4,
        size: 1.6 + sRand(i * 2.1) * 2.6,
        color: INK,
        kind: 'drop',
        seed: i,
      })
    }
    // stains that land and stay a moment
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x + (sRand(i * 17.7) - 0.5) * 34,
        y: y + 2,
        vx: 0,
        vy: 0,
        g: 0,
        drag: 0,
        t: 0,
        life: 1.1 + sRand(i * 4.9) * 0.5,
        size: 2.6 + sRand(i * 8.8) * 3.4,
        color: INK,
        kind: 'splat',
        seed: i,
      })
    }
  }

  /** soft paper dust — landings, restores, quiet events */
  spawnDust(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (sRand(i * 6.1) - 0.5) * 26,
        y: y + (sRand(i * 3.4) - 0.5) * 5,
        vx: (sRand(i * 8.8) - 0.5) * 70,
        vy: -14 - sRand(i * 4.4) * 36,
        g: -36, // dust floats, it does not fall
        drag: 2.6,
        t: 0,
        life: 0.35 + sRand(i * 2.2) * 0.3,
        size: 1.8 + sRand(i * 9.9) * 1.8,
        color: '#8a7a5f',
        kind: 'dust',
        seed: i,
      })
    }
  }

  /** the Observer's pen tip will trace a circle around this plank */
  spawnNib(cx: number, cy: number, w: number, h: number): void {
    this.nibs.push({
      cx,
      cy,
      rx: w / 2 + 10,
      ry: h / 2 + 9,
      t: 0,
      dur: 1.5,
      seed: Math.random() * 1000,
      dustClock: 0,
    })
  }

  // ---- update ----------------------------------------------------------
  update(dt: number): void {
    if (dt <= 0) return
    for (const p of this.particles) {
      p.t += dt
      p.vy += p.g * dt
      p.vx *= Math.max(0, 1 - p.drag * dt)
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.particles = this.particles.filter((p) => p.t < p.life)
    for (const g of this.ghosts) g.t += dt
    this.ghosts = this.ghosts.filter((g) => g.t < g.dur)
    // the nib sheds graphite as it writes
    for (const n of this.nibs) {
      n.t += dt
      const k = n.t / n.dur
      if (k >= 1) continue
      const sweep = Math.min(1, k / 0.72)
      const a = sweep * CIRCLE_SWEEP
      const tx = n.cx + Math.cos(a) * n.rx
      const ty = n.cy + Math.sin(a) * n.ry
      n.dustClock += dt
      while (n.dustClock > 0.045) {
        n.dustClock -= 0.045
        this.particles.push({
          x: tx + (Math.random() - 0.5) * 5,
          y: ty + (Math.random() - 0.5) * 5,
          vx: (Math.random() - 0.5) * 40,
          vy: -8 - Math.random() * 26,
          g: 260,
          drag: 2,
          t: 0,
          life: 0.3 + Math.random() * 0.25,
          size: 1 + Math.random() * 1.1,
          color: GRAPHITE,
          kind: 'graphite',
          seed: Math.random() * 100,
        })
      }
    }
    this.nibs = this.nibs.filter((n) => n.t < n.dur)
  }

  // ---- draw ---------------------------------------------------------
  /** dashed outlines of just-forgotten things — drawn UNDER the world */
  drawGhosts(ctx: CanvasRenderingContext2D, time: number): void {
    for (const g of this.ghosts) {
      const a = 0.55 * (1 - g.t / g.dur)
      dashRect(ctx, g.x, g.y, g.w, g.h, 901, time, INK, a)
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D, time: number): void {
    for (const p of this.particles) {
      const k = p.t / p.life
      const a = 1 - k
      ctx.save()
      switch (p.kind) {
        case 'crumb': {
          ctx.globalAlpha = 0.9 * a
          ctx.fillStyle = p.color
          ctx.translate(p.x, p.y)
          ctx.rotate(p.seed + p.t * 7)
          ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7)
          break
        }
        case 'drop': {
          ctx.globalAlpha = 0.85 * a
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.4, p.size * (1 - k * 0.5)), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'dust': {
          ctx.globalAlpha = 0.2 * a
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1 + k * 1.7), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'splat': {
          ctx.globalAlpha = 0.8 * (1 - k * k)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(
            p.x,
            p.y,
            p.size * (1 + k * 0.9) + jit(p.seed, time, 0.6),
            p.size * 0.62 * (1 + k * 0.7),
            p.seed,
            0,
            Math.PI * 2,
          )
          ctx.fill()
          break
        }
        case 'graphite': {
          ctx.globalAlpha = 0.7 * a
          ctx.fillStyle = p.color
          ctx.fillRect(p.x, p.y, p.size, p.size)
          break
        }
      }
      ctx.restore()
    }
  }

  /** the Observer's pen, drawing its circle live — over the world */
  drawNibs(ctx: CanvasRenderingContext2D, time: number): void {
    for (const n of this.nibs) {
      const k = n.t / n.dur
      const sweep = Math.min(1, k / 0.72)
      const strike = Math.max(0, (k - 0.76) / 0.24)
      ctx.save()
      ctx.strokeStyle = GRAPHITE
      ctx.fillStyle = GRAPHITE
      ctx.lineWidth = 1.7
      ctx.lineCap = 'round'
      // the circle, drawn progressively (matches the permanent mark)
      const a = sweep * CIRCLE_SWEEP
      ctx.beginPath()
      ctx.arc(n.cx + jit(n.seed, time, 1.4), n.cy + jit(n.seed + 1, time, 1.4), 0.01, 0, 0.01)
      const STEPS = 26
      for (let i = 0; i <= STEPS; i++) {
        const aa = (a * i) / STEPS
        const px = n.cx + Math.cos(aa) * n.rx + jit(n.seed + i * 3, time, 1.6)
        const py = n.cy + Math.sin(aa) * n.ry + jit(n.seed + i * 3 + 1, time, 1.6)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.globalAlpha = 0.72
      ctx.stroke()
      // the strike-through, after the circle closes
      if (strike > 0) {
        const x1 = n.cx - n.rx - 4
        const y1 = n.cy + n.ry * 0.85
        const x2 = n.cx + n.rx + 2
        const y2 = n.cy - n.ry * 1.05
        ctx.globalAlpha = 0.75
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x1 + (x2 - x1) * strike, y1 + (y2 - y1) * strike)
        ctx.stroke()
      }
      // the pen itself: a short shaft + tip at the current point
      if (strike <= 0) {
        const tipX = n.cx + Math.cos(a) * n.rx
        const tipY = n.cy + Math.sin(a) * n.ry
        ctx.globalAlpha = 0.85
        ctx.strokeStyle = '#4a4458'
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX + 9, tipY - 13)
        ctx.stroke()
        ctx.fillStyle = '#4a4458'
        ctx.beginPath()
        ctx.arc(tipX, tipY, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
}
