// ============================================================
// rules.ts — the RULES registry: the heart of the game.
// ------------------------------------------------------------
// Each rule = identity (name, tagline, color, glyph) + a concrete
// distortion (apply/undo) + fair-warning copy. Adding a rule means
// adding one entry here and listing its id in ROOMS[].activeRules;
// nothing else in the codebase changes.
//
// Distortions stay tiny on purpose: they only flip flags/fields on
// the engine (via the EngineLike interface), so all physics lives
// in one place and the rule data remains declarative.
// ============================================================
import type { EngineLike, PlatformRT, RuleId } from './types'
import { wobblyLine } from '../render/paper'

export interface RuleDef {
  id: RuleId
  name: string
  tagline: string
  color: string
  /** Drawn inside the edge token badge; stroke/fill preset to color. */
  glyph: (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    time: number,
    seed: number,
  ) => void
  warningNote: string // margin note while telegraphing
  forgotNote: string // margin note when it lets go
  /** Max seconds of distortion before AUTO-RESTORE (softlock guard).
   *  direction is exactly 4s, jump 6s, the rest 7s per spec. */
  forgetDuration: number
}

type GlyphFn = RuleDef['glyph']

const gravityGlyph: GlyphFn = (ctx, cx, cy, r, time, seed) => {
  // downward arrow — "the falling"
  wobblyLine(ctx, cx, cy - r * 0.75, cx, cy + r * 0.55, seed, time, 0.7)
  wobblyLine(ctx, cx - r * 0.42, cy + r * 0.1, cx, cy + r * 0.62, seed + 3, time, 0.7)
  wobblyLine(ctx, cx + r * 0.42, cy + r * 0.1, cx, cy + r * 0.62, seed + 7, time, 0.7)
}

const collisionGlyph: GlyphFn = (ctx, cx, cy, r, time, seed) => {
  // hatched square — "the touch"
  const s = r * 1.25
  wobblyLine(ctx, cx - s / 2, cy - s / 2, cx + s / 2, cy - s / 2, seed, time, 0.6)
  wobblyLine(ctx, cx + s / 2, cy - s / 2, cx + s / 2, cy + s / 2, seed + 1, time, 0.6)
  wobblyLine(ctx, cx + s / 2, cy + s / 2, cx - s / 2, cy + s / 2, seed + 2, time, 0.6)
  wobblyLine(ctx, cx - s / 2, cy + s / 2, cx - s / 2, cy - s / 2, seed + 3, time, 0.6)
  for (let i = -1; i <= 1; i++) {
    const o = i * s * 0.32
    wobblyLine(
      ctx,
      cx - s / 2 + s * 0.2 + o,
      cy + s / 2,
      cx + s / 2 + s * 0.2 + o - s * 0.4,
      cy - s / 2,
      seed + 10 + i,
      time,
      0.5,
    )
  }
}

const platformsGlyph: GlyphFn = (ctx, cx, cy, r, time, seed) => {
  // floating slab with drifting dust — "where things stand"
  wobblyLine(ctx, cx - r * 0.8, cy - r * 0.25, cx + r * 0.8, cy - r * 0.25, seed, time, 0.6)
  wobblyLine(ctx, cx + r * 0.8, cy - r * 0.25, cx + r * 0.8, cy + r * 0.1, seed + 1, time, 0.6)
  wobblyLine(ctx, cx + r * 0.8, cy + r * 0.1, cx - r * 0.8, cy + r * 0.1, seed + 2, time, 0.6)
  wobblyLine(ctx, cx - r * 0.8, cy + r * 0.1, cx - r * 0.8, cy - r * 0.25, seed + 3, time, 0.6)
  wobblyLine(ctx, cx - r * 0.45, cy + r * 0.45, cx - r * 0.1, cy + r * 0.45, seed + 4, time, 0.5)
  wobblyLine(ctx, cx + r * 0.1, cy + r * 0.45, cx + r * 0.45, cy + r * 0.45, seed + 5, time, 0.5)
}

const directionGlyph: GlyphFn = (ctx, cx, cy, r, time, seed) => {
  // two opposing arrows — "the two ways"
  wobblyLine(ctx, cx - r * 0.55, cy - r * 0.4, cx + r * 0.55, cy - r * 0.4, seed, time, 0.6)
  wobblyLine(ctx, cx + r * 0.15, cy - r * 0.72, cx + r * 0.55, cy - r * 0.4, seed + 1, time, 0.6)
  wobblyLine(ctx, cx + r * 0.15, cy - r * 0.08, cx + r * 0.55, cy - r * 0.4, seed + 2, time, 0.6)
  wobblyLine(ctx, cx + r * 0.55, cy + r * 0.4, cx - r * 0.55, cy + r * 0.4, seed + 3, time, 0.6)
  wobblyLine(ctx, cx - r * 0.15, cy + r * 0.08, cx - r * 0.55, cy + r * 0.4, seed + 4, time, 0.6)
  wobblyLine(ctx, cx - r * 0.15, cy + r * 0.72, cx - r * 0.55, cy + r * 0.4, seed + 5, time, 0.6)
}

