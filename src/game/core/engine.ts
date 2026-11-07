// ============================================================
// engine.ts — the game brain. No React, no DOM, no canvas.
// ------------------------------------------------------------
// Owns: the state machine (TITLE→PLAYING⇄PAUSED, →DEAD→PLAYING,
// →ROOMCLEAR→…→VICTORY), physics, the rule/warning scheduler,
// the memory economy, checkpoints, death/respawn, pacing, stats.
//
// FAIRNESS CONTRACT (never broken):
//   · every forget event is telegraphed 3.0s (4.5s in room 1)
//     with token arc + world hatch + margin note + waver + vignette
//   · only ONE rule warned at a time; everything else queues
//   · forgotten rules AUTO-RESTORE after ≤7s (direction 4, jump 6)
//   · nothing is scheduled in the first 6s after a respawn
// The renderer READS this object; it never mutates game state.
// ============================================================
import type {
  EndingInfo,
  EngineLike,
  GameStatus,
  NoteRT,
  PlatformRT,
  PlayerRT,
  Rect,
  RoomDef,
  RuleId,
  RuleRuntime,
  RunStats,
  UiSnapshot,
  UiStats,
  Vec,
} from './types'
import {
  CHARGE_REGEN,
  COYOTE,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_V,
  MOVE_SPEED,
  PIN_DURATION,
  PLAYER_H,
  PLAYER_W,
  TOKEN_R,
  VIEW_H,
} from './types'
import { RULES, applyDistortion, undoDistortion } from './rules'
import { ROOMS } from './rooms'
import { Observer } from './observer'
import { INK } from '../render/paper'
import type { AudioEngine } from '../audio/synth'

/** live held-key state, owned by the InputManager via the shell */
export interface HeldInput {
  left: boolean
  right: boolean
}

const DEAD_DUR = 0.8 // page-flip into the margin
const CLEAR_DUR = 1.1 // page-turn between rooms
const RESPAWN_GRACE = 6 // no forget events this soon after a respawn

function makePlayer(v: Vec): PlayerRT {
  return {
    x: v.x,
    y: v.y,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    grounded: false,
    groundId: null,
    facing: 1,
    walkPhase: 0,
    landTimer: 0,
    coyote: 0,
    jumpBuffer: 0,
    prevVy: 0,
    trail: [],
    trailClock: 0,
  }
}

export class GameEngine implements EngineLike {
  // ---- identity & time -------------------------------------------
  status: GameStatus = 'title'
  time = 0 // engine clock; frozen while paused → the whole page holds still
  uiVersion = 1 // bumped on any UI-relevant change (shell re-renders)
  audio: AudioEngine
  observer = new Observer()

  // ---- world -------------------------------------------------------
  player: PlayerRT = makePlayer({ x: 60, y: 510 })
  platforms: PlatformRT[] = []
  rules = new Map<RuleId, RuleRuntime>()
  activeOrder: RuleId[] = [] // token order = selection order
  roomIndex = 0
  roomDef: RoomDef = ROOMS[0]
  exitRect: Rect = { x: 0, y: 0, w: 0, h: 0 }
  checkpoint = { x: 0, y: 0, active: false, activatedAt: -1 }
  private spawn: Vec = { x: 60, y: 510 }
  private respawnPoint: Vec = { x: 60, y: 510 }

  // ---- memory economy ----------------------------------------------
  charges = 0
  slots = 1
  selectedIdx = 0
  hoverToken = -1

  // ---- presentation state (read by the renderer) --------------------
  notes: NoteRT[] = []
  bigNote: NoteRT | null = null
  private noteId = 1
  shakeT = 0
  shakeDur = 0.2
  shakeMag = 0
  transitionT = 0
  transitionDur = DEAD_DUR
  private switched = false // roomclear: next page already loaded?
  legendOpen = false
  ending: EndingInfo | null = null

  // ---- distortion flags (flipped by rules.ts apply/undo) ------------
  gravityOsc = false
  inputInverted = false
  jumpFactor = 1
  coyoteDisabled = false

  // ---- scheduling ----------------------------------------------------
  nextEventAt = 0
  lastRespawnAt = 0
  warnDur = 3
  private chargeRegenT = 0
  private scriptFired = false
  private scriptQueue: RuleId[] = []
  private firstWarningHintDone = false
  private lastForgotten: RuleId | null = null
  private introQueue: Array<{ text: string; at: number; big: boolean }> = []

