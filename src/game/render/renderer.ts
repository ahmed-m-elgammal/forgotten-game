// ============================================================
// renderer.ts — draws the notebook world from engine state.
// ------------------------------------------------------------
// WHY a separate reader: the engine never touches a canvas and
// the renderer never mutates game state — one-way data flow.
// Art direction: warm paper, boiling ink lines, absence shown
// as eraser smudges / scribbles / dashed ghosts, and AMBER as
// the single "about to be forgotten" warning color.
// ============================================================
import type { GameEngine } from '../core/engine'
import type { PlankRT, PlatformRT, RuleId } from '../core/types'
import { INK_COLORS, INK_MAX, TOKEN_R, VIEW_H, VIEW_W } from '../core/types'
import { RULES } from '../core/rules'
import {
  AMBER,
  GRAPHITE,
  HAND_FONT,
  INK,
  PAPER,
  PAPER_DARK,
  clipGlyph,
  countdownScribble,
  dashRect,
  handText,
  hatchRect,
  jit,
  makeGrainTile,
  reducedMotion,
  roundedRectPath,
  sRand,
  scribbleOver,
  wobblyLine,
  wobblyRect,
  wobblyRectPath,
} from './paper'

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/** eraser smudges — forgotten things are shown as ABSENCE */
function smudges(ctx: CanvasRenderingContext2D, p: PlatformRT, time: number): void {
  ctx.save()
  ctx.strokeStyle = '#f2e9d3'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const y = p.y + 4 + (i * (p.h - 8)) / 2
    wobblyLine(ctx, p.x + 5, y, p.x + p.w - 5, y + 2, 30 + i, time, 1.5)
  }
  ctx.restore()
}

export class Renderer {
  private grain: HTMLCanvasElement | null = null

  /** build the pre-rendered grain tile (client only) */
  init(): void {
    if (typeof document !== 'undefined') {
      this.grain = makeGrainTile()
    }
  }

  draw(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    ctx.save()
    // restrained screen shake — rule changes and respawns only
    if (eng.shakeT > 0 && eng.shakeDur > 0 && !reducedMotion()) {
      const k = eng.shakeT / eng.shakeDur
      const a = eng.shakeMag * k
      ctx.translate((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a)
    }

    this.paper(ctx, eng)

    // which platforms are currently telegraphed (warned)
    const warnMap = new Map<string, RuleId>()
    for (const rt of eng.rules.values()) {
      if (rt.phase === 'warned') {
        for (const t of rt.targets) warnMap.set(t, rt.id)
      }
    }

    this.exitDoor(ctx, eng)
    this.platforms(ctx, eng, warnMap)
    this.inkBottles(ctx, eng)
    this.planks(ctx, eng)
    this.tearShreds(ctx, eng)
    this.checkpoint(ctx, eng)
    this.trail(ctx, eng)
    this.skids(ctx, eng)
    this.player(ctx, eng)
    this.sketchOverlay(ctx, eng)
    this.ambients(ctx, eng)
    this.tokens(ctx, eng)
    this.hud(ctx, eng)
    this.notes(ctx, eng)
    this.vignette(ctx, eng)
    this.transitions(ctx, eng)
    this.hintBar(ctx, eng)
    ctx.restore()
  }

  // ---- paper, ruled lines, margin ------------------------------------
  private paper(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    // slow drifting grain
    if (this.grain) {
      const g = this.grain
      const t = eng.time * 3
      ctx.globalAlpha = 0.5
      const ox = -(t % g.width)
      const oy = -((t * 0.6) % g.height)
      for (let x = ox; x < VIEW_W; x += g.width) {
        for (let y = oy; y < VIEW_H; y += g.height) {
          ctx.drawImage(g, x, y)
        }
      }
      ctx.globalAlpha = 1
    }
    // very subtle ruled-line hint
    ctx.strokeStyle = 'rgba(43,38,32,0.05)'
    ctx.lineWidth = 1
    for (let y = 64; y < VIEW_H; y += 34) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(VIEW_W, y)
      ctx.stroke()
    }
    // the notebook margin (double line, left edge)
    ctx.strokeStyle = 'rgba(178,73,44,0.25)'
    ctx.beginPath()
    ctx.moveTo(22, 0)
    ctx.lineTo(22, VIEW_H)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(178,73,44,0.12)'
    ctx.beginPath()
    ctx.moveTo(26, 0)
    ctx.lineTo(26, VIEW_H)
    ctx.stroke()
  }

