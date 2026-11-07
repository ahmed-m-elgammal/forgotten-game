// ============================================================
// endless.ts — THE MARGINS: the notebook keeps writing pages.
// ------------------------------------------------------------
// v1.2. A pure generator: depth in (1, 2, 3, …), one RoomDef out.
// The engine and renderer cannot tell a generated page from an
// authored one — the campaign stays data, endless mode is data
// too, just written on the fly.
//
// FAIRNESS (mirrors the completability math atop rooms.ts):
//   · jump height ≈ 131px  → climbs kept ≤ ENDLESS_MAX_CLIMB (88)
//   · flat gap reach ≈ 235px, weakened-jump reach ≈ 105px →
//     floor gaps ≤ ENDLESS_MAX_GAP (170) AND any gap over 130px
//     sits after a ≥200px run-up floor
//   · ledge-to-ledge reach ≤ ENDLESS_MAX_LEDGE_GAP (110)
//   · the door always rests on something solid; a high door's
//     ledge is noDistort so THE GROUND can never strand the exit
// assertRoom() (bottom) re-audits every generated page — the
// headless test in scripts/verify-endless.ts runs it on hundreds.
// ============================================================
import type { InkColor, PlatformDef, RoomDef, RuleId } from './types'
import {
  ENDLESS_MAX_CLIMB,
  ENDLESS_MAX_GAP,
  ENDLESS_MAX_LEDGE_GAP,
  ENDLESS_MIN_EVENT,
  ENDLESS_MIN_WARN,
} from './types'

// ---- word pools (the notebook's endless handwriting) ---------------
const NAMES = [
  'Margins',
  'Stitches',
  'Footnotes',
  'Inkwells',
  'Blotting',
  'Marginalia',
  'Dog-Ears',
  'Erasures',
  'Palimpsest',
  'Watermarks',
  'Bleed-Through',
  'Underscores',
  'Loose Leaves',
  'Carbon Copy',
  'Draft Two',
]
const SUBTITLES = [
  'the notebook keeps writing',
  'the rules are thinner here',
  'it remembers you were here',
  'a page written in a hurry',
  'the ink is still settling',
  'something is pacing in the margins',
  'this page was not meant to be read',
  'the handwriting leans forward',
  'it copies your habits onto the page',
  'the paper barely holds the rules',
]
const INTROS = [
  'another page. it keeps going.',
  'the margins lean closer the deeper you go.',
  'it writes faster down here.',
  'the rules here have been read too many times.',
  'keep what matters. let the rest blur.',
  'it is writing these pages about you.',
]
const FIRST_INTROS = [
  'no last page. the notebook keeps writing.',
  'three bookmarks. every fall spends one.',
  'when the last bookmark goes, the notebook closes.',
]

// ---- tiny helpers ----------------------------------------------------
const ri = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a + 1))
const rf = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

let uid = 0 // global platform-id uniqueness across every generated page

// ---- difficulty curve ------------------------------------------------
/** which rules live on this page — the deeper, the thinner the paper */
function rulesFor(depth: number): RoomDef['activeRules'] {
  const chosen = new Set<RuleId>(['gravity', 'jump'])
  chosen.add(Math.random() < 0.5 ? 'collision' : 'platforms') // surfaces from page one
  if (depth >= 3) chosen.add(pick(['collision', 'platforms', 'direction'] as const))
  if (depth >= 5) chosen.add(pick(['direction', 'grip'] as const))
  if (depth >= 7) chosen.add('grip')
  if (depth >= 9) chosen.add('naming')
  // registry order keeps the token row deterministic
  const order: RuleId[] = ['gravity', 'jump', 'collision', 'platforms', 'direction', 'grip', 'naming']
  return order.filter((id) => chosen.has(id))
}

function pacingFor(depth: number): Pick<
  RoomDef,
  'firstEventDelay' | 'eventInterval' | 'warnDuration' | 'memorySlots' | 'maxCharges'
> {
  return {
    firstEventDelay: clamp(11 - depth * 0.5, 6, 11),
    eventInterval: [
      clamp(10.5 - depth * 0.4, ENDLESS_MIN_EVENT, 10.5),
      clamp(15 - depth * 0.45, ENDLESS_MIN_EVENT + 2.5, 15),
    ],
    warnDuration: clamp(3.5 - depth * 0.12, ENDLESS_MIN_WARN, 3.5),
    memorySlots: depth < 8 ? 2 : 3,
    maxCharges: depth < 4 ? 3 : 4,
  }
}

