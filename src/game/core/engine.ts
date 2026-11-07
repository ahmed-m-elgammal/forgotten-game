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
  GameMode,
  GameStatus,
  InkColor,
  NoteRT,
  PlankRT,
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
  BRITTLE_LIFE,
  CHARGE_REGEN,
  COYOTE,
  ENDLESS_BOOKMARKS,
  GRAVITY,
  GRIP_ACCEL,
  GRIP_DRAG,
  GRIP_TOP_SPEED,
  GHOST_PLANK_W,
  INK_COLORS,
  INK_MAX,
  JUMP_BUFFER,
  JUMP_V,
  MOVE_SPEED,
  PIN_DURATION,
  PLANK_DRAG_MIN,
  PLANK_H,
  PLANK_LIFE,
  PLANK_MAX_SLOPE,
  PLANK_MAX_W,
  PLANK_MIN_W,
  PLAYER_H,
  PLAYER_W,
  RED_BOUNCE_MIN,
  RED_BOUNCE_VY,
  SKETCH_MAX_PLANKS,
  SQUASH_TIME,
  STRANGER_LIFE,
  TOKEN_R,
  UNCIRCLE_COOLDOWN,
  UNCIRCLE_CUT,
  UNCIRCLE_MAX_PER_ROOM,
  UNCIRCLE_RIDE,
  VIEW_H,
  VIEW_W,
} from './types'
import { RULES, applyDistortion, undoDistortion } from './rules'
import { ROOMS } from './rooms'
import { endlessRoom } from './endless'
import { Observer } from './observer'
import { GRAPHITE, INK, reducedMotion } from '../render/paper'
import type { AudioEngine } from '../audio/synth'

/** live held-key state, owned by the InputManager via the shell */
export interface HeldInput {
  left: boolean
  right: boolean
  up: boolean // sketch-mode nudges (W/↑ while drawing)
  down: boolean
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

/** size of the drifting OUT? label (THE NAMING) — also its hitbox */
const LABEL_W = 56
const LABEL_H = 20
/** seconds per leg of the label's wander between anchors */
const LABEL_LEG_S = 2.2

export class GameEngine implements EngineLike {
  // ---- identity & time -------------------------------------------
  status: GameStatus = 'title'
  mode: GameMode = 'campaign'
  time = 0 // engine clock; frozen while paused → the whole page holds still
  runTime = 0 // seconds of LIVE play this run (menus/transitions excluded)
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
  gripLost = false // THE GRIP: icy friction while forgotten
  namingLost = false // THE NAMING: door inert, label adrift

  // ---- THE NAMING label drift (deterministic from engine time) ------
  labelRect: Rect = { x: 0, y: 0, w: LABEL_W, h: LABEL_H }
  private labelAnchors: Vec[] = []
  private labelDriftT0 = 0

  // ---- RE-INKING: ink, drops, sketched planks, sketch mode ----------
  /** carried ink as a FIFO of colored swallows — the oldest is what
   *  the next stroke spends. `ink` stays the count for the HUD. */
  inkCharges: InkColor[] = []
  // the renderer draws the bottles, so this stays readable outside
  inkDrops: Array<{ at: Vec; taken: boolean; color: InkColor }> = []
  planks: PlankRT[] = []
  private plankSeq = 0
  /** paper shreds where a blue plank tore (read by the renderer) */
  tears: Array<{ x: number; y: number; t: number; seed: number }> = []
  sketchMode = false
  sketchOffset: Vec = { x: 40, y: 0 } // ghost plank offset from the player
  drag: { active: boolean; x0: number; y0: number; x1: number; y1: number } | null = null
  skids: Array<{ x: number; y: number; t: number }> = [] // icy slide streaks
  private skidClock = 0
  // the Observer writes back: per-room uncircle bookkeeping
  private uncircleRoomCount = 0
  private lastUncircleAt = -999
  private strangerFarewellDone = false

