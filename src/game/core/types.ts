// ============================================================
// THE GAME THAT FORGOT YOU — shared types & tuning constants
// ------------------------------------------------------------
// WHY this file exists: every module (rules, rooms, observer,
// engine, renderer, input, shell) speaks this one vocabulary.
// The campaign, the physics feel and the memory economy are all
// tuned from the constants at the bottom of this file.
// ============================================================

/** Logical canvas size. The world is authored at exactly this
 *  size and letterboxed to the window, so every rule distance
 *  (jump arcs, gap widths) is identical on every machine. */
export const VIEW_W = 960
export const VIEW_H = 600

export type RuleId =
  | 'gravity'
  | 'collision'
  | 'platforms'
  | 'direction'
  | 'jump'
  | 'grip'
  | 'naming'

export type RulePhase = 'stable' | 'warned' | 'forgotten'

/** The three inks (v1.1). Black draws an ordinary plank; red ink
 *  springs (bouncy); blue ink is brittle (tears after ~2s of standing).
 *  Carried ink is a FIFO queue of these — the oldest swallow is what
 *  the next stroke spends, so the HUD shows the queue in order. */
export type InkColor = 'black' | 'red' | 'blue'

export type GameStatus =
  | 'title'
  | 'playing'
  | 'paused'
  | 'dead' // page-flip transition after falling into the margin
  | 'roomclear' // page-turn transition between rooms
  | 'victory'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Vec {
  x: number
  y: number
}

/** Static platform data as authored in ROOMS. */
export interface PlatformDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  kind: 'floor' | 'ledge' // floors can NEVER be made passable by SOLIDITY
  noDistort?: boolean // e.g. the platform carrying the exit door in room 5
}

/** A hand-drawn plank the player sketched with ink (RE-INKING).
 *  Purely a solid AABB with a drying timer — it never moves, is
 *  never targeted by other rules' distortions, and never counts
 *  as an Observer perch habit. */
export interface PlankRT {
  id: string
  x: number
  y: number
  w: number
  h: number
  born: number // engine time when it was drawn
  life: number // seconds before it dries out and fades
  color: InkColor // which ink the stroke spent (red springs, blue tears)
  contact: number // seconds the player has STOOD on it (blue tears at a cap)
  squash: number // 1→0 bounce animation clock (red planks)
  uncircled: boolean // the Observer struck a circle through this one
  stranger: boolean // not yours — the room came with it (Imitation)
}

/** Live platform state the simulation mutates each frame. */
export interface DriftState {
  amp: number // sine amplitude in px (30–80 per spec)
  period: number // seconds per full swing (3–5 per spec)
  startT: number // engine time when the drift began (so it starts at rest)
}

export interface EaseState {
  fx: number
  fy: number
  t: number
  dur: number
}

export interface PlatformRT extends PlatformDef {
  homeX: number
  homeY: number // authored position — drift orbits this, ease returns to it
  prevX: number
  prevY: number // position last frame — used to carry the player
  solid: boolean // false while SOLIDITY forgot this one
  ghost: boolean // visual flag for passable platforms
  drift: DriftState | null // active while THE GROUND forgets it
  ease: EaseState | null // flying home after the drift ends
}

export interface TrailDot {
  x: number
  y: number
  t: number
}

export interface PlayerRT {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  grounded: boolean
  groundId: string | null
  facing: 1 | -1
  walkPhase: number
  landTimer: number
  coyote: number
  jumpBuffer: number
  prevVy: number
  trail: TrailDot[]
  trailClock: number
}

/** A handwritten margin note (top-right stack, or the big center note). */
export interface NoteRT {
  id: number
  text: string
  color: string
  rot: number // radians — tiny, for the handwritten feel
  t: number // age in seconds
  dur: number
  shaky?: boolean // the Observer's handwriting — wobbles as it dries
}

/** Per-rule runtime: state machine + pin bookkeeping + targets. */
export interface RuleRuntime {
  id: RuleId
  phase: RulePhase
  timer: number // seconds left in the current non-stable phase
  pinUntil: number // engine time when the paper clip pops off (0 = not pinned)
  targets: string[] // platform ids this rule's distortion affects
}

export interface EndingInfo {
  heading: string
  line: string
  coda?: string // v1.1: a second line about HOW you played (drawing vs holding)
}

export interface RunStats {
  pagesCleared: number
  erased: number
  jumps: number
  forgotten: Record<RuleId, number>
  totalPins: number
  planksDrawn: number
  inkCollected: number
  redBounces: number // landings that turned into red-ink springs
  blueTears: number // brittle planks torn while standing on them
}

export interface UiStats {
  pagesCleared: number
  erased: number
  jumps: number
  forgotten: Record<RuleId, number>
  topKept: { rule: RuleId; count: number } | null
  planksDrawn: number
  inkCollected: number
  redBounces: number
  blueTears: number
}

/** What the engine tells React, once per UI-relevant change. */
export interface UiSnapshot {
  version: number
  status: GameStatus
  roomIndex: number
  roomCount: number
  roomName: string
  roomSubtitle: string
  charges: number
  maxCharges: number
  slots: number
  pinnedCount: number
  erased: number
  ink: number
  inkMax: number
  muted: boolean
  legendOpen: boolean
  selectedRule: RuleId | null
  ending: EndingInfo | null
  stats: UiStats | null
}

/** Identity of each ink: body fill, line color, HUD name. Kept in
 *  types (not the renderer) so rooms/audio/debug tools can use it. */
