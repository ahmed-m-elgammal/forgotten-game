// ============================================================
// observer.ts — THE OBSERVER: the notebook watches you play.
// ------------------------------------------------------------
// The signature twist. We track three tendencies:
//   · pinCount per rule          → "you always keep GRAVITY"
//   · jumps in a rolling window  → the restlessness ending
//   · cumulative stand-time per platform → "you love that ledge"
// When a tendency crystallises, the world says so in the margin
// (at most twice per rule per room), and afterwards biases its
// forgetting 65% toward the habit — while the WARNING SYSTEM
// STAYS EXACTLY AS FAIR AS EVER. Observation is cumulative across
// rooms, which is also what powers the personalized ending.
// ============================================================
import type { EndingInfo, RuleId } from './types'
import { RULES } from './rules'

const BIAS = 0.65 // how strongly the Observer targets your habit
const PIN_HABIT_THRESHOLD = 3 // pins of one rule before it "notices"
const PERCH_TIME = 6 // seconds on one ledge before it counts
const NOTE_ECHO_S = 25 // seconds between repeated observation notes
const JUMP_WINDOW = 30 // rolling window for jump tracking (seconds)

export interface TickNote {
  text: string
  color: string
  hum: boolean
}

const RESTLESS_ENDING: EndingInfo = {
  heading: 'RESTLESSNESS',
  line: 'You never chose what to keep — you just kept moving. The world remembers your restlessness.',
}

const RULE_ENDINGS: Record<RuleId, string> = {
  gravity:
    'You kept the falling. The world falls softly for you now, and you are no longer afraid of the ground.',
  collision:
    'You kept the touch. Things stayed solid because you believed in surfaces.',
  platforms:
    'You kept the ground. The floor learned its name from you.',
  direction:
    'You kept left and right. The two ways will remember which is which.',
  jump: 'You kept the leap. Somewhere, a small figure is still mid-air because you said so.',
  grip: 'You kept the grip. Nothing slid away while you held on — the world stayed where you put it.',
  naming:
    'You kept the name. As long as you kept calling it OUT?, the door remembered how to be a door.',
}

export class Observer {
  /** cumulative across the whole run — this IS the ending data.
   *  Key order = registry order, which also makes topKept()'s
   *  strict-greater comparison a deterministic tie-break. */
  pinCount: Record<RuleId, number> = {
    gravity: 0,
    collision: 0,
    platforms: 0,
    direction: 0,
    jump: 0,
    grip: 0,
    naming: 0,
  }
  totalJumps = 0
  totalPins = 0

  private jumpTimes: number[] = []
  private standAll = new Map<string, { kind: 'floor' | 'ledge'; t: number }>()
  private standRoom = new Map<string, number>()
  private roomNoteCount = new Map<string, number>()
  /** cumulative seconds the player has ridden each drawn plank
   *  (v1.1) — the raw material for "it uncircles your plank." */
  private plankRides = new Map<string, number>()

  private habitRule: RuleId | null = null
  private lastHabitNoteAt = -999
  private favoriteId: string | null = null
  private lastPerchNoteAt = -999

  // ---- event feeds (engine calls these) ---------------------------
  onPin(id: RuleId): void {
    this.pinCount[id]++
    this.totalPins++
  }

  onJump(now: number): void {
    this.totalJumps++
    this.jumpTimes.push(now)
  }

  addStand(id: string, kind: 'floor' | 'ledge', dt: number): void {
    const e = this.standAll.get(id) ?? { kind, t: 0 }
    e.t += dt
    this.standAll.set(id, e)
    this.standRoom.set(id, (this.standRoom.get(id) ?? 0) + dt)
  }

  /** the player stood on a drawn plank (v1.1) */
  onPlankRide(id: string, dt: number): void {
    this.plankRides.set(id, (this.plankRides.get(id) ?? 0) + dt)
  }

  /** how long the player has ridden this plank in total */
  plankRide(id: string): number {
    return this.plankRides.get(id) ?? 0
  }

  /** the most-ridden plank id, or null (used to pick the uncircle target) */
  mostRiddenPlank(minRide: number): string | null {
    let best: string | null = null
    let bestT = minRide
    this.plankRides.forEach((t, id) => {
      if (t > bestT) {
        bestT = t
        best = id
      }
    })
    return best
  }

  /** per-room counters reset when a page opens */
  resetRoom(): void {
    this.standRoom.clear()
    this.roomNoteCount.clear()
  }