  // ---- endless mode (v1.2) -----------------------------------------
  endlessDepth = 0 // 1-based: which generated page you are on
  bookmarks = ENDLESS_BOOKMARKS // the endless lives (refill per page)
  private endlessDef: RoomDef | null = null // kept so R can redraw the same page

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
    forgotten: { gravity: 0, collision: 0, platforms: 0, direction: 0, jump: 0, grip: 0, naming: 0 },
    totalPins: 0,
    planksDrawn: 0,
    inkCollected: 0,
    redBounces: 0,
    blueTears: 0,
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

  /** carried ink count (queue length) — the HUD and deny checks read this */
  get ink(): number {
    return this.inkCharges.length
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
      this.status === 'victory' || this.status === 'gameover'
        ? {
            pagesCleared: this.stats.pagesCleared,
            erased: this.stats.erased,
            jumps: this.stats.jumps,
            forgotten: { ...this.stats.forgotten },
            topKept: top,
            planksDrawn: this.stats.planksDrawn,
            inkCollected: this.stats.inkCollected,
            redBounces: this.stats.redBounces,
            blueTears: this.stats.blueTears,
          }
        : null
    return {
      version: this.uiVersion,
      status: this.status,
      mode: this.mode,
      roomIndex: this.roomIndex,
      roomCount: this.mode === 'endless' ? this.roomIndex + 1 : ROOMS.length,
      roomName: this.roomDef.name,
      roomSubtitle: this.roomDef.subtitle,
      bookmarks: this.bookmarks,
      runTime: this.runTime,
      charges: this.charges,
      maxCharges: this.roomDef.maxCharges,
      slots: this.slots,
      pinnedCount: this.pinnedCount(),
      erased: this.stats.erased,
      ink: this.ink,
      inkMax: INK_MAX,
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

  private resetRunStats(): void {
    this.observer = new Observer()
    this.runTime = 0
    this.stats = {
      pagesCleared: 0,
      erased: 0,
      jumps: 0,
      forgotten: { gravity: 0, collision: 0, platforms: 0, direction: 0, jump: 0, grip: 0, naming: 0 },
      totalPins: 0,
      planksDrawn: 0,
      inkCollected: 0,
      redBounces: 0,
      blueTears: 0,
    }
    this.ending = null
    this.legendOpen = false
    this.firstWarningHintDone = false
  }

  startRun(): void {
    this.audio.unlock()
    this.audio.resume()
    this.mode = 'campaign'
    this.resetRunStats()
    this.roomIndex = 0
    this.loadRoom(0)
    this.status = 'playing'
    this.bumpUi()
  }

  /** THE MARGINS (v1.2): endless mode — the notebook keeps writing.
   *  Same world, same fairness, generated pages, three bookmarks. */
  startEndless(): void {
    this.audio.unlock()
    this.audio.resume()
    this.mode = 'endless'
    this.resetRunStats()
    this.endlessDepth = 1
    this.loadEndless(1)
    this.status = 'playing'
    this.bumpUi()
  }

  /** generate + load page `depth`; the HUD number continues the
   *  campaign count (page 9 is endless depth 1) */
  loadEndless(depth: number): void {
    this.endlessDepth = depth
    this.endlessDef = endlessRoom(depth)
    this.bookmarks = ENDLESS_BOOKMARKS // fresh page, fresh bookmarks
    this.loadRoomDef(this.endlessDef, 7 + depth, 'page')
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

  /** R key / pause-menu button — resets the page, keeps run stats.
   *  Endless: redraws the SAME generated page (bookmarks refill). */
  restartRoom(): void {
    if (this.status === 'title' || this.status === 'victory' || this.status === 'gameover') return
    this.audio.resume()
    if (this.mode === 'endless' && this.endlessDef) {
      this.loadRoomDef(this.endlessDef, this.roomIndex, 'page')
      this.bookmarks = ENDLESS_BOOKMARKS
    } else {
      this.loadRoom(this.roomIndex)
    }
    this.legendOpen = false
    this.status = 'playing'
    this.bumpUi()
  }

  quitToTitle(): void {
    this.mode = 'campaign'
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
        if (this.sketchMode) {
          // the sketch has first claim on keys — but Space still jumps
          if (a === 'confirm') this.placeSketchKeyboard()
          else if (a === 'pause') this.exitSketch() // ESC leaves the sketch first
          else if (a === 'sketch') this.exitSketch() // C toggles it off
          else if (a === 'restart') this.restartRoom()
          else if (a === 'jump') this.player.jumpBuffer = JUMP_BUFFER
          else if (a === 'pin') this.togglePin()
          else if (a.startsWith('select:')) {
            const i = Number(a.slice(7))
            if (i >= 0 && i < this.activeOrder.length) this.selectedIdx = i
          }
        } else if (a === 'confirm' || a === 'pin') this.togglePin()
        else if (a === 'pause') this.pause()
        else if (a === 'restart') this.restartRoom()
        else if (a === 'sketch') this.enterSketch()
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
      case 'gameover':
        // quick retry; the shell's buttons do the same via startEndless/quit
        if (a === 'confirm') this.startEndless()
        else if (a === 'quit') this.quitToTitle()
        break
      case 'roomclear':
        // transitions are < 1.2s, but R (restart) always works
        if (a === 'restart') this.restartRoom()
        break
    }
  }

  /** deterministic token slots so mouse hit-tests match the drawing.
   *  Spread widened for seven tokens (7 rules) without crowding the
   *  top-right margin-note stack. */
  tokenPos(i: number): Vec {
    const n = this.activeOrder.length
    const x0 = 200
    const x1 = 760
    const x = n <= 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)
    return { x, y: 54 }
  }

  pointerMove(x: number, y: number): void {
    this.hoverToken = this.tokenAt(x, y)
    if (this.drag) this.sketchDragMove(x, y) // feed the live stroke
  }

  pointerDown(x: number, y: number): void {
    if (this.status !== 'playing') return
    const i = this.tokenAt(x, y)
    if (i >= 0) {
      // token taps stay short — they must never start a sketch stroke
      if (i === this.selectedIdx) this.togglePin()
      else this.selectedIdx = i
      return
    }
    this.sketchDragStart(x, y)
  }

  pointerUp(x: number, y: number): void {
    this.sketchDragEnd(x, y)
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

    // menu statuses: the page holds still (gameover included — the
    // score screen is the endless run's victory screen)
    if (this.status === 'title' || this.status === 'victory' || this.status === 'gameover') return

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
    this.runTime += dt // live play only — menus and transitions don't count
    this.processIntro()
    this.updateSketchNudge(dt)
    this.updateRules(dt)
    this.scheduleEvents()
    this.updatePlatforms(dt)
    this.updatePlanks()
    this.updatePlayer(dt)
    this.updateLabel()
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

    // scripted set piece (final page): sequential, still fully telegraphed
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
    if (this.gripLost) {
      // THE GRIP forgotten: the page is ice. Pushing barely speeds you
      // up; releasing does NOT brake — momentum just barely bleeds away.
      if (dir !== 0) {
        const gTarget = dir * GRIP_TOP_SPEED
        if (p.vx < gTarget) p.vx = Math.min(gTarget, p.vx + GRIP_ACCEL * dt)
        else if (p.vx > gTarget) p.vx = Math.max(gTarget, p.vx - GRIP_ACCEL * dt)
      } else {
        // no input: skip the old deceleration entirely — tiny drag only
        p.vx *= Math.max(0, 1 - GRIP_DRAG * dt)
      }
      p.vx = Math.max(-GRIP_TOP_SPEED, Math.min(GRIP_TOP_SPEED, p.vx))
    } else {
      const target = dir * MOVE_SPEED
      const acc = dir !== 0 ? 2600 : 2400
      if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt)
      else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt)
    }

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
    // stand-time for the Observer's perch detection — and for drawn
    // planks: ride tracking (it uncircles what you rely on) plus the
    // blue ink's brittleness (it tears under a standing load).
    // (locals defeat TS's stale literal-narrowing from above —
    // resolveY() set these, the checker just can't see it)
    const standing = p.grounded as boolean
    const gid = p.groundId as string | null
    if (standing && gid) {
      const g = this.platformById(gid)
      if (g) this.observer.addStand(g.id, g.kind, dt)
      if (gid.startsWith('plank-')) {
        const pl = this.planks.find((q) => q.id === gid)
        if (pl) {
          this.observer.onPlankRide(pl.id, dt)
          if (pl.color === 'blue' && !pl.stranger) {
            pl.contact += dt
            if (pl.contact >= BRITTLE_LIFE) this.tearPlank(pl)
          }
        }
      }
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

    // icy skid streaks while sliding fast with no input (THE GRIP)
    this.skidClock -= dt
    if (
      this.gripLost &&
      dir === 0 &&
      Math.abs(p.vx) > 240 &&
      !reducedMotion() &&
      this.skidClock <= 0
    ) {
      this.skids.push({ x: p.x + p.w / 2, y: p.y + p.h - 2, t: this.time })
      this.skidClock = 0.05
    }
    this.skids = this.skids.filter((s) => this.time - s.t < 0.5)
  }