  // ---- platforms -------------------------------------------------------
  private platforms(
    ctx: CanvasRenderingContext2D,
    eng: GameEngine,
    warnMap: Map<string, RuleId>,
  ): void {
    const time = eng.time
    const gripRT = eng.rules.get('grip')
    const gripGone = !!gripRT && gripRT.phase === 'forgotten'
    for (const p of eng.platforms) {
      if (p.drift) {
        // THE GROUND forgot this one: ghost of where it just was
        ctx.save()
        ctx.globalAlpha = 0.3
        dashRect(ctx, p.prevX, p.prevY, p.w, p.h, 11, time, INK, 0.5)
        ctx.restore()
      }
      if (p.ghost) {
        // SOLIDITY forgot this one: dashed outline + eraser smudges
        dashRect(ctx, p.x, p.y, p.w, p.h, 3, time, INK, 0.55)
        smudges(ctx, p, time)
        continue
      }
      // solid slab
      ctx.fillStyle = PAPER_DARK
      wobblyRectPath(ctx, p.x, p.y, p.w, p.h, 5, time, 1.2)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2.2
      wobblyRect(ctx, p.x, p.y, p.w, p.h, 5, time, 1.2)

      // THE GRIP forgotten: pale hatched shine streaks — the page is ice
      if (gripGone) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 2
        const nShine = p.w > 200 ? 3 : 2
        for (let i = 0; i < nShine; i++) {
          const sx = p.x + 10 + sRand(i * 13.7 + p.x) * Math.max(10, p.w - 70)
          const sw = 22 + sRand(i * 7.9 + p.y) * 30
          wobblyLine(ctx, sx, p.y + 4, sx + sw, p.y + 4.5, 40 + i, time, 0.9)
        }
        ctx.restore()
      }

      // amber hatch + countdown while this platform is telegraphed
      const wr = warnMap.get(p.id)
      if (wr) {
        const rt = eng.rules.get(wr)
        if (rt) {
          const flick = 0.5 + 0.5 * Math.sin(time * 18)
          hatchRect(ctx, p.x - 3, p.y - 3, p.w + 6, p.h + 6, AMBER, 0.2 + 0.2 * flick, 9, 7, time)
          countdownScribble(
            ctx,
            p.x + p.w / 2,
            p.y - 26,
            rt.timer / eng.warnDur,
            rt.timer,
            AMBER,
            9,
            time,
          )
        }
      }

      // paper clip on ledges protected by a pinned rule
      if (p.kind !== 'floor') {
        let protect: RuleId | null = null
        for (const [id, rt] of eng.rules) {
          if (rt.pinUntil > time && (id === 'collision' || id === 'platforms')) protect = id
        }
        if (protect) clipGlyph(ctx, p.x + p.w - 10, p.y + 10, 14, RULES[protect].color, time)
      }
    }
  }

  // ---- ink bottles (RE-INKING pickups) -----------------------------------
  private inkBottles(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    for (const d of eng.inkDrops) {
      if (d.taken) continue
      const bob = reducedMotion() ? 0 : Math.sin(time * 2 + d.at.x * 0.05) * 2
      const x = d.at.x
      const y = d.at.y + bob
      const wet = INK_COLORS[d.color].body // the ink this bottle holds
      // soft attention ring, tinted to match
      ctx.save()
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(time * 2.4 + d.at.x)
      ctx.strokeStyle = d.color === 'black' ? INK : wet
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, y, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      // little bottle: body, neck, cork, wet ink level (tinted)
      ctx.save()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      wobblyRect(ctx, x - 6, y - 3, 12, 11, 77, time, 0.7)
      wobblyLine(ctx, x - 3, y - 3, x - 3, y - 8, 78, time, 0.4)
      wobblyLine(ctx, x + 3, y - 3, x + 3, y - 8, 79, time, 0.4)
      wobblyLine(ctx, x - 4.5, y - 8, x + 4.5, y - 8, 80, time, 0.4)
      ctx.fillStyle = wet
      wobblyRectPath(ctx, x - 4, y + 2, 8, 5, 81, time, 0.5)
      ctx.fill()
      ctx.restore()
    }
  }

  // ---- sketched planks: fresh glossy ink → dries → blinks → fades ------
  // v1.1: color by ink (black/red/blue), the stranger's line in
  // graphite with a wobblier hand, red squash on bounce, blue crack
  // marks as it wears, and the Observer's graphite circle+strike on
  // planks it has uncircled.
  private planks(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    for (const pl of eng.planks) {
      const age = time - pl.born
      const left = pl.life - age
      const dry = Math.max(0, Math.min(1, age / pl.life)) // 0 wet → 1 dry
      const blinking = left < 2
      const brittleWear = pl.color === 'blue' && !pl.stranger ? pl.contact / 2.2 : 0
      const identity = pl.stranger
        ? { body: '#585064', line: GRAPHITE }
        : { body: INK_COLORS[pl.color].body, line: INK_COLORS[pl.color].line }
      ctx.save()
      // red squash-and-stretch around the plank's center
      if (pl.squash > 0) {
        const s = pl.squash
        const cx = pl.x + pl.w / 2
        const cy = pl.y + pl.h / 2
        ctx.translate(cx, cy)
        ctx.scale(1 + 0.35 * s, 1 - 0.55 * s)
        ctx.translate(-cx, -cy)
      }
      ctx.globalAlpha = blinking ? 0.55 + 0.45 * Math.sin(time * 12) : 1
      // wet ink body — lightens as it dries
      ctx.fillStyle = identity.body
      ctx.globalAlpha *= 1 - dry * 0.5
      wobblyRectPath(ctx, pl.x, pl.y, pl.w, pl.h, 4, time, pl.stranger ? 1.6 : 1)
      ctx.fill()
      // hand-drawn double line along the top edge (the "drawn" look)
      ctx.globalAlpha = blinking ? 0.55 + 0.45 * Math.sin(time * 12) : 1
      ctx.strokeStyle = identity.line
      ctx.lineWidth = 2
      wobblyLine(ctx, pl.x + 2, pl.y + 3.5, pl.x + pl.w - 2, pl.y + 3, 45, time, pl.stranger ? 1.5 : 0.9)
      ctx.lineWidth = 1.2
      wobblyLine(ctx, pl.x + 2, pl.y + 8.5, pl.x + pl.w - 2, pl.y + 9, 46, time, pl.stranger ? 1.5 : 0.9)
      // blue wear: little crack strokes as it approaches the tear
      if (brittleWear > 0.35) {
        ctx.strokeStyle = 'rgba(20,30,45,0.75)'
        ctx.lineWidth = 1.2
        const nCracks = brittleWear > 0.7 ? 3 : 2
        for (let i = 0; i < nCracks; i++) {
          const cxp = pl.x + pl.w * (0.2 + 0.3 * i) + jit(300 + i, time, 3)
          wobblyLine(ctx, cxp, pl.y + 1, cxp + 5, pl.y + pl.h - 1, 310 + i, time, 0.8)
        }
      }
      // final 2s: dashed outline says "about to go"
      if (blinking) {
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1.4
        ctx.strokeStyle = 'rgba(43,38,32,0.6)'
        ctx.strokeRect(pl.x - 2, pl.y - 2, pl.w + 4, pl.h + 4)
        ctx.setLineDash([])
      }
      ctx.restore()
      // the Observer's mark: a graphite circle struck through, drawn
      // OUTSIDE the squash transform so it reads as added ON TOP
      if (pl.uncircled) {
        ctx.save()
        ctx.strokeStyle = GRAPHITE
        ctx.globalAlpha = 0.75 + 0.1 * Math.sin(time * 3)
        ctx.lineWidth = 1.6
        const cx = pl.x + pl.w / 2
        const cy = pl.y + pl.h / 2
        const rx = pl.w / 2 + 9
        ctx.beginPath()
        for (let a = 0; a <= Math.PI * 2.05; a += Math.PI / 9) {
          const px = cx + Math.cos(a) * rx + jit(410, time, 2.2)
          const py = cy + Math.sin(a) * 13 + jit(411, time, 2.2)
          if (a === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
        wobblyLine(ctx, cx - rx - 4, cy + 10, cx + rx + 2, cy - 12, 412, time, 1.2)
        ctx.restore()
      }
    }
  }

  /** paper shreds where a blue plank tore (0.5s of flutter) */
  private tearShreds(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    for (const s of eng.tears) {
      const age = (time - s.t) / 0.5
      if (age < 0 || age > 1) continue
      ctx.save()
      ctx.globalAlpha = 0.85 * (1 - age)
      ctx.fillStyle = '#39628f'
      ctx.strokeStyle = '#2d4f75'
      ctx.lineWidth = 0.8
      for (let i = 0; i < 3; i++) {
        const dx = (sRand(s.seed + i) - 0.5) * 26 * age + jit(s.seed + i, time, 1.5)
        const dy = -6 * age + 22 * age * age + i * 2.2
        ctx.translate(0, 0)
        ctx.fillRect(s.x + dx, s.y + dy, 3.2, 2.2)
        ctx.strokeRect(s.x + dx, s.y + dy, 3.2, 2.2)
      }
      ctx.restore()
    }
  }

  // ---- exit door (state-aware: THE NAMING) --------------------------------
  /** the OUT? word-tag: paper chip + handwriting + wavy underline */
  private drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    rot: number,
    alpha: number,
  ): void {
    ctx.save()
    ctx.translate(x + 28, y + 10)
    ctx.rotate(rot)
    ctx.fillStyle = 'rgba(245,236,217,0.95)'
    roundedRectPath(ctx, -28, -10, 56, 20, 5)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.6
    roundedRectPath(ctx, -28, -10, 56, 20, 5)
    ctx.stroke()
    handText(ctx, 'OUT?', 0, -1, 13, { align: 'center', seed: 31, time, alpha })
    // wavy baseline under the word
    wobblyLine(ctx, -16, 5.5, 16, 5.5, 33, time, 0.7)
    ctx.restore()
  }

  private exitDoor(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const e = eng.exitRect
    const time = eng.time
    const namingRT = eng.rules.get('naming')
    const namingWarned = !!namingRT && namingRT.phase === 'warned'
    const namingGone = eng.namingLost
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2)
    if (!namingGone) {
      ctx.save()
      // hatched glow halo
      for (let i = 2; i >= 0; i--) {
        ctx.globalAlpha = (0.08 + 0.07 * pulse) * (1 - i * 0.22)
        ctx.strokeStyle = '#b6452c'
        ctx.lineWidth = 2
        wobblyRect(ctx, e.x - 6 - i * 7, e.y - 6 - i * 7, e.w + 12 + i * 14, e.h + 12 + i * 14, 21 + i, time, 1.5)
      }
      ctx.restore()
    }
    if (namingGone) {
      // the door forgot what it is: faint dashed blank outline + "?"
      ctx.save()
      dashRect(ctx, e.x, e.y, e.w, e.h, 20, time, 'rgba(43,38,32,0.45)', 0.7)
      handText(ctx, '?', e.x + e.w / 2, e.y + e.h / 2 + 10, 30, {
        align: 'center',
        alpha: 0.5 + 0.15 * Math.sin(time * 3),
        seed: 34,
        time,
      })
      ctx.restore()
    } else {
      // door
      ctx.fillStyle = 'rgba(231,217,184,0.85)'
      wobblyRectPath(ctx, e.x, e.y, e.w, e.h, 20, time, 1.4)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2.6
      wobblyRect(ctx, e.x, e.y, e.w, e.h, 20, time, 1.4)
      ctx.lineWidth = 1.6
      wobblyRect(ctx, e.x + 10, e.y + 12, e.w - 20, e.h - 26, 24, time, 1)
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(e.x + e.w - 14, e.y + e.h * 0.55, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // the label: attached / jittering / adrift
    if (namingGone) {
      // faint dotted tether so the word still reads as the door's
      ctx.save()
      ctx.strokeStyle = RULES.naming.color
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1.4
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.moveTo(e.x + e.w / 2, e.y + 8)
      ctx.lineTo(eng.labelRect.x + eng.labelRect.w / 2, eng.labelRect.y + eng.labelRect.h / 2)
      ctx.stroke()
      ctx.restore()
      const wob = reducedMotion() ? 0 : Math.sin(time * 1.9) * 0.06
      this.drawLabel(ctx, eng.labelRect.x, eng.labelRect.y, time, wob, 0.95)
    } else if (namingWarned) {
      // jitters toward the door edge — the name is slipping
      const jx = reducedMotion() ? 0 : Math.sin(time * 17) * 3
      const jy = reducedMotion() ? 0 : Math.abs(Math.sin(time * 23)) * 3
      this.drawLabel(ctx, e.x + e.w / 2 - 28 + jx, e.y - 30 + jy, time, 0.05, 0.9)
    } else {
      this.drawLabel(ctx, e.x + e.w / 2 - 28, e.y - 30, time, 0, 0.85)
    }
  }

  // ---- checkpoint (ink anchor knot) ---------------------------------------
  private checkpoint(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const c = eng.checkpoint
    const time = eng.time
    const col = c.active ? '#a2611c' : 'rgba(43,38,32,0.55)'
    ctx.save()
    if (c.active) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3)
      ctx.globalAlpha = 0.25 + 0.2 * pulse
      ctx.strokeStyle = '#c98a2d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(c.x, c.y - 16, 20 + 3 * pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = col
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    // shank + ring + flukes
    wobblyLine(ctx, c.x, c.y - 30, c.x, c.y - 8, 41, time, 0.7)
    ctx.beginPath()
    ctx.arc(c.x, c.y - 33, 5.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(c.x - 10, c.y - 14)
    ctx.quadraticCurveTo(c.x, c.y - 2, c.x + 10, c.y - 14)
    ctx.stroke()
    if (c.active) {
      // the knot ties itself
      const k = Math.min(1, (time - c.activatedAt) / 0.7)
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -time * 30
      ctx.beginPath()
      ctx.arc(c.x, c.y - 16, 13, 0, Math.PI * 2 * k)
      ctx.stroke()
      ctx.setLineDash([])
      handText(ctx, 'anchored', c.x, c.y + 16, 10, {
        align: 'center',
        color: '#a2611c',
        alpha: 0.8,
        seed: 44,
        time,
      })
    } else {
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.arc(c.x, c.y - 16, 11, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      handText(ctx, 'anchor', c.x, c.y + 16, 10, { align: 'center', alpha: 0.5, seed: 44, time })
    }
    ctx.restore()
  }

  // ---- character -------------------------------------------------------------
  private trail(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    if (reducedMotion()) return
    const time = eng.time
    for (const d of eng.player.trail) {
      const age = time - d.t
      const a = Math.max(0, 1 - age / 1.2) * 0.22
      ctx.fillStyle = INK
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.arc(d.x + jit(d.x, time, 1), d.y + jit(d.y, time, 1), 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** icy skid streaks left behind while sliding (THE GRIP) */
  private skids(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    if (reducedMotion()) return
    const time = eng.time
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (const s of eng.skids) {
      const age = time - s.t
      const a = Math.max(0, 1 - age / 0.5) * 0.7
      ctx.globalAlpha = a
      wobblyLine(ctx, s.x - 7, s.y, s.x + 7, s.y - 1, 55 + Math.floor(s.t * 10), time, 0.6)
    }
    ctx.restore()
  }

  private player(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const p = eng.player
    const time = eng.time
    const cx = p.x + p.w / 2
    const bottom = p.y + p.h
    // squash & stretch + idle breathing
    let sx = 1
    let sy = 1
    if (p.landTimer > 0) {
      const k = p.landTimer / 0.14
      sy = 1 - 0.2 * k
      sx = 1 + 0.16 * k
    } else if (!p.grounded && p.vy < -140) {
      sy = 1.16
      sx = 0.88
    } else if (p.grounded && Math.abs(p.vx) < 10) {
      sy = 1 + Math.sin(time * 2.6) * 0.02
    }
    ctx.save()
    ctx.translate(cx, bottom)
    ctx.scale(sx, sy)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    const seed = 71
    // stubby legs with a walk swing
    const moving = Math.abs(p.vx) > 20
    const swing = p.grounded ? (moving ? Math.sin(p.walkPhase) * 4 : 0) : 2.5
    wobblyLine(ctx, -3, -9, -3 + swing, 0, seed, time, 0.5)
    wobblyLine(ctx, 3, -9, 3 - swing, 0, seed + 1, time, 0.5)
    // body
    wobblyLine(ctx, 0, -9, 0, -19, seed + 2, time, 0.5)
    // little arms when airborne
    if (!p.grounded) {
      wobblyLine(ctx, 0, -16, -5, -21, seed + 6, time, 0.5)
      wobblyLine(ctx, 0, -16, 5, -21, seed + 7, time, 0.5)
    }
    // round head (paper-filled so the eyes read)
    ctx.fillStyle = PAPER
    ctx.beginPath()
    ctx.arc(p.facing * 1.2, -25, 7.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // dot eyes, looking where it walks
    ctx.fillStyle = INK
    const ex = p.facing * 1.2 + p.facing * 0.8
    ctx.beginPath()
    ctx.arc(ex - 2.2, -26, 1.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex + 2.2, -26, 1.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ---- sketch overlay: live stroke + keyboard ghost plank -----------------
  private sketchOverlay(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    if (eng.drag) {
      const d = eng.drag
      // the stroke is drawn in the ink it will spend (oldest swallow)
      const nextInk = eng.inkCharges[0] ?? 'black'
      const inkCol = nextInk === 'black' ? INK : INK_COLORS[nextInk].body
      ctx.save()
      // the live stroke
      ctx.strokeStyle = inkCol
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.75
      wobblyLine(ctx, d.x0, d.y0, d.x1, d.y1, 171, time, 1)
      ctx.fillStyle = inkCol
      ctx.beginPath()
      ctx.arc(d.x0, d.y0, 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(d.x1, d.y1, 2.4, 0, Math.PI * 2)
      ctx.fill()
      // where the plank will actually land (clamped/walkable)
      const r = eng.strokeToPlankRect(d.x0, d.y0, d.x1, d.y1)
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.4
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = inkCol
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      ctx.restore()
    } else if (eng.sketchMode) {
      const r = eng.ghostPlankRect()
      const p = eng.player
      ctx.save()
      // dotted anchor from the character's pen hand
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.35
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(p.x + p.w / 2, p.y + p.h / 2)
      ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2)
      ctx.stroke()
      ctx.setLineDash([])
      // the ghost plank itself
      ctx.globalAlpha = 0.5 + 0.12 * Math.sin(time * 5)
      ctx.fillStyle = 'rgba(28,24,19,0.35)'
      wobblyRectPath(ctx, r.x, r.y, r.w, r.h, 4, time, 1)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.6
      ctx.setLineDash([6, 4])
      wobblyRect(ctx, r.x, r.y, r.w, r.h, 47, time, 1)
      ctx.setLineDash([])
      ctx.restore()
    }
  }

  // ---- per-rule ambient & warning FX around the world -------------------------
  private drawSwapLabels(
    ctx: CanvasRenderingContext2D,
    eng: GameEngine,
    preview: boolean,
  ): void {
    const time = eng.time
    const strike = !preview // forgotten: labels swapped AND struck through
    const leftLabel = strike ? 'RIGHT' : 'LEFT'
    const rightLabel = strike ? 'LEFT' : 'RIGHT'
    const col = RULES.direction.color
    const flick = preview
      ? 0.4 + 0.3 * Math.sin(time * 14)
      : 0.85 + 0.15 * Math.sin(time * 6)
    handText(ctx, leftLabel, 120, 300, 40, { align: 'center', color: col, alpha: flick, seed: 91, time, rot: -0.04 })
    handText(ctx, rightLabel, 840, 300, 40, { align: 'center', color: col, alpha: flick, seed: 92, time, rot: 0.04 })
    if (strike) {
      ctx.strokeStyle = col
      ctx.lineWidth = 3
      wobblyLine(ctx, 68, 290, 172, 296, 93, time, 1.5)
      wobblyLine(ctx, 788, 296, 892, 290, 94, time, 1.5)
      handText(ctx, 'your ← sends you this way →', 480, 356, 14, {
        align: 'center',
        color: col,
        alpha: 0.8,
        seed: 95,
        time,
      })
      handText(ctx, '← and this way ←', 480, 378, 14, {
        align: 'center',
        color: col,
        alpha: 0.8,
        seed: 96,
        time,
      })
    }
  }

  private ambients(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const p = eng.player
    const time = eng.time
    const cx = p.x + p.w / 2
    for (const [id, rt] of eng.rules) {
      const def = RULES[id]
      if (rt.phase === 'warned') {
        const frac = rt.timer / eng.warnDur
        if (id === 'gravity' || id === 'jump') {
          // ring around the character + countdown scribble
          ctx.save()
          ctx.strokeStyle = AMBER
          ctx.globalAlpha = 0.5 + 0.35 * Math.sin(time * 16)
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(cx, p.y + p.h / 2, 30, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
          countdownScribble(ctx, cx, p.y - 34, frac, rt.timer, AMBER, 61, time)
        } else if (id === 'direction') {
          // preview bands on both edges + fading labels
          const a = 0.24 + 0.18 * Math.sin(time * 14)
          hatchRect(ctx, 0, 0, 26, VIEW_H, AMBER, a, 8, 63, time)
          hatchRect(ctx, VIEW_W - 26, 0, 26, VIEW_H, AMBER, a, 8, 64, time)
          this.drawSwapLabels(ctx, eng, true)
        } else if (id === 'grip') {
          // hatch the ground under the player's feet in the rule color
          const groundY = p.y + p.h
          const a = 0.28 + 0.18 * Math.sin(time * 14)
          hatchRect(ctx, cx - 44, groundY - 3, 88, 12, def.color, a, 7, 65, time)
          countdownScribble(ctx, cx, groundY + 30, frac, rt.timer, def.color, 66, time)
        } else if (id === 'naming') {
          // hatch the door itself in rose — the name is coming off
          const a = 0.26 + 0.18 * Math.sin(time * 14)
          hatchRect(ctx, eng.exitRect.x - 5, eng.exitRect.y - 5, eng.exitRect.w + 10, eng.exitRect.h + 10, def.color, a, 8, 67, time)
          countdownScribble(ctx, eng.exitRect.x + eng.exitRect.w / 2, eng.exitRect.y - 44, frac, rt.timer, def.color, 68, time)
        }
      } else if (rt.phase === 'forgotten') {
        if (id === 'gravity') {
          // floaty specks — the world got soft
          ctx.save()
          ctx.fillStyle = def.color
          for (let i = 0; i < 6; i++) {
            const a = time * 1.4 + i * 1.05
            const r = 26 + 8 * Math.sin(time * 2 + i)
            ctx.globalAlpha = 0.5
            ctx.beginPath()
            ctx.arc(cx + Math.cos(a) * r, p.y + p.h / 2 + Math.sin(a) * r * 0.7, 1.8, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        } else if (id === 'jump') {
          // a drooping spring over the head
          ctx.save()
          ctx.strokeStyle = def.color
          ctx.lineWidth = 2
          ctx.globalAlpha = 0.8
          wobblyLine(ctx, cx - 8, p.y - 16, cx + 8, p.y - 12, 81, time, 0.8)
          wobblyLine(ctx, cx - 8, p.y - 10, cx + 8, p.y - 6, 82, time, 0.8)
          ctx.restore()
        } else if (id === 'direction') {
          const a = 0.3
          hatchRect(ctx, 0, 0, 30, VIEW_H, def.color, a, 8, 63, time)
          hatchRect(ctx, VIEW_W - 30, 0, 30, VIEW_H, def.color, a, 8, 64, time)
          this.drawSwapLabels(ctx, eng, false)
        }
        // grip-forgotten ice shine is drawn on the platforms themselves;
        // naming-forgotten door/label states live in exitDoor().
      }
    }
  }

  // ---- edge tokens ---------------------------------------------------------------
  private tokens(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    for (let i = 0; i < eng.activeOrder.length; i++) {
      const id = eng.activeOrder[i]
      const def = RULES[id]
      const rt = eng.rules.get(id)
      if (!rt) continue
      const pos = eng.tokenPos(i)
      const x = pos.x
      const y = pos.y
      const selected = i === eng.selectedIdx
      const hovered = i === eng.hoverToken
      const breathe = 1 + 0.02 * Math.sin(time * 2 + i * 1.7)
      const r = TOKEN_R * breathe * (hovered ? 1.06 : 1)
      ctx.save()
      // paper badge
      ctx.fillStyle = PAPER
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      // state ring
      if (rt.phase === 'warned') {
        const flick = 0.55 + 0.45 * Math.sin(time * 18)
        ctx.strokeStyle = AMBER
        ctx.lineWidth = 3.4
        ctx.globalAlpha = flick
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        // shrinking countdown arc
        const frac = Math.max(0, rt.timer / eng.warnDur)
        ctx.strokeStyle = def.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
        ctx.stroke()
      } else if (rt.phase === 'forgotten') {
        ctx.strokeStyle = 'rgba(43,38,32,0.4)'
        ctx.lineWidth = 2.4
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        scribbleOver(ctx, x, y, r, 50 + i, time, 'rgba(43,38,32,0.55)')
      } else {
        const pinned = rt.pinUntil > time
        ctx.strokeStyle = pinned ? '#c98a2d' : INK
        ctx.lineWidth = pinned ? 3 : 2.4
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        if (pinned) {
          const pulse = 0.35 + 0.2 * Math.sin(time * 3 + i)
          ctx.globalAlpha = pulse
          ctx.strokeStyle = '#c98a2d'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, r + 7, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
          clipGlyph(ctx, x + r * 0.75, y - r * 0.75, 15, '#c98a2d', time)
        }
      }
      // glyph (colored per rule)
      if (rt.phase !== 'forgotten') {
        ctx.save()
        ctx.strokeStyle = def.color
        ctx.fillStyle = def.color
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        def.glyph(ctx, x, y, r * 0.52, time, i * 13 + 5)
        ctx.restore()
      }
      // selection marker (rotating dashes)
      if (selected) {
        ctx.strokeStyle = INK
        ctx.lineWidth = 1.8
        ctx.setLineDash([4, 4])
        ctx.lineDashOffset = -time * 20
        ctx.beginPath()
        ctx.arc(x, y, r + 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // name + number-key hint
      handText(ctx, def.name, x, y + r + 14, 10.5, { align: 'center', alpha: 0.8, seed: 60 + i, time })
      handText(ctx, `[${i + 1}]`, x, y + r + 27, 9, { align: 'center', alpha: 0.5, seed: 66 + i, time })
      ctx.restore()
    }
  }

  // ---- HUD: charges, slots, erased counter, room tag ---------------------------
  private hud(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    handText(ctx, 'memory', 30, 34, 12, { alpha: 0.7, seed: 100, time })
    // charge pips as ink drops
    for (let i = 0; i < eng.roomDef.maxCharges; i++) {
      const x = 36 + i * 20
      const y = 52
      const filled = i < eng.charges
      ctx.strokeStyle = INK
      ctx.fillStyle = INK
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(x, y - 8)
      ctx.quadraticCurveTo(x + 6, y + 1, x, y + 7)
      ctx.quadraticCurveTo(x - 6, y + 1, x, y - 8)
      if (filled) ctx.fill()
      else ctx.stroke()
    }
    // pin slots as paper clips
    const pinned = eng.pinnedCount()
    handText(ctx, 'keeps', 30, 78, 10.5, { alpha: 0.6, seed: 101, time })
    for (let i = 0; i < eng.slots; i++) {
      clipGlyph(ctx, 96 + i * 20, 72, 14, i < pinned ? '#c98a2d' : 'rgba(43,38,32,0.4)', time)
    }
    // carried ink: bottle glyph + COLORED pips in queue order — the
    // leftmost pip is the swallow the next stroke will spend (RE-INKING)
    const ix = 36 + eng.roomDef.maxCharges * 20 + 22
    handText(ctx, 'ink', ix - 6, 34, 10.5, { alpha: 0.6, seed: 104, time })
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.6
    wobblyRect(ctx, ix, 44, 11, 11, 82, time, 0.6)
    wobblyLine(ctx, ix + 3, 44, ix + 3, 39, 83, time, 0.4)
    wobblyLine(ctx, ix + 8, 44, ix + 8, 39, 84, time, 0.4)
    for (let i = 0; i < INK_MAX; i++) {
      const c = eng.inkCharges[i]
      ctx.fillStyle = c ? (c === 'black' ? INK : INK_COLORS[c].body) : INK
      ctx.globalAlpha = c ? 0.9 : 0.22
      ctx.beginPath()
      ctx.arc(ix + 22 + i * 13, 50, 3.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // subtle erased counter
    if (eng.stats.erased > 0) {
      handText(ctx, `erased ×${eng.stats.erased}`, 30, 98, 10, { alpha: 0.45, seed: 102, time })
    }
    // endless: bookmarks — three little ribbons, spent ones hollow
    if (eng.mode === 'endless') {
      handText(ctx, 'bookmarks', 30, 118, 10, { alpha: 0.55, seed: 106, time })
      for (let i = 0; i < 3; i++) {
        const bx = 38 + i * 15
        const by = 126
        const live = i < eng.bookmarks
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + 8, by)
        ctx.lineTo(bx + 8, by + 13)
        ctx.lineTo(bx + 4, by + 9.5)
        ctx.lineTo(bx, by + 13)
        ctx.closePath()
        if (live) {
          ctx.fillStyle = '#b6452c'
          ctx.globalAlpha = 0.85
          ctx.fill()
        } else {
          ctx.strokeStyle = 'rgba(43,38,32,0.35)'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
    }
    // room tag — endless pages continue the campaign count
    const tagLabel = eng.mode === 'endless' ? 'page' : 'room'
    handText(ctx, `${tagLabel} ${eng.roomIndex + 1} — ${eng.roomDef.name}`, 34, 566, 12, {
      alpha: 0.6,
      seed: 103,
      time,
    })
  }

  // ---- margin notes ---------------------------------------------------------------
  private notes(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    // big centered note (onboarding / urgent hints)
    const big = eng.bigNote
    if (big) {
      let a = 1
      if (big.t < 0.15) a = big.t / 0.15
      else if (big.t > big.dur - 0.4) a = Math.max(0, (big.dur - big.t) / 0.4)
      ctx.save()
      ctx.globalAlpha = 0.94 * a
      ctx.font = `17px ${HAND_FONT}`
      const w = ctx.measureText(big.text).width + 36
      ctx.translate(480, 128)
      ctx.rotate(big.rot)
      ctx.fillStyle = 'rgba(245,236,217,0.94)'
      roundedRectPath(ctx, -w / 2, -16, w, 32, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(43,38,32,0.5)'
      ctx.lineWidth = 1.5
      roundedRectPath(ctx, -w / 2, -16, w, 32, 8)
      ctx.stroke()
      handText(ctx, big.text, 0, 6, 17, { align: 'center', color: big.color, seed: 120, time })
      ctx.restore()
    }
    // small margin-note stack, top right
    let ny = 34
    for (const n of eng.notes) {
      let a = 1
      if (n.t < 0.12) a = n.t / 0.12
      else if (n.t > n.dur - 0.35) a = Math.max(0, (n.dur - n.t) / 0.35)
      // the Observer's handwriting wobbles as it dries (v1.1)
      const shakyRot = n.shaky ? Math.sin(time * 9 + n.id) * 0.012 : 0
      const shakyA = n.shaky ? 0.78 + 0.12 * Math.sin(time * 13 + n.id * 2) : 1
      handText(ctx, n.text, 930, ny, 13, {
        align: 'right',
        color: n.color,
        alpha: 0.85 * a * shakyA,
        rot: n.rot + shakyRot,
        seed: n.id * 7,
        time,
      })
      ny += 24
    }
  }

  // ---- vignette pulse in the warned rule's color -----------------------------------
  private vignette(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    let warned: RuleId | null = null
    for (const rt of eng.rules.values()) {
      if (rt.phase === 'warned') {
        warned = rt.id
        break
      }
    }
    if (!warned) return
    const col = RULES[warned].color
    const a = reducedMotion() ? 0.07 : 0.09 + 0.05 * Math.sin(eng.time * 6)
    const g = ctx.createRadialGradient(480, 300, 260, 480, 300, 640)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, hexToRgba(col, Math.max(0, a)))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  // ---- page transitions ---------------------------------------------------------------
  private transitions(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const time = eng.time
    if (eng.status === 'dead') {
      // a page lifts from the right and sweeps across
      const k = Math.min(1, eng.transitionT / eng.transitionDur)
      const foldX = VIEW_W + 120 - (VIEW_W + 240) * easeInOut(k)
      ctx.fillStyle = 'rgba(245,236,217,0.97)'
      ctx.beginPath()
      ctx.moveTo(foldX, 0)
      ctx.lineTo(VIEW_W, 0)
      ctx.lineTo(VIEW_W, VIEW_H)
      ctx.lineTo(foldX, VIEW_H)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(43,38,32,0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(foldX, 0)
      ctx.quadraticCurveTo(foldX - 14, VIEW_H / 2, foldX, VIEW_H)
      ctx.stroke()
      const ta = Math.max(0, Math.min(1, (k - 0.35) / 0.3))
      handText(ctx, 'erased.', 480, 300, 34, {
        align: 'center',
        alpha: ta,
        seed: 140,
        time,
        rot: -0.03,
      })
    } else if (eng.status === 'roomclear') {
      const k = eng.transitionT / eng.transitionDur
      if (k < 0.5) {
        // covering sweep from the left
        const cov = easeInOut(k / 0.5) * VIEW_W
        ctx.fillStyle = 'rgba(245,236,217,0.97)'
        ctx.fillRect(0, 0, cov, VIEW_H)
        ctx.strokeStyle = 'rgba(43,38,32,0.45)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cov, 0)
        ctx.lineTo(cov, VIEW_H)
        ctx.stroke()
        handText(ctx, 'page turned.', cov / 2, 300, 24, { align: 'center', alpha: 0.8, seed: 141, time })
      } else {
        // revealing the fresh page
        const rev = easeInOut((k - 0.5) / 0.5) * VIEW_W
        ctx.fillStyle = 'rgba(245,236,217,0.97)'
        ctx.fillRect(rev, 0, VIEW_W - rev, VIEW_H)
      }
    }
  }

  private hintBar(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const text =
      'A/D move · SPACE jump · 1–7 select · ENTER keep · C sketch · R restart · ESC pause · M mute'
    // paper pill so the hint stays legible over the floor slabs
    ctx.save()
    ctx.font = `11px ${HAND_FONT}`
    const w = ctx.measureText(text).width + 24
    ctx.fillStyle = 'rgba(245,236,217,0.85)'
    roundedRectPath(ctx, 480 - w / 2, 576, w, 18, 7)
    ctx.fill()
    ctx.restore()
    handText(ctx, text, 480, 589, 11, { align: 'center', alpha: 0.6, seed: 150, time: eng.time })
  }
}
