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
import type { PlatformRT, RuleId } from '../core/types'
import { TOKEN_R, VIEW_H, VIEW_W } from '../core/types'
import { RULES } from '../core/rules'
import {
  AMBER,
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
    this.checkpoint(ctx, eng)
    this.trail(ctx, eng)
    this.player(ctx, eng)
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

  // ---- exit door ---------------------------------------------------------
  private exitDoor(ctx: CanvasRenderingContext2D, eng: GameEngine): void {
    const e = eng.exitRect
    const time = eng.time
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2)
    ctx.save()
    // hatched glow halo
    for (let i = 2; i >= 0; i--) {
      ctx.globalAlpha = (0.08 + 0.07 * pulse) * (1 - i * 0.22)
      ctx.strokeStyle = '#b6452c'
      ctx.lineWidth = 2
      wobblyRect(ctx, e.x - 6 - i * 7, e.y - 6 - i * 7, e.w + 12 + i * 14, e.h + 12 + i * 14, 21 + i, time, 1.5)
    }
    ctx.restore()
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
    handText(ctx, 'OUT?', e.x + e.w / 2, e.y - 12, 15, {
      align: 'center',
      seed: 30,
      time,
      alpha: 0.85,
    })
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
    // subtle erased counter
    if (eng.stats.erased > 0) {
      handText(ctx, `erased ×${eng.stats.erased}`, 30, 98, 10, { alpha: 0.45, seed: 102, time })
    }
    // room tag
    handText(ctx, `room ${eng.roomIndex + 1} — ${eng.roomDef.name}`, 34, 566, 12, {
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
      handText(ctx, n.text, 930, ny, 13, {
        align: 'right',
        color: n.color,
        alpha: 0.85 * a,
        rot: n.rot,
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
      'A/D move · SPACE jump · 1–5 select · ENTER keep · R restart · ESC pause · M mute'
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