export const INK_COLORS: Record<InkColor, { body: string; line: string; label: string }> = {
  black: { body: '#1c1813', line: '#2b2620', label: 'ink.' },
  red: { body: '#c23a2b', line: '#a92f22', label: 'red ink.' },
  blue: { body: '#39628f', line: '#2d4f75', label: 'blue ink.' },
}

/** Authoring shape for one page of the campaign. The whole game
 *  is tuned by editing ROOMS — no engine changes needed. */
export interface RoomDef {
  index: number
  name: string
  subtitle: string
  spawn: Vec
  platforms: PlatformDef[]
  exit: Rect // the OUT? door; its bottom edge must sit on a platform top
  checkpoint: Vec // a point on a platform top (the ink anchor knot)
  activeRules: RuleId[]
  memorySlots: number // simultaneous pins allowed on this page
  maxCharges: number // charge cap (and starting amount) on this page
  firstEventDelay: number // seconds before the first forget event
  eventInterval: [number, number]
  warnDuration: number // seconds of telegraphing (room 1 is longer)
  introNotes: string[] // staggered handwritten lines when the page opens
  inkDrops: Array<{ x: number; y: number; color?: InkColor }> // bottles (color defaults to black)
  /** A plank the page came with (Imitation room): drawn by someone
   *  else, slightly wrong, rendered in graphite. Optional. */
  strangerPlank?: { x: number; y: number; w: number }
  script?: {
    // optional late-page set piece (room 5): when the player is deep
    // in the climb (x > whenX and y < whenYMax), warn these rules in
    // quick succession — sequential, still fully telegraphed.
    whenX: number
    whenYMax: number
    rules: RuleId[]
  }
}

/** Narrow view of the engine that rule distortions manipulate.
 *  WHY an interface: rules.ts never imports engine.ts — no circular
 *  imports, and the distortion logic stays small and declarative. */
export interface EngineLike {
  time: number
  platforms: PlatformRT[]
  gravityOsc: boolean
  inputInverted: boolean
  jumpFactor: number
  coyoteDisabled: boolean
  gripLost: boolean // THE GRIP forgotten: icy friction
  namingLost: boolean // THE NAMING forgotten: door inert, label adrift
  rand(): number
  platformById(id: string): PlatformRT | undefined
  /** begin/end the OUT? label's wander (THE NAMING distortion).
   *  WHY methods: the anchor geometry is derived from the exit door,
   *  which only the engine knows. */
  startLabelDrift(): void
  endLabelDrift(): void
}

// ---- physics tuning (px, seconds) --------------------------------
// Jump math for designers: max jump height ≈ v²/2g = 760²/4400 ≈ 131px,
// flat gap reach ≈ 2v/g · speed ≈ 0.69s · 340 ≈ 235px. Rooms keep
// climbs < ~90px and gaps < ~200px so every page stays completable
// even while a rule is misbehaving.
export const MOVE_SPEED = 340
export const GRAVITY = 2200
export const JUMP_V = 760
export const COYOTE = 0.1
export const JUMP_BUFFER = 0.12
export const PLAYER_W = 22
export const PLAYER_H = 30

// ---- THE GRIP tuning (icy friction) --------------------------------
// While gripLost: pushing accelerates weakly up to GRIP_TOP_SPEED
// (a touch above MOVE_SPEED — momentum), releasing does NOT brake:
// only a tiny drag applies. Stop early. Start slow.
export const GRIP_ACCEL = 850 // px/s² while input held (was 2600)
export const GRIP_TOP_SPEED = 390 // |vx| clamp while sliding
export const GRIP_DRAG = 0.12 // exponential vx decay per second, released

// ---- RE-INKING tuning (sketched planks) ----------------------------
export const INK_MAX = 3 // carried ink capacity (the queue length)
export const PLANK_LIFE = 8 // seconds before a drawn plank dries away
export const PLANK_H = 12
export const PLANK_MIN_W = 60
export const PLANK_MAX_W = 240
export const PLANK_MAX_SLOPE = 0.55 // ~29° — planks stay walkable
export const PLANK_DRAG_MIN = 40 // min mouse-stroke length to draw
export const SKETCH_MAX_PLANKS = 3 // placing a 4th erases the oldest
export const GHOST_PLANK_W = 110 // keyboard ghost plank width

// ---- ink colors (v1.1) ----------------------------------------------
// red ink springs: any real fall onto a red plank rebounds at a fixed,
// generous velocity — bigger than a hop, smaller than a full jump —
// so red planks are trampolines, not floors. Impact below the floor
// value lands normally, so you can still place them under your feet.
export const RED_BOUNCE_VY = 650 // rebound speed (≈96px of height)
export const RED_BOUNCE_MIN = 260 // min impact speed that triggers the spring
export const SQUASH_TIME = 0.16 // squash-and-stretch clock on a bounce
// blue ink is brittle: it tears after this much CUMULATIVE standing
// (walking across counts; falls through the top do not)
export const BRITTLE_LIFE = 2.2
export const STRANGER_LIFE = 26 // the Imitation room's pre-drawn plank

// ---- the Observer writes back (v1.1) --------------------------------
// Stand on one of your planks this long and the Observer uncircles
// it: the plank's remaining life is cut to 45%, in graphite.
export const UNCIRCLE_RIDE = 3 // seconds ridden before it reacts
export const UNCIRCLE_COOLDOWN = 8 // seconds between reactions
export const UNCIRCLE_MAX_PER_ROOM = 2
export const UNCIRCLE_CUT = 0.45 // remaining-life multiplier

// ---- memory economy tuning ---------------------------------------
export const PIN_DURATION = 12 // a kept rule is immune for this long
export const CHARGE_REGEN = 11 // seconds to regain one memory charge

export const TOKEN_R = 26