  // ---- run stats -------------------------------------------------------
  stats: RunStats = {
    pagesCleared: 0,
    erased: 0,
    jumps: 0,
    forgotten: { gravity: 0, collision: 0, platforms: 0, direction: 0, jump: 0 },
    totalPins: 0,
  }

  private held: HeldInput

  constructor(audio: AudioEngine, held: HeldInput) {
    this.audio = audio
    this.held = held
    this.loadRoom(0)
    // the title backdrop shows a quiet page: no notes, no onboarding
    this.notes = []
    this.bigNote = null
    this.introQueue = []
    this.status = 'title'
  }

  // ================================================================
  // PUBLIC API — the shell and input call these
  // ================================================================

  bumpUi(): void {
    this.uiVersion++
  }

  snapshot(): UiSnapshot {
    const top = this.observer.topKept()
    const stats: UiStats | null =
      this.status === 'victory'
        ? {
            pagesCleared: this.stats.pagesCleared,
            erased: this.stats.erased,
            jumps: this.stats.jumps,
            forgotten: { ...this.stats.forgotten },
            topKept: top,
          }
        : null
    return {
      version: this.uiVersion,
      status: this.status,
      roomIndex: this.roomIndex,
      roomCount: ROOMS.length,
      roomName: this.roomDef.name,
      roomSubtitle: this.roomDef.subtitle,
      charges: this.charges,
      maxCharges: this.roomDef.maxCharges,
      slots: this.slots,
      pinnedCount: this.pinnedCount(),
      erased: this.stats.erased,
      muted: this.audio.isMuted(),
      legendOpen: this.legendOpen,
      selectedRule: this.activeOrder[this.selectedIdx] ?? null,
      ending: this.ending,
      stats,
    }
  }

  unlockAudio(): void {
    this.audio.unlock()
  }

  toggleMute(): void {
    this.audio.unlock()
    this.audio.toggleMute()
    this.bumpUi()
  }

  toggleLegend(): void {
    if (this.status === 'title' || this.status === 'paused' || this.status === 'victory') {
      this.legendOpen = !this.legendOpen
      this.bumpUi()
    }
  }

  startRun(): void {
    this.audio.unlock()
    this.audio.resume()
    this.observer = new Observer()
    this.stats = {
      pagesCleared: 0,
      erased: 0,
      jumps: 0,
      forgotten: { gravity: 0, collision: 0, platforms: 0, direction: 0, jump: 0 },
      totalPins: 0,
    }
    this.ending = null
    this.legendOpen = false
    this.firstWarningHintDone = false
    this.roomIndex = 0
    this.loadRoom(0)
    this.status = 'playing'
    this.bumpUi()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.status = 'paused'
    this.audio.suspend()
    this.bumpUi()
  }

  resumeGame(): void {
    if (this.status !== 'paused') return
    this.status = 'playing'
    this.audio.resume()
    this.bumpUi()
  }

  /** R key / pause-menu button — resets the page, keeps run stats. */
  restartRoom(): void {
    if (this.status === 'title' || this.status === 'victory') return
    this.audio.resume()
    this.loadRoom(this.roomIndex)
    this.legendOpen = false
    this.status = 'playing'
    this.bumpUi()
  }

  quitToTitle(): void {
    this.loadRoom(0)
    this.notes = []
    this.bigNote = null
    this.introQueue = []
    this.legendOpen = false
    this.ending = null
    this.status = 'title'
    this.bumpUi()
  }

  /** window blur: auto-pause, never during menus/transitions */
  onBlur(): void {
    if (this.status === 'playing') this.pause()
  }

  /** Discrete input router — one keyboard authority, routed by status. */
  pressAction(a: string): void {
    if (a === 'mute') {
      this.toggleMute()
      return
    }
    if (a === 'legend') {
      this.toggleLegend()
      return
    }
    switch (this.status) {
      case 'title':
        if (a === 'confirm') this.startRun()
        break
      case 'playing':
        if (a === 'confirm' || a === 'pin') this.togglePin()
        else if (a === 'pause') this.pause()
        else if (a === 'restart') this.restartRoom()
        else if (a === 'jump') this.player.jumpBuffer = JUMP_BUFFER
        else if (a.startsWith('select:')) {
          const i = Number(a.slice(7))
          if (i >= 0 && i < this.activeOrder.length) this.selectedIdx = i
        }
        break
      case 'paused':
        if (a === 'confirm' || a === 'pause') this.resumeGame()
        else if (a === 'restart') this.restartRoom()
        else if (a === 'quit') this.quitToTitle()
        break
      case 'dead':
        // R always works — even mid page-flip
        if (a === 'restart') this.restartRoom()
        break
      case 'victory':
        if (a === 'confirm') this.startRun()
        break
      case 'roomclear':
        // transitions are < 1.2s, but R (restart) always works
        if (a === 'restart') this.restartRoom()
        break
    }
  }