  // ---- perception loop (engine calls once per frame) ---------------
  tick(now: number): TickNote[] {
    const out: TickNote[] = []
    while (this.jumpTimes.length && now - this.jumpTimes[0] > JUMP_WINDOW) {
      this.jumpTimes.shift()
    }

    // — rule habit: "it notices: you always keep GRAVITY." —
    let top: RuleId | null = null
    let topN = 0
    for (const id of Object.keys(this.pinCount) as RuleId[]) {
      if (this.pinCount[id] > topN) {
        top = id
        topN = this.pinCount[id]
      }
    }
    if (top && topN >= PIN_HABIT_THRESHOLD) {
      if (this.habitRule !== top) {
        this.habitRule = top
        out.push(this.emitRuleNote())
        this.lastHabitNoteAt = now
      } else if (
        now - this.lastHabitNoteAt > NOTE_ECHO_S &&
        (this.roomNoteCount.get('rule:' + top) ?? 0) < 2
      ) {
        out.push(this.emitRuleNote())
        this.lastHabitNoteAt = now
      }
    }

    // — favorite perch: "it notices: you love that ledge." —
    let best: string | null = null
    let bestT = 0
    let second = 0
    this.standRoom.forEach((t, id) => {
      const meta = this.standAll.get(id)
      if (!meta || meta.kind !== 'ledge') return
      if (t > bestT) {
        second = bestT
        bestT = t
        best = id
      } else if (t > second) {
        second = t
      }
    })
    if (best && bestT >= PERCH_TIME && bestT >= second * 2) {
      if (this.favoriteId !== best) {
        this.favoriteId = best
        out.push(this.emitPerchNote())
        this.lastPerchNoteAt = now
      } else if (
        now - this.lastPerchNoteAt > NOTE_ECHO_S &&
        (this.roomNoteCount.get('perch') ?? 0) < 2
      ) {
        out.push(this.emitPerchNote())
        this.lastPerchNoteAt = now
      }
    }

    return out
  }

  private emitRuleNote(): TickNote {
    const id = this.habitRule as RuleId
    const key = 'rule:' + id
    this.roomNoteCount.set(key, (this.roomNoteCount.get(key) ?? 0) + 1)
    return {
      text: `it notices: you always keep ${RULES[id].name}.`,
      color: RULES[id].color,
      hum: true,
    }
  }

  private emitPerchNote(): TickNote {
    this.roomNoteCount.set('perch', (this.roomNoteCount.get('perch') ?? 0) + 1)
    return {
      text: 'it notices: you love that ledge.',
      color: '#a2611c',
      hum: true,
    }
  }

  // ---- bias (used by the engine when picking forget targets) -------
  /** 65% toward the habit rule when it is a legal candidate. */
  biasedRule(candidates: RuleId[]): RuleId | null {
    if (candidates.length === 0) return null
    if (
      this.habitRule &&
      candidates.includes(this.habitRule) &&
      Math.random() < BIAS
    ) {
      return this.habitRule
    }
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  /** 65% chance the favorite ledge is targeted first, rest random. */
  biasedTargets(candidates: string[], count: number): string[] {
    const pool = [...candidates]
    const picked: string[] = []
    if (
      this.favoriteId &&
      pool.includes(this.favoriteId) &&
      Math.random() < BIAS
    ) {
      picked.push(this.favoriteId)
      pool.splice(pool.indexOf(this.favoriteId), 1)
    }
    while (picked.length < count && pool.length > 0) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return picked
  }

  // ---- the ending --------------------------------------------------
  topKept(): { rule: RuleId; count: number } | null {
    let top: RuleId | null = null
    let n = 0
    for (const id of Object.keys(this.pinCount) as RuleId[]) {
      if (this.pinCount[id] > n) {
        top = id
        n = this.pinCount[id]
      }
    }
    return top && n > 0 ? { rule: top, count: n } : null
  }

  /** the personalized ending, plus (v1.1) a coda about HOW you
   *  played: did you write the page back, or only hold it shut? */
  getEnding(style: { drawn: number; pins: number }): EndingInfo {
    const top = this.topKept()
    // fallback: pins were rare and the run was all motion
    if (!top || (top.count <= 1 && this.totalJumps >= 80)) {
      return { ...RESTLESS_ENDING, coda: this.coda(style) }
    }
    return {
      heading: `WHAT YOU KEPT: ${RULES[top.rule].name}`,
      line: RULE_ENDINGS[top.rule],
      coda: this.coda(style),
    }
  }

  private coda(s: { drawn: number; pins: number }): string | undefined {
    if (s.drawn >= 6) {
      return 'You wrote back. The margins will keep your handwriting long after the pages stop turning.'
    }
    if (s.drawn >= 1 && s.pins >= 8) {
      return 'You held on with one hand and drew with the other. The notebook noticed both.'
    }
    if (s.drawn === 0) {
      return 'You never drew a single line — you only held on. The notebook respects that, in its way.'
    }
    return undefined
  }
}