  // ---- sketched planks (RE-INKING) ----------------------------------
  private updatePlanks(): void {
    const alive: PlankRT[] = []
    for (const pl of this.planks) {
      if (pl.squash > 0) pl.squash = Math.max(0, pl.squash - (1 / SQUASH_TIME) * 0.016)
      if (this.time - pl.born < pl.life) {
        alive.push(pl)
      } else {
        this.audio.plankFade() // soft pencil-sweep, no note — too chatty
        if (pl.stranger && !this.strangerFarewellDone) {
          // the imitation finally dried up — say so, once
          this.strangerFarewellDone = true
          this.pushNote('it was never your line.', GRAPHITE, 4.5, true)
        }
      }
    }
    this.planks = alive
    this.tears = this.tears.filter((s) => this.time - s.t < 0.5)
    this.observerUncircle()
  }

  /** THE OBSERVER WRITES BACK: if you have ridden one of your planks
   *  long enough, it circles that plank in graphite and strikes it —
   *  the remaining life is cut. Never the stranger's line, never more
   *  than twice a page, always ≥8s apart. Telegraphed by the scribble
   *  itself + a shaky note + the scratch sound; the plank still blinks
   *  before it goes, so nothing is ever instant. */
  private observerUncircle(): void {
    if (this.uncircleRoomCount >= UNCIRCLE_MAX_PER_ROOM) return
    if (this.time - this.lastUncircleAt < UNCIRCLE_COOLDOWN) return
    const id = this.observer.mostRiddenPlank(UNCIRCLE_RIDE)
    if (!id) return
    const pl = this.planks.find((q) => q.id === id && !q.stranger && !q.uncircled)
    if (!pl) return
    const age = this.time - pl.born
    const remaining = pl.life - age
    if (remaining <= 0.8) return // about to dry anyway — pointless cruelty
    pl.life = age + remaining * UNCIRCLE_CUT
    pl.uncircled = true
    this.uncircleRoomCount++
    this.lastUncircleAt = this.time
    this.pushNote('it uncircles your plank.', GRAPHITE, 4.5, true)
    this.audio.observerScratch()
  }