  /** deterministic token slots so mouse hit-tests match the drawing */
  tokenPos(i: number): Vec {
    const n = this.activeOrder.length
    const x0 = 230
    const x1 = 730
    const x = n <= 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)
    return { x, y: 54 }
  }

  pointerMove(x: number, y: number): void {
    this.hoverToken = this.tokenAt(x, y)
  }

  pointerDown(x: number, y: number): void {
    if (this.status !== 'playing') return
    const i = this.tokenAt(x, y)
    if (i < 0) return
    if (i === this.selectedIdx) this.togglePin()
    else this.selectedIdx = i
  }

  // ================================================================
  // SIMULATION
  // ================================================================

  update(dt: number): void {
    if (this.status === 'paused') return // frozen page: no time passes
    this.time += dt
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt)

    // notes age in every live status
    for (const n of this.notes) n.t += dt
    this.notes = this.notes.filter((n) => n.t < n.dur)
    if (this.bigNote) {
      this.bigNote.t += dt
      if (this.bigNote.t > this.bigNote.dur) this.bigNote = null
    }

    if (this.status === 'title' || this.status === 'victory') return

    if (this.status === 'dead') {
      this.transitionT += dt
      if (this.transitionT >= this.transitionDur) this.doRespawn()
      return
    }

    if (this.status === 'roomclear') {
      this.transitionT += dt
      if (!this.switched && this.transitionT >= this.transitionDur * 0.45) {
        this.doAdvance() // swap pages while the paper covers the screen
      }
      if (
        this.switched &&
        this.status === 'roomclear' &&
        this.transitionT >= this.transitionDur
      ) {
        this.status = 'playing'
        this.bumpUi()
      }
      return
    }

    // ---------------- PLAYING ----------------
    this.processIntro()
    this.updateRules(dt)
    this.scheduleEvents()
    this.updatePlatforms(dt)
    this.updatePlayer(dt)
    this.checkInteractions()
    this.regenCharges(dt)
    for (const n of this.observer.tick(this.time)) {
      this.pushNote(n.text, n.color, 5)
      this.audio.habitHum()
    }
    this.checkScript()
  }

  // ---- rules state machine -----------------------------------------
  private updateRules(dt: number): void {
    for (const rt of this.rules.values()) {
      if (rt.pinUntil > 0 && this.time >= rt.pinUntil) {
        rt.pinUntil = 0
        this.pushNote('the clip slips.')
        this.audio.pinSlip()
        this.bumpUi()
      }
      if (rt.phase === 'warned') {
        rt.timer -= dt
        if (rt.timer <= 0) this.forgetRule(rt)
      } else if (rt.phase === 'forgotten') {
        rt.timer -= dt
        if (rt.timer <= 0) this.restoreRule(rt, true)
      }
    }
  }

  private anyActiveDistortion(): boolean {
    for (const rt of this.rules.values()) {
      if (rt.phase !== 'stable') return true
    }
    return false
  }

  /** pacing: first event after firstEventDelay, then 9–16s apart,
   *  never in the first 6s after a respawn, never while another
   *  rule is warned or forgotten (queueing = fairness). */
  private scheduleEvents(): void {
    if (this.anyActiveDistortion()) return

    // scripted set piece (room 5): sequential, still fully telegraphed
    if (this.scriptQueue.length > 0) {
      const id = this.scriptQueue.shift() as RuleId
      const rt = this.rules.get(id)
      if (rt && rt.pinUntil <= this.time && rt.phase === 'stable') {
        this.startWarning(id)
      }
      if (this.scriptQueue.length === 0) {
        this.nextEventAt = this.time + this.randInterval()
      }
      return
    }

    if (this.time < this.nextEventAt) return
    if (this.time - this.lastRespawnAt < RESPAWN_GRACE) return

    let cands = this.activeOrder.filter((id) => {
      const rt = this.rules.get(id)
      return !!rt && rt.phase === 'stable' && rt.pinUntil <= this.time
    })
    // avoid repeating the same rule while there is any alternative
    if (cands.length > 1 && this.lastForgotten) {
      cands = cands.filter((id) => id !== this.lastForgotten)
    }
    if (cands.length === 0) {
      this.nextEventAt = this.time + 2.5
      return
    }
    const pick = this.observer.biasedRule(cands) ?? cands[0]
    this.startWarning(pick)
  }

  private startWarning(id: RuleId): void {
    const rt = this.rules.get(id)
    if (!rt) return
    const def = RULES[id]
    rt.phase = 'warned'
    rt.timer = this.warnDur
    rt.targets = this.pickTargets(id)
    this.pushNote(def.warningNote, def.color)
    this.audio.startWaver()
    if (id === 'direction') this.audio.directionHorn() // strongest warning
    // one-time unmissable teaching moment on page one
    if (this.roomIndex === 0 && !this.firstWarningHintDone) {
      this.firstWarningHintDone = true
      this.setBigNote('press its number, then ENTER — keep it.', def.color, 4.5)
    }
  }

  /** which platforms a collision/platforms event will hit — biased by
   *  the Observer toward the player's favorite perch (never floors). */
  private pickTargets(id: RuleId): string[] {
    if (id !== 'collision' && id !== 'platforms') return []
    const ledges = this.platforms
      .filter((p) => p.kind !== 'floor' && !p.noDistort)
      .map((p) => p.id)
    if (ledges.length === 0) return []
    const n =
      id === 'collision'
        ? Math.min(ledges.length, 1 + (Math.random() < 0.4 ? 1 : 0)) // 1–2
        : Math.min(ledges.length, 1 + Math.floor(Math.random() * 3)) // 1–3
    return this.observer.biasedTargets(ledges, n)
  }

  private forgetRule(rt: RuleRuntime): void {
    const def = RULES[rt.id]
    rt.phase = 'forgotten'
    rt.timer = def.forgetDuration
    applyDistortion(rt.id, rt.targets, this)
    this.audio.stopWaver()
    this.audio.forgetPaper()
    if (rt.id === 'direction') this.audio.directionHorn()
    this.shake(2.5, 0.22)
    this.stats.forgotten[rt.id]++
    this.lastForgotten = rt.id
    this.pushNote(def.forgotNote, def.color)
  }

  private restoreRule(rt: RuleRuntime, auto: boolean): void {
    rt.phase = 'stable'
    rt.timer = 0
    undoDistortion(rt.id, rt.targets, this)
    rt.targets = []
    this.audio.stopWaver()
    this.audio.restore()
    if (auto) this.pushNote('remembered.')
    this.nextEventAt = this.time + this.randInterval()
  }

  private cancelWarningByPin(rt: RuleRuntime): void {
    rt.phase = 'stable'
    rt.timer = 0
    rt.targets = []
    this.audio.stopWaver()
    this.audio.preserve()
    this.pushNote('remembered.')
    this.nextEventAt = this.time + this.randInterval()
  }

  // ---- memory economy ----------------------------------------------
  pinnedCount(): number {
    let n = 0
    for (const rt of this.rules.values()) {
      if (rt.pinUntil > this.time) n++
    }
    return n
  }

  togglePin(): void {
    if (this.status !== 'playing') return
    const id = this.activeOrder[this.selectedIdx]
    if (!id) return
    const rt = this.rules.get(id)
    if (!rt) return

    // Enter again unpins early (no refund — memory is spent)
    if (rt.pinUntil > this.time) {
      rt.pinUntil = 0
      this.pushNote('let go.')
      this.audio.unpin()
      this.bumpUi()
      return
    }
    if (this.charges <= 0) {
      this.pushNote('no charges left to keep it.', '#a2611c')
      this.audio.pinDenied()
      return
    }
    if (this.pinnedCount() >= this.slots) {
      this.pushNote('no slot left — let something go first.', '#a2611c')
      this.audio.pinDenied()
      return
    }

    this.charges--
    this.stats.totalPins++
    rt.pinUntil = this.time + PIN_DURATION
    this.observer.onPin(id)

    if (rt.phase === 'warned') {
      // keeping a fading rule cancels its warning
      this.cancelWarningByPin(rt)
    } else if (rt.phase === 'forgotten') {
      // rescue: pinning ends the distortion immediately
      undoDistortion(id, rt.targets, this)
      rt.targets = []
      rt.phase = 'stable'
      rt.timer = 0
      this.audio.stopWaver()
      this.audio.preserve()
      this.pushNote('remembered.')
      this.nextEventAt = this.time + this.randInterval()
    } else {
      this.audio.preserve()
      this.pushNote('kept for a while.', RULES[id].color)
    }
    this.bumpUi()
  }

  private regenCharges(dt: number): void {
    if (this.charges >= this.roomDef.maxCharges) {
      this.chargeRegenT = 0
      return
    }
    this.chargeRegenT += dt
    if (this.chargeRegenT >= CHARGE_REGEN) {
      this.chargeRegenT = 0
      this.charges++
      this.bumpUi()
    }
  }

  // ---- platforms (drift + carry-back) --------------------------------
  private updatePlatforms(dt: number): void {
    for (const p of this.platforms) {
      p.prevX = p.x
      p.prevY = p.y
      if (p.drift) {
        const TAU = Math.PI * 2
        const t = this.time - p.drift.startT
        p.x = p.homeX + p.drift.amp * Math.sin((TAU * t) / p.drift.period)
        p.y =
          p.homeY +
          p.drift.amp * 0.4 * Math.sin((TAU * t) / (p.drift.period * 1.37))
      } else if (p.ease) {
        p.ease.t += dt
        const k = Math.min(1, p.ease.t / p.ease.dur)
        const s = k * k * (3 - 2 * k)
        p.x = p.ease.fx + (p.homeX - p.ease.fx) * s
        p.y = p.ease.fy + (p.homeY - p.ease.fy) * s
        if (k >= 1) p.ease = null
      }
    }
  }

  // ---- player physics -------------------------------------------------
  private updatePlayer(dt: number): void {
    const p = this.player

    // carried by whatever the player stands on (drifting platforms)
    if (p.groundId) {
      const g = this.platformById(p.groundId)
      if (g) {
        p.x += g.x - g.prevX
        p.y += g.y - g.prevY
      }
    }

    // horizontal intent — LEFT & RIGHT may invert it
    let dir = 0
    if (this.held.left) dir -= 1
    if (this.held.right) dir += 1
    dir *= this.inputInverted ? -1 : 1
    if (dir !== 0) p.facing = dir > 0 ? 1 : -1
    const target = dir * MOVE_SPEED
    const acc = dir !== 0 ? 2600 : 2400
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt)
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt)

    // gravity — GRAVITY oscillates 0.25x–0.6x with sideways drift
    const gscale = this.gravityOsc ? 0.425 + 0.175 * Math.sin(this.time * 1.7) : 1
    p.vy = Math.min(1300, p.vy + GRAVITY * gscale * dt)
    if (this.gravityOsc) p.x += 30 * Math.sin(this.time * 0.9) * dt

    // jump: buffer + coyote (coyote disabled while THE LEAP is forgotten)
    if (p.grounded) p.coyote = this.coyoteDisabled ? 0 : COYOTE
    else p.coyote = Math.max(0, p.coyote - dt)
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt)
    if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = -JUMP_V * this.jumpFactor
      p.grounded = false
      p.groundId = null
      p.coyote = 0
      p.jumpBuffer = 0
      this.observer.onJump(this.time)
      this.stats.jumps++
      this.audio.jumpTick()
    }

    // integrate + swept-ish resolution: X first, then Y
    p.prevVy = p.vy
    p.x += p.vx * dt
    this.resolveX(p)
    p.y += p.vy * dt
    const wasGrounded = p.grounded
    p.grounded = false
    p.groundId = null
    this.resolveY(p)
    if (p.grounded && !wasGrounded) {
      if (p.prevVy > 420) {
        p.landTimer = 0.14
        this.audio.landTap()
      } else {
        p.landTimer = 0.08
      }
    }
    // stand-time for the Observer's perch detection
    if (p.grounded && p.groundId) {
      const g = this.platformById(p.groundId)
      if (g) this.observer.addStand(g.id, g.kind, dt)
    }
    // soft ceiling: floaty jumps may poke above the page
    if (p.y < -40) {
      p.y = -40
      if (p.vy < 0) p.vy = 0
    }

    // feel: walk cycle + pencil trail
    p.walkPhase += Math.abs(p.vx) * dt * 0.045
    p.landTimer = Math.max(0, p.landTimer - dt)
    p.trailClock -= dt
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > 80 && p.trailClock <= 0) {
      p.trail.push({ x: p.x + p.w / 2, y: p.y + p.h * 0.6, t: this.time })
      p.trailClock = 0.045
    }
    p.trail = p.trail.filter((d) => this.time - d.t < 1.2)
  }

  private resolveX(p: PlayerRT): void {
    for (const pl of this.platforms) {
      if (!pl.solid) continue
      if (
        p.x < pl.x + pl.w &&
        p.x + p.w > pl.x &&
        p.y < pl.y + pl.h &&
        p.y + p.h > pl.y
      ) {
        if (p.vx > 0) p.x = pl.x - p.w
        else if (p.vx < 0) p.x = pl.x + pl.w
        else {
          // squeezed by a drifting platform — pop out the shallow side
          const penL = p.x + p.w - pl.x
          const penR = pl.x + pl.w - p.x
          if (penL < penR) p.x = pl.x - p.w
          else p.x = pl.x + pl.w
        }
        p.vx = 0
      }
    }
  }

  private resolveY(p: PlayerRT): void {
    for (const pl of this.platforms) {
      if (!pl.solid) continue
      if (
        p.x < pl.x + pl.w &&
        p.x + p.w > pl.x &&
        p.y < pl.y + pl.h &&
        p.y + p.h > pl.y
      ) {
        if (p.vy > 0) {
          p.y = pl.y - p.h
          p.vy = 0
          p.grounded = true
          p.groundId = pl.id
        } else if (p.vy < 0) {
          p.y = pl.y + pl.h
          p.vy = 0
        }
      }
    }
  }

  // ---- interactions ---------------------------------------------------
  private checkInteractions(): void {
    const p = this.player

    // checkpoint (ink anchor knot): sets respawn, +1 charge
    const dx = p.x + p.w / 2 - this.checkpoint.x
    const dy = p.y + p.h - this.checkpoint.y
    if (!this.checkpoint.active && Math.abs(dx) < 34 && dy > -10 && dy < 46) {
      this.checkpoint.active = true
      this.checkpoint.activatedAt = this.time
      this.respawnPoint = { x: this.checkpoint.x - p.w / 2, y: this.checkpoint.y - p.h }
      if (this.charges < this.roomDef.maxCharges) {
        this.charges++
        this.bumpUi()
      }
      this.audio.checkpointBell()
      this.pushNote('anchored.', '#a2611c')
    }

    // exit door
    const e = this.exitRect
    if (
      p.x < e.x + e.w &&
      p.x + p.w > e.x &&
      p.y < e.y + e.h &&
      p.y + p.h > e.y
    ) {
      this.clearRoom()
      return
    }

    // the margin
    if (p.y > VIEW_H + 80) this.startDead()
  }

  /** room 5 set piece: near the end of the climb, it panics */
  private checkScript(): void {
    const sc = this.roomDef.script
    if (!sc || this.scriptFired || this.scriptQueue.length > 0) return
    const p = this.player
    if (p.x > sc.whenX && p.y < sc.whenYMax) {
      this.scriptFired = true
      this.pushNote('it panics — it is forgetting everything at once—', '#b6452c', 5)
      for (const id of sc.rules) this.scriptQueue.push(id)
    }
  }

  // ---- transitions ------------------------------------------------------
  private startDead(): void {
    this.status = 'dead'
    this.transitionT = 0
    this.transitionDur = DEAD_DUR
    this.stats.erased++
    this.audio.stopWaver()
    this.audio.erased()
    this.bumpUi()
  }

  /** soft recovery: everything back to STABLE — the softlock guard */
  private doRespawn(): void {
    for (const rt of this.rules.values()) {
      if (rt.phase !== 'stable') undoDistortion(rt.id, rt.targets, this)
      rt.phase = 'stable'
      rt.timer = 0
      rt.targets = []
    }
    this.audio.stopWaver()
    const p = this.player
    p.x = this.respawnPoint.x
    p.y = this.respawnPoint.y
    p.vx = 0
    p.vy = 0
    p.grounded = false
    p.groundId = null
    p.trail = []
    this.lastRespawnAt = this.time
    this.nextEventAt = Math.max(
      this.nextEventAt,
      this.time + RESPAWN_GRACE + Math.random() * 4,
    )
    this.status = 'playing'
    this.shake(2, 0.18)
    this.bumpUi()
  }

  private clearRoom(): void {
    this.status = 'roomclear'
    this.transitionT = 0
    this.transitionDur = CLEAR_DUR
    this.switched = false
    this.stats.pagesCleared++
    this.audio.stopWaver()
    this.audio.roomClear()
    this.bumpUi()
  }

  private doAdvance(): void {
    this.switched = true
    if (this.roomIndex + 1 < ROOMS.length) {
      this.roomIndex++
      this.loadRoom(this.roomIndex)
      this.bumpUi()
    } else {
      this.status = 'victory'
      this.ending = this.observer.getEnding()
      this.audio.victory()
      this.bumpUi()
    }
  }

  // ---- room lifecycle -----------------------------------------------
  loadRoom(i: number): void {
    const rd = ROOMS[i]
    this.audio.stopWaver() // never let a warning waver leak across pages
    this.roomDef = rd
    this.roomIndex = i
    this.platforms = rd.platforms.map((pl) => ({
      ...pl,
      homeX: pl.x,
      homeY: pl.y,
      prevX: pl.x,
      prevY: pl.y,
      solid: true,
      ghost: false,
      drift: null,
      ease: null,
    }))
    this.exitRect = { ...rd.exit }
    this.checkpoint = { x: rd.checkpoint.x, y: rd.checkpoint.y, active: false, activatedAt: -1 }
    this.spawn = { ...rd.spawn }
    this.respawnPoint = { ...rd.spawn }
    this.activeOrder = [...rd.activeRules]
    this.rules = new Map()
    for (const id of this.activeOrder) {
      this.rules.set(id, { id, phase: 'stable', timer: 0, pinUntil: 0, targets: [] })
    }
    this.slots = rd.memorySlots
    this.charges = rd.maxCharges
    this.selectedIdx = 0
    this.hoverToken = -1
    this.warnDur = rd.warnDuration
    this.notes = []
    this.bigNote = null
    this.introQueue = rd.introNotes.map((text, idx) => ({
      text,
      // tight stagger so every onboarding line lands BEFORE the first
      // forget event (room 1: last line at ~8s, first event at 10s)
      at: this.time + 1.2 + idx * 3.4,
      big: true,
    }))
    this.pushNote(`room ${i + 1} — ${rd.name}`, INK, 3.5)
    this.nextEventAt = this.time + rd.firstEventDelay
    this.lastRespawnAt = this.time
    this.scriptFired = false
    this.scriptQueue = [] // filled only when the room's script triggers
    this.chargeRegenT = 0
    this.gravityOsc = false
    this.inputInverted = false
    this.jumpFactor = 1
    this.coyoteDisabled = false
    this.player = makePlayer(rd.spawn)
    this.observer.resetRoom()
    this.bumpUi()
  }

  // ---- helpers ---------------------------------------------------------
  private randInterval(): number {
    const [a, b] = this.roomDef.eventInterval
    return a + Math.random() * (b - a)
  }

  private processIntro(): void {
    while (this.introQueue.length > 0 && this.time >= this.introQueue[0].at) {
      const item = this.introQueue.shift()
      if (!item) break
      if (item.big) this.setBigNote(item.text, INK, 4.8)
      else this.pushNote(item.text, INK, 4.5)
    }
  }

  private pushNote(text: string, color?: string, dur = 4.2): void {
    this.notes.push({
      id: this.noteId++,
      text,
      color: color ?? INK,
      rot: (Math.random() * 2 - 1) * 0.03,
      t: 0,
      dur,
    })
    if (this.notes.length > 3) this.notes.shift()
  }

  private setBigNote(text: string, color: string, dur = 4.8): void {
    this.bigNote = {
      id: this.noteId++,
      text,
      color,
      rot: (Math.random() * 2 - 1) * 0.02,
      t: 0,
      dur,
    }
  }

  private shake(mag: number, dur: number): void {
    this.shakeMag = mag
    this.shakeDur = dur
    this.shakeT = dur
  }

  platformById(id: string): PlatformRT | undefined {
    return this.platforms.find((p) => p.id === id)
  }

  private tokenAt(x: number, y: number): number {
    for (let i = 0; i < this.activeOrder.length; i++) {
      const pos = this.tokenPos(i)
      if (Math.hypot(x - pos.x, y - pos.y) < TOKEN_R + 8) return i
    }
    return -1
  }

  // EngineLike requirement used by rules.ts distortions
  rand(): number {
    return Math.random()
  }
}