function inksFor(depth: number, ledgeTops: PlatformDef[]): RoomDef['inkDrops'] {
  const drops: RoomDef['inkDrops'] = []
  // one easy black near the start, always — drawing is never locked out
  drops.push({ x: rf(140, 260), y: 525, color: 'black' as InkColor })
  if (ledgeTops.length > 0) {
    const l = pick(ledgeTops)
    const color: InkColor = depth < 3 ? 'red' : pick(['red', 'blue', 'blue', 'black'] as const)
    drops.push({ x: l.x + l.w * rf(0.3, 0.7), y: l.y - 15, color })
  }
  if (depth >= 4 && ledgeTops.length > 1) {
    const l = pick(ledgeTops)
    drops.push({ x: l.x + l.w * rf(0.25, 0.75), y: l.y - 15, color: pick(['red', 'blue'] as const) })
  }
  return drops
}

/**
 * THE GENERATOR. depth 1 is the first page after the campaign's
 * last one; the HUD keeps the campaign count going (page 9, 10, …)
 * because the engine stores endless pages at roomIndex 8+depth-1.
 */
export function endlessRoom(depth: number): RoomDef {
  const gapMax = clamp(90 + depth * 9, 100, ENDLESS_MAX_GAP) // 99→170
  const climb = depth >= 4 && Math.random() < clamp(0.15 + depth * 0.03, 0, 0.55)
  const plats: PlatformDef[] = []
  const ledgeTops: PlatformDef[] = []

  // ---- floors, left → right (fairness is built in, not patched on)
  const floorCount = depth < 3 ? 3 : ri(2, 3)
  {
    let x = 0
    for (let i = 0; i < floorCount; i++) {
      const isLast = i === floorCount - 1
      const roomLeft = 960 - x
      let w = isLast ? roomLeft : Math.min(ri(200, 320), roomLeft - 220)
      if (x + w > 960) w = 960 - x
      if (w < 130) break // cannot fit a fair page — keep what we have
      plats.push({ id: `d${depth}-${uid++}`, x, y: 540, w, h: 60, kind: 'floor' })
      if (isLast) break
      // the gap AFTER this floor is sized by THIS floor's width —
      // a gap over 130px only ever follows a ≥200px run-up floor
      const ceil = w >= 200 ? gapMax : 130
      const gap = clamp(960 - (x + w) - 140, 0, ceil)
      if (gap < 70) {
        // no room for another fair floor + gap: seal to the edge
        plats[plats.length - 1].w = 960 - x
        break
      }
      x = x + w + gap
    }
  }

  // ---- the scenic ledge route (starts above floor one) -------------
  const steps = depth < 3 ? ri(2, 3) : ri(3, 5)
  let lx = clamp(plats[0].x + ri(90, 170), 40, 700)
  let ly = 540 - ri(72, ENDLESS_MAX_CLIMB)
  for (let i = 0; i < steps; i++) {
    const w = ri(100, 140)
    const l: PlatformDef = { id: `d${depth}-${uid++}`, x: lx, y: ly, w, h: 16, kind: 'ledge' }
    plats.push(l)
    ledgeTops.push(l)
    // next: up ≤88 and across ≤110, drifting right toward the door
    ly = clamp(ly - ri(30, ENDLESS_MAX_CLIMB), climb ? 260 : 300, 470)
    lx = clamp(lx + w + ri(20, ENDLESS_MAX_LEDGE_GAP), 30, 700)
  }

  // ---- the exit door -------------------------------------------------
  let exit: RoomDef['exit']
  if (climb) {
    // perched high on the right, one deliberate jump from the top of
    // the ledge route; noDistort so THE GROUND can never strand it.
    // Anchored to the LAST PUSHED ledge (the loop's `ly` has already
    // stepped past it) so both the rise and the gap stay in reach.
    const dlw = ri(130, 160)
    const routeTop = ledgeTops[ledgeTops.length - 1]
    const routeRight = routeTop.x + routeTop.w
    const dlx = Math.min(950 - dlw, routeRight + ri(20, ENDLESS_MAX_LEDGE_GAP))
    const dly = Math.max(190, routeTop.y - ri(40, ENDLESS_MAX_CLIMB - 8))
    plats.push({ id: `d${depth}-${uid++}`, x: dlx, y: dly, w: dlw, h: 16, kind: 'ledge', noDistort: true })
    exit = { x: dlx + Math.floor(dlw / 2) - 30, y: dly - 70, w: 60, h: 70 }
    ledgeTops.push(plats[plats.length - 1])
  } else {
    const lastFloor = plats.filter((p) => p.kind === 'floor').slice(-1)[0]
    const dx = clamp(ri(820, 870), lastFloor.x + 50, lastFloor.x + lastFloor.w - 110)
    exit = { x: dx, y: 470, w: 60, h: 70 }
  }

  // ---- the stranger's line (deep-page cameo) -------------------------
  let strangerPlank: RoomDef['strangerPlank']
  if (depth >= 5 && Math.random() < 0.22) {
    const fs = plats.filter((p) => p.kind === 'floor').sort((a, b) => a.x - b.x)
    let bestGap = 0
    let prev: PlatformDef | null = null
    for (let i = 1; i < fs.length; i++) {
      const g = fs[i].x - (fs[i - 1].x + fs[i - 1].w)
      if (g > bestGap) {
        bestGap = g
        prev = fs[i - 1]
      }
    }
    if (prev && bestGap >= 100) {
      strangerPlank = { x: prev.x + prev.w - 14, y: 524, w: Math.min(bestGap + 24, 150) }
    }
  }

  // ---- checkpoint: mid-room floor --------------------------------------
  const fs = plats.filter((p) => p.kind === 'floor')
  const cpFloor = fs[Math.min(1, fs.length - 1)]
  const checkpoint = { x: cpFloor.x + cpFloor.w * 0.55, y: 540 }

  const pacing = pacingFor(depth)
  const introBase = depth === 1 ? [...FIRST_INTROS, pick(INTROS)] : [pick(INTROS), pick(INTROS)]
  const introNotes = Array.from(new Set(introBase)).slice(0, depth === 1 ? 3 : 2)

  const rd: RoomDef = {
    index: depth - 1,
    name: pick(NAMES),
    subtitle: pick(SUBTITLES),
    spawn: { x: 60, y: 510 },
    platforms: plats,
    exit,
    checkpoint,
    activeRules: rulesFor(depth),
    firstEventDelay: pacing.firstEventDelay,
    eventInterval: pacing.eventInterval,
    warnDuration: pacing.warnDuration,
    memorySlots: pacing.memorySlots,
    maxCharges: pacing.maxCharges,
    introNotes,
    inkDrops: inksFor(depth, ledgeTops),
    ...(strangerPlank ? { strangerPlank } : {}),
  }
  const err = assertRoom(rd)
  if (err)
    throw new Error(
      `endless generator violated fairness at depth ${depth}: ${err}\nplatforms: ${rd.platforms
        .map((p) => `${p.kind}(${p.x.toFixed(0)},${p.y},w${p.w})`)
        .join(' ')}`, 
    )
  return rd
}

