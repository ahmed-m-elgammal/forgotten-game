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
}

export interface RunStats {
  pagesCleared: number
  erased: number
  jumps: number
  forgotten: Record<RuleId, number>
  totalPins: number
  planksDrawn: number
  inkCollected: number
}

export interface UiStats {
  pagesCleared: number
  erased: number
  jumps: number
  forgotten: Record<RuleId, number>
  topKept: { rule: RuleId; count: number } | null
  planksDrawn: number
  inkCollected: number
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
  inkDrops: Vec[] // collectible ink bottles for sketching (RE-INKING)
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
export const INK_MAX = 3 // carried ink capacity
export const PLANK_LIFE = 8 // seconds before a drawn plank dries away
export const PLANK_H = 12
export const PLANK_MIN_W = 60
export const PLANK_MAX_W = 240
export const PLANK_MAX_SLOPE = 0.55 // ~29° — planks stay walkable
export const PLANK_DRAG_MIN = 40 // min mouse-stroke length to draw
export const SKETCH_MAX_PLANKS = 3 // placing a 4th erases the oldest
export const GHOST_PLANK_W = 110 // keyboard ghost plank width

// ---- memory economy tuning ---------------------------------------
export const PIN_DURATION = 12 // a kept rule is immune for this long
export const CHARGE_REGEN = 11 // seconds to regain one memory charge

export const TOKEN_R = 26