const jumpGlyph: GlyphFn = (ctx, cx, cy, r, time, seed) => {
  // spring arc with a small up-arrow — "up"
  ctx.beginPath()
  ctx.arc(cx, cy + r * 0.5, r * 0.72, Math.PI * 1.08, Math.PI * 1.92)
  ctx.stroke()
  wobblyLine(ctx, cx - r * 0.24, cy - r * 0.42, cx, cy - r * 0.72, seed, time, 0.5)
  wobblyLine(ctx, cx + r * 0.24, cy - r * 0.42, cx, cy - r * 0.72, seed + 1, time, 0.5)
  wobblyLine(ctx, cx - r * 0.5, cy + r * 0.72, cx + r * 0.5, cy + r * 0.72, seed + 2, time, 0.5)
}

export const RULES: Record<RuleId, RuleDef> = {
  gravity: {
    id: 'gravity',
    name: 'GRAVITY',
    tagline: 'the falling',
    color: '#b6452c',
    glyph: gravityGlyph,
    warningNote: 'the falling is fading…',
    forgotNote: 'the falling lets go.',
    forgetDuration: 7,
  },
  collision: {
    id: 'collision',
    name: 'SOLIDITY',
    tagline: 'the touch',
    color: '#2e6e63',
    glyph: collisionGlyph,
    warningNote: 'solidity is thinning…',
    forgotNote: 'things forget their edges.',
    forgetDuration: 7,
  },
  platforms: {
    id: 'platforms',
    name: 'THE GROUND',
    tagline: 'where things stand',
    color: '#c98a2d',
    glyph: platformsGlyph,
    warningNote: 'the ground is getting restless…',
    forgotNote: 'the ground starts to wander.',
    forgetDuration: 7,
  },
  direction: {
    id: 'direction',
    name: 'LEFT & RIGHT',
    tagline: 'the two ways',
    color: '#7d4a82',
    glyph: directionGlyph,
    warningNote: 'left and right are trading places…',
    forgotNote: 'left and right trade places.',
    forgetDuration: 4, // exactly 4s per spec
  },
  jump: {
    id: 'jump',
    name: 'THE LEAP',
    tagline: 'up',
    color: '#4a7d3a',
    glyph: jumpGlyph,
    warningNote: 'the leap is losing its spring…',
    forgotNote: 'the leap loses its spring.',
    forgetDuration: 6,
  },
}

// ---- distortion plumbing -------------------------------------------
// WHY so small: the engine owns gravityOsc / inputInverted /
// jumpFactor / platform.solid / platform.drift; rules just flip them.

/** Give a platform a gentle sine wander (starts at rest, from home). */
export function pickDriftFor(
  p: PlatformRT,
  rand: () => number,
  startT: number,
): void {
  p.drift = {
    amp: 30 + rand() * 50, // 30–80px per spec
    period: 3 + rand() * 2, // 3–5s per spec
    startT,
  }
}

export function applyDistortion(
  id: RuleId,
  targets: string[],
  eng: EngineLike,
): void {
  switch (id) {
    case 'gravity':
      // gravity oscillates 0.25x–0.6x (engine does the sine), plus drift
      eng.gravityOsc = true
      break
    case 'collision':
      for (const tid of targets) {
        const p = eng.platformById(tid)
        if (p) {
          p.solid = false
          p.ghost = true
        }
      }
      break
    case 'platforms':
      for (const tid of targets) {
        const p = eng.platformById(tid)
        if (p) pickDriftFor(p, eng.rand, eng.time)
      }
      break
    case 'direction':
      eng.inputInverted = true
      break
    case 'jump':
      eng.jumpFactor = 0.45
      eng.coyoteDisabled = true
      break
  }
}

export function undoDistortion(
  id: RuleId,
  targets: string[],
  eng: EngineLike,
): void {
  switch (id) {
    case 'gravity':
      eng.gravityOsc = false
      break
    case 'direction':
      eng.inputInverted = false
      break
    case 'jump':
      eng.jumpFactor = 1
      eng.coyoteDisabled = false
      break
    case 'collision':
      for (const tid of targets) {
        const p = eng.platformById(tid)
        if (p) {
          p.solid = true
          p.ghost = false
        }
      }
      break
    case 'platforms':
      for (const tid of targets) {
        const p = eng.platformById(tid)
        if (p && p.drift) {
          // fly home smoothly instead of teleporting
          p.ease = { fx: p.x, fy: p.y, t: 0, dur: 0.7 }
          p.drift = null
        }
      }
      break
  }
}