/** right edge of a platform (local helper for the door-ledge reach) */
function w_of(plats: PlatformDef[], i: number): number {
  const p = plats[i]
  return p ? p.x + p.w : 0
}

// ---- the fairness auditor (also used by the headless test) -----------
/** Returns a human-readable violation, or null if the page is fair. */
export function assertRoom(rd: RoomDef): string | null {
  const floors = rd.platforms.filter((p) => p.kind === 'floor')
  const ledges = rd.platforms.filter((p) => p.kind === 'ledge')

  // floors: every inter-floor gap ≤ ENDLESS_MAX_GAP, and any gap
  // over 130 must have ≥200px of run-up floor before it
  const sorted = [...floors].sort((a, b) => a.x - b.x)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w)
    if (gap > ENDLESS_MAX_GAP) return `floor gap ${gap}px > ${ENDLESS_MAX_GAP}`
    if (gap > 130 && sorted[i - 1].w < 200)
      return `gap ${gap}px lacks a 200px run-up (floor ${sorted[i - 1].w}px)`
  }

  // door: inside the page, bottom edge resting on a real platform top
  const e = rd.exit
  if (e.x < 0 || e.x + e.w > 960 || e.y < 0 || e.y + e.h > 600) return 'door outside the page'
  const rest = rd.platforms.find(
    (p) => Math.abs(p.y - (e.y + e.h)) <= 2 && e.x >= p.x - 2 && e.x + e.w <= p.x + p.w + 2,
  )
  if (!rest) return 'door floats: bottom edge not on a platform top'
  if (e.y + e.h < 400 && !rest.noDistort) return 'high door rests on a distortable ledge'

  // every ledge reachable from some other surface: a JUMP of ≤88px
  // (canvas y grows downward, so "above" = smaller y), or a drop of
  // ≤260px onto it (falling is free); horizontal gap ≤110
  for (const l of ledges) {
    const reach = rd.platforms.some((p) => {
      if (p === l) return false
      const rise = p.y - l.y // positive: the ledge sits above p
      if (rise > ENDLESS_MAX_CLIMB || rise < -260) return false
      const hx = Math.max(0, Math.max(p.x - (l.x + l.w), l.x - (p.x + p.w)))
      return hx <= ENDLESS_MAX_LEDGE_GAP
    })
    if (!reach) return `ledge ${l.id} unreachable (x=${l.x.toFixed(0)} y=${l.y.toFixed(0)} w=${l.w} — no surface within 88px rise/260px drop + 110px across)`
  }

  // spawn floor exists under the spawn point; pacing never breaks its floors
  if (!floors.some((f) => rd.spawn.x >= f.x && rd.spawn.x <= f.x + f.w)) return 'spawn off the floor'
  if (rd.warnDuration < ENDLESS_MIN_WARN - 1e-9) return 'warn too short'
  if (rd.eventInterval[0] < ENDLESS_MIN_EVENT - 1e-9) return 'events too fast'
  return null
}