  /** a blue plank gives way: shreds, crunch, and open air */
  private tearPlank(pl: PlankRT): void {
    this.planks = this.planks.filter((q) => q.id !== pl.id)
    this.stats.blueTears++
    for (let i = 0; i < 5; i++) {
      this.tears.push({
        x: pl.x + pl.w * (0.15 + 0.7 * Math.random()),
        y: pl.y + Math.random() * pl.h,
        t: this.time,
        seed: Math.random() * 1000,
      })
    }
    this.audio.plankTear()
    this.bumpUi()
  }

  /** the keyboard ghost plank, anchored to the player (clamped in-page) */
  ghostPlankRect(): Rect {
    const p = this.player
    const w = GHOST_PLANK_W
    const x = Math.max(6, Math.min(VIEW_W - 6 - w, p.x + p.w / 2 + this.sketchOffset.x - w / 2))
    const y = Math.max(30, Math.min(VIEW_H - 16 - PLANK_H, p.y + p.h / 2 + this.sketchOffset.y - PLANK_H / 2))
    return { x, y, w, h: PLANK_H }
  }

  /** continuous ghost nudging while the sketch mode is open (A/D/W/S).
   *  Held keys ALSO keep steering the player — the ghost follows. */
  private updateSketchNudge(dt: number): void {
    if (!this.sketchMode) return
    const nx = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0)
    const ny = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0)
    this.sketchOffset.x = Math.max(-160, Math.min(160, this.sketchOffset.x + nx * 240 * dt))
    this.sketchOffset.y = Math.max(-90, Math.min(90, this.sketchOffset.y + ny * 150 * dt))
  }

  private enterSketch(): void {
    if (this.ink <= 0) {
      this.pushNote('no ink to draw with.', '#a2611c')
      this.audio.pinDenied()
      return
    }
    this.sketchMode = true
    this.sketchOffset = { x: 40 * this.player.facing, y: 0 }
    this.audio.sketchStart()
  }

  private exitSketch(): void {
    this.sketchMode = false
  }

  private placeSketchKeyboard(): void {
    if (this.inkCharges.length === 0) {
      this.pushNote('no ink to draw with.', '#a2611c')
      this.audio.pinDenied()
      this.exitSketch()
      return
    }
    const r = this.ghostPlankRect()
    this.createPlank(r.x, r.y, r.w)
    this.audio.plankPlace()
  }

  // ---- mouse drag → plank -------------------------------------------
  private sketchDragStart(x: number, y: number): void {
    if (this.sketchMode) this.exitSketch() // the mouse takes over
    this.drag = { active: true, x0: x, y0: y, x1: x, y1: y }
    this.audio.sketchStart()
    if (this.inkCharges.length > 0) this.audio.startSketchLoop()
  }

  private sketchDragMove(x: number, y: number): void {
    if (!this.drag) return
    this.drag.x1 = x
    this.drag.y1 = y
  }

  private sketchDragEnd(x: number, y: number): void {
    const d = this.drag
    this.drag = null
    this.audio.stopSketchLoop()
    if (!d || this.status !== 'playing') return
    const len = Math.hypot(x - d.x0, y - d.y0)
    if (len < PLANK_DRAG_MIN) return // a short click — nothing drawn
    if (this.inkCharges.length === 0) {
      this.pushNote('no ink to draw with.', '#a2611c')
      this.audio.pinDenied()
      return
    }
    const r = this.strokeToPlankRect(d.x0, d.y0, x, y)
    this.createPlank(r.x, r.y, r.w)
    this.audio.plankPlace()
  }

  /** Simplify a stroke to its endpoints, clamp the slope to ~29° and
   *  the width to [60,240] — planks are always walkable AABBs. */
  strokeToPlankRect(x0: number, y0: number, x1: number, y1: number): Rect {
    let xa = x0
    let ya = y0
    let xb = x1
    let yb = y1
    if (xa > xb) {
      ;[xa, xb] = [xb, xa]
      ;[ya, yb] = [yb, ya]
    }
    const dx = Math.max(1, xb - xa)
    const maxDy = dx * PLANK_MAX_SLOPE
    const dy = Math.max(-maxDy, Math.min(maxDy, yb - ya))
    const w = Math.max(PLANK_MIN_W, Math.min(PLANK_MAX_W, dx))
    const x = Math.max(6, Math.min(VIEW_W - 6 - w, xa))
    const y = Math.max(30, Math.min(VIEW_H - 16 - PLANK_H, Math.min(ya, ya + dy)))
    return { x, y, w, h: PLANK_H }
  }

  /** spend the OLDEST swallow in the queue and draw with its color */
  private createPlank(x: number, y: number, w: number, opts?: { stranger?: boolean }): void {
    const color: InkColor = opts?.stranger ? 'black' : (this.inkCharges.shift() ?? 'black')
    if (!opts?.stranger) this.stats.planksDrawn++
    this.planks.push({
      id: `plank-${++this.plankSeq}`,
      x,
      y,
      w,
      h: PLANK_H,
      born: this.time,
      life: opts?.stranger ? STRANGER_LIFE : PLANK_LIFE,
      color,
      contact: 0,
      squash: 0,
      uncircled: false,
      stranger: !!opts?.stranger,
    })
    // soft cap: the 4th plank of YOURS erases your oldest early
    // (the stranger's line is never counted or spent this way)
    const mine = this.planks.filter((p) => !p.stranger)
    if (mine.length > SKETCH_MAX_PLANKS) {
      const oldest = mine[0]
      this.planks = this.planks.filter((p) => p.id !== oldest.id)
      this.audio.plankFade()
    }
    this.bumpUi()
  }

  // ---- THE NAMING label drift -----------------------------------------
  /** EngineLike: begin the label's wander (deterministic anchors off
   *  the exit door — one needs a deliberate jump, one a full jump up,
   *  one a short walk; all within ~150px of the door). */
  startLabelDrift(): void {
    const e = this.exitRect
    const c = (x: number, y: number): Vec => ({ x: x - LABEL_W / 2, y: y - LABEL_H / 2 })
    this.labelAnchors = [
      c(e.x - 60, e.y + 10), // off the ledge's left edge
      c(e.x + e.w + 40, e.y + 24), // beside the door, on the ledge
      c(e.x + e.w / 2, e.y - 55), // straight above the door
    ]
    this.labelDriftT0 = this.time
    this.labelRect = {
      x: this.labelAnchors[0].x,
      y: this.labelAnchors[0].y,
      w: LABEL_W,
      h: LABEL_H,
    }
  }

  /** EngineLike: re-attach the label above the door. */
  endLabelDrift(): void {
    this.labelAnchors = []
    const e = this.exitRect
    this.labelRect = { x: e.x + e.w / 2 - LABEL_W / 2, y: e.y - LABEL_H - 8, w: LABEL_W, h: LABEL_H }
  }

  private updateLabel(): void {
    if (!this.namingLost || this.labelAnchors.length === 0) return
    const n = this.labelAnchors.length
    const ph = (this.time - this.labelDriftT0) / LABEL_LEG_S
    const i = Math.floor(ph) % n
    const j = (i + 1) % n
    let k = ph - Math.floor(ph)
    k = k * k * (3 - 2 * k) // smoothstep — no corners
    const a = this.labelAnchors[i]
    const b = this.labelAnchors[j]
    const rm = reducedMotion()
    this.labelRect.x = a.x + (b.x - a.x) * k + (rm ? 0 : Math.sin(this.time * 1.7) * 3)
    this.labelRect.y = a.y + (b.y - a.y) * k + (rm ? 0 : Math.sin(this.time * 2.6) * 4)
  }

  private resolveX(p: PlayerRT): void {
    for (const pl of this.platforms) {
      if (!pl.solid) continue
      this.pushOutX(p, pl)
    }
    // sketched planks are always solid (never targeted by distortions)
    for (const pl of this.planks) this.pushOutX(p, pl)
  }

  private pushOutX(
    p: PlayerRT,
    pl: { x: number; y: number; w: number; h: number },
  ): void {
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

  private resolveY(p: PlayerRT): void {
    for (const pl of this.platforms) {
      if (!pl.solid) continue
      this.landOn(p, pl)
    }
    // sketched planks are always solid (never targeted by distortions);
    // red ink turns a real landing into a spring
    for (const pl of this.planks) this.landOnPlank(p, pl)
  }

  private landOn(
    p: PlayerRT,
    pl: { x: number; y: number; w: number; h: number; id: string },
  ): void {
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

  /** planks land like platforms EXCEPT red ink: a real fall (impact
   *  above RED_BOUNCE_MIN) rebounds at RED_BOUNCE_VY instead of
   *  grounding — momentum is kept, so red planks bridge gaps. Light
   *  taps still land, so you can stand on red to draw from it. */
  private landOnPlank(p: PlayerRT, pl: PlankRT): void {
    if (
      p.x < pl.x + pl.w &&
      p.x + p.w > pl.x &&
      p.y < pl.y + pl.h &&
      p.y + p.h > pl.y &&
      p.vy > 0 &&
      pl.color === 'red' &&
      p.prevVy >= RED_BOUNCE_MIN
    ) {
      p.y = pl.y - p.h
      p.vy = -RED_BOUNCE_VY
      p.grounded = false
      p.groundId = null
      p.coyote = 0
      pl.squash = 1
      this.stats.redBounces++
      this.audio.plankBounce()
      return
    }
    this.landOn(p, pl)
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

    // ink bottles (RE-INKING): +1 carried ink of the bottle's color,
    // until the page reloads. Full pen? the bottle waits.
    const pcx = p.x + p.w / 2
    const pcy = p.y + p.h / 2
    for (const d of this.inkDrops) {
      if (d.taken) continue
      if (this.inkCharges.length >= INK_MAX) break // bottles wait until you have room
      if (Math.hypot(pcx - d.at.x, pcy - d.at.y) < 30) {
        d.taken = true
        this.inkCharges.push(d.color)
        this.stats.inkCollected++
        this.pushNote(`+1 ${INK_COLORS[d.color].label}`, INK_COLORS[d.color].line)
        this.audio.inkPickup()
        this.bumpUi()
      }
    }

    // THE NAMING rescue: touch the wandering word to re-ink the door.
    // Deliberate but always optional — auto-restore still comes in ≤7s.
    if (this.namingLost) {
      const lr = this.labelRect
      const pad = 6
      if (
        p.x < lr.x + lr.w + pad &&
        p.x + p.w > lr.x - pad &&
        p.y < lr.y + lr.h + pad &&
        p.y + p.h > lr.y - pad
      ) {
        const rt = this.rules.get('naming')
        if (rt && rt.phase === 'forgotten') {
          this.restoreRule(rt, false) // same path as auto-restore…
          this.pushNote('re-inked.', RULES.naming.color) // …but say what happened
          this.audio.reInk()
        }
      }
    }

    // exit door — INERT while the name is forgotten
    const e = this.exitRect
    if (
      !this.namingLost &&
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

  /** final-page set piece: near the end of the climb, it panics */
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
    // endless: a fall spends a bookmark — the last one closes the book
    if (this.mode === 'endless') {
      this.bookmarks = Math.max(0, this.bookmarks - 1)
      this.pushNote(
        this.bookmarks > 0 ? `a bookmark slips away. ${this.bookmarks} left.` : 'the last bookmark…',
        '#b6452c',
        4.5,
      )
    }
    this.audio.stopWaver()
    this.audio.stopSketchLoop()
    this.sketchMode = false
    this.drag = null
    this.audio.erased()
    this.bumpUi()
  }

  /** soft recovery: everything back to STABLE — the softlock guard */
  private doRespawn(): void {
    // endless: out of bookmarks — the notebook closes on this run
    if (this.mode === 'endless' && this.bookmarks <= 0) {
      this.endEndlessRun()
      return
    }
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
    // the stranger redraws their line if it dried while you were gone
    if (this.roomDef.strangerPlank && !this.planks.some((q) => q.stranger)) {
      const sp = this.roomDef.strangerPlank
      this.createPlank(sp.x, sp.y, sp.w, { stranger: true })
    }
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
    this.audio.stopSketchLoop()
    this.sketchMode = false
    this.drag = null
    this.audio.roomClear()
    this.bumpUi()
  }

  private doAdvance(): void {
    this.switched = true
    if (this.mode === 'endless') {
      // the notebook just writes the next page — there is no last one
      this.loadEndless(this.endlessDepth + 1)
      this.bumpUi()
      return
    }
    if (this.roomIndex + 1 < ROOMS.length) {
      this.roomIndex++
      this.loadRoom(this.roomIndex)
      this.bumpUi()
    } else {
      this.status = 'victory'
      this.ending = this.observer.getEnding({
        drawn: this.stats.planksDrawn,
        pins: this.stats.totalPins,
      })
      this.audio.victory()
      this.bumpUi()
    }
  }

  /** endless run over: the score screen reads everything from the
   *  snapshot (stats + runTime + roomIndex); the SHELL owns the
   *  best-page persistence — the engine never touches localStorage. */
  private endEndlessRun(): void {
    this.status = 'gameover'
    this.audio.stopWaver()
    this.audio.stopSketchLoop()
    this.sketchMode = false
    this.drag = null
    this.audio.gameOver()
    this.bumpUi()
  }

  // ---- room lifecycle -----------------------------------------------
  loadRoom(i: number): void {
    this.loadRoomDef(ROOMS[i], i, 'room')
  }

  /** the single page-setup path — authored rooms and generated pages
   *  share everything except the label the margin note opens with */
  loadRoomDef(rd: RoomDef, i: number, label: 'room' | 'page'): void {
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
    this.pushNote(`${label} ${i + 1} — ${rd.name}`, INK, 3.5)
    this.nextEventAt = this.time + rd.firstEventDelay
    this.lastRespawnAt = this.time
    this.scriptFired = false
    this.scriptQueue = [] // filled only when the room's script triggers
    this.chargeRegenT = 0
    this.gravityOsc = false
    this.inputInverted = false
    this.jumpFactor = 1
    this.coyoteDisabled = false
    this.gripLost = false
    this.namingLost = false
    this.labelAnchors = []
    this.endLabelDrift()
    // RE-INKING state is page-scoped: a fresh page is blank paper
    this.inkCharges = []
    this.inkDrops = rd.inkDrops.map((d) => ({
      at: { x: d.x, y: d.y },
      taken: false,
      color: d.color ?? 'black',
    }))
    this.tears = []
    this.planks = []
    this.plankSeq = 0
    this.uncircleRoomCount = 0
    this.lastUncircleAt = -999
    this.strangerFarewellDone = false
    // the stranger's line, if this page has one — slightly wrong, on purpose
    if (rd.strangerPlank) {
      const sp = rd.strangerPlank
      this.createPlank(sp.x, sp.y, sp.w, { stranger: true })
    }
    this.sketchMode = false
    this.sketchOffset = { x: 40, y: 0 }
    this.drag = null
    this.skids = []
    this.skidClock = 0
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

  private pushNote(text: string, color?: string, dur = 4.2, shaky = false): void {
    this.notes.push({
      id: this.noteId++,
      text,
      color: color ?? INK,
      rot: (Math.random() * 2 - 1) * (shaky ? 0.055 : 0.03),
      t: 0,
      dur,
      shaky,
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

  // ---- dev/test helpers (debug hook + headless sims; harmless live) ----
  /** Force a rule's warning as if the scheduler had picked it. */
  debugStartWarning(id: RuleId): void {
    this.startWarning(id)
  }

  /** Top up carried ink (defaults to a full black queue). A color
   *  argument fills with that ink — handy for testing red/blue. */
  debugGrantInk(n: number = INK_MAX, color: InkColor = 'black'): void {
    const k = Math.max(0, Math.min(INK_MAX, n))
    this.inkCharges = Array.from({ length: k }, () => color)
    this.bumpUi()
  }

  /** jump straight into endless mode at a given depth (testing the
   *  deep pages without playing to them) */
  debugStartEndless(depth = 1): void {
    this.startEndless()
    if (depth > 1) this.loadEndless(depth)
  }
}
