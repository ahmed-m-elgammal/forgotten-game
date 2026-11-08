// ============================================================
// verify-endless.ts — headless fairness audit for THE MARGINS.
// Run: bun scripts/verify-endless.ts
// Generates hundreds of pages across depths and re-audits each
// one with assertRoom(); also smoke-runs the full state machine
// (start endless → clear pages → spend bookmarks → gameover)
// against a fake audio backend. Zero canvas, zero DOM.
// ============================================================
import { endlessRoom, assertRoom } from '../src/game/core/endless'
import type { RoomDef } from '../src/game/core/types'

let pass = 0
let fail = 0
const failures: string[] = []

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++
  } else {
    fail++
    failures.push(`${label}${detail ? ' — ' + detail : ''}`)
  }
}

// ---- 1. the generator never breaks fairness -------------------------
const DEPTHS = 300
const viol = new Map<string, number>()
for (let d = 1; d <= DEPTHS; d++) {
  // three pages per depth — different rolls, same rules
  for (let k = 0; k < 3; k++) {
    let rd: RoomDef
    try {
      rd = endlessRoom(d)
    } catch (e) {
      check(`depth ${d} roll ${k} generator threw`, false, String(e))
      continue
    }
    const err = assertRoom(rd)
    if (err) viol.set(err, (viol.get(err) ?? 0) + 1)
    // structural invariants the auditor can't see
    check(`depth ${d}.${k} has ≥2 floors`, rd.platforms.filter((p) => p.kind === 'floor').length >= 2)
    check(`depth ${d}.${k} has ink`, rd.inkDrops.length >= 2)
    check(`depth ${d}.${k} has ≥2 rules`, rd.activeRules.length >= 2)
    check(`depth ${d}.${k} has intro notes`, rd.introNotes.length >= 1)
    if (d >= 9) {
      check(`depth ${d}.${k} deep page includes naming`, rd.activeRules.includes('naming'))
    }
    // pacing floors
    check(`depth ${d}.${k} warn ≥2.5`, rd.warnDuration >= 2.5)
    check(`depth ${d}.${k} event[0] ≥6.5`, rd.eventInterval[0] >= 6.5)
    check(`depth ${d}.${k} interval ordered`, rd.eventInterval[0] <= rd.eventInterval[1])
  }
}
check(
  'zero fairness violations',
  viol.size === 0,
  [...viol.entries()].map(([k, n]) => `${k} ×${n}`).join('; '),
)

// ---- 2. climb layouts exist and are fair (forced sampling) ----------
let climbs = 0
for (let k = 0; k < 400; k++) {
  const rd = endlessRoom(12)
  if (rd.exit.y + rd.exit.h < 400) {
    climbs++
    const rest = rd.platforms.find(
      (p) =>
        Math.abs(p.y - (rd.exit.y + rd.exit.h)) <= 2 &&
        rd.exit.x >= p.x - 2 &&
        rd.exit.x + rd.exit.w <= p.x + p.w + 2,
    )
    check('climb door rests on a ledge', !!rest)
    check('climb door ledge is noDistort', !!rest?.noDistort)
  }
}
check('climb layouts actually generated', climbs > 40, `got ${climbs}/400`)

// ---- 3. smoke-run the ENGINE state machine headless -----------------
import { GameEngine } from '../src/game/core/engine'
const fakeAudio = new Proxy(
  {},
  { get: () => () => undefined },
) as unknown as import('../src/game/audio/synth').AudioEngine

const held = { left: false, right: false, up: false, down: false }
const eng = new GameEngine(fakeAudio, held)
check('boots to title', eng.status === 'title')

eng.debugStartEndless(1)
check('endless starts playing', eng.status === 'playing')
check('endless mode set', eng.mode === 'endless')
check('bookmarks = 3', eng.bookmarks === 3)
check('page number continues campaign', eng.roomIndex === 8) // page 9

// clear 3 pages by teleporting to the door (roomclear → doAdvance)
for (let i = 0; i < 3; i++) {
  const before = eng.roomIndex
  const p = eng.player
  const e = (eng as unknown as { exitRect: { x: number; y: number; w: number; h: number } }).exitRect
  p.x = e.x + e.w / 2 - p.w / 2
  p.y = e.y + e.h - p.h - 1
  p.vy = 0
  eng.update(1 / 60)
  // pump through the ~1.1s page-turn
  for (let t = 0; t < 120 && eng.status !== 'playing'; t++) eng.update(1 / 60)
  check(`page ${i + 1} advanced`, eng.roomIndex === before + 1, `roomIndex ${before}→${eng.roomIndex}`)
}
check('still endless after clearing', eng.mode === 'endless')
check('depth tracked', (eng as unknown as { endlessDepth: number }).endlessDepth === 4)

// spend bookmarks by falling off the world three times
for (let b = 3; b > 0; b--) {
  const p = eng.player
  p.x = 30
  p.y = 700 // below the margin (VIEW_H + 80 = 680)
  p.vy = 100
  eng.update(1 / 60)
  check(`fall ${4 - b}: status dead`, eng.status === 'dead')
  check(`fall ${4 - b}: bookmarks now ${b - 1}`, eng.bookmarks === b - 1)
  for (let t = 0; t < 90 && eng.status === 'dead'; t++) eng.update(1 / 60)
  if (b > 1) check(`fall ${4 - b}: respawned`, eng.status === 'playing')
}
check('gameover after last bookmark', eng.status === 'gameover')
// REGRESSION: the page must stay FROZEN on gameover — the old build
// kept simulating physics behind the score screen and oscillated
// dead↔gameover forever (the player was still below the margin)
{
  const st = eng.status
  for (let t = 0; t < 240; t++) eng.update(1 / 60)
  check('gameover stays frozen under updates', eng.status === st)
}
const snap = eng.snapshot()
check('gameover snapshot carries stats', !!snap.stats)
check('gameover snapshot runTime ≥0', snap.runTime >= 0)
check('gameover snapshot mode endless', snap.mode === 'endless')

// quick retry from the gameover screen
eng.pressAction('confirm')
check('confirm on gameover restarts endless', eng.status === 'playing' && eng.mode === 'endless')

// R redraws the SAME generated page (name unchanged, bookmarks refilled)
const nameBefore = eng.roomDef.name
eng.pressAction('restart')
check('restart keeps the same page', eng.roomDef.name === nameBefore)
check('restart refills bookmarks', eng.bookmarks === 3)

// quit to title returns to campaign backdrop
eng.quitToTitle()
check('quit returns to title', eng.status === 'title')
check('quit resets mode', eng.mode === 'campaign')

// campaign start unaffected
eng.startRun()
check('campaign run starts at room 1', eng.status === 'playing' && eng.roomIndex === 0)
check('campaign mode', eng.mode === 'campaign')

// ---- report ----------------------------------------------------------
console.log(`\n=== verify-endless: ${pass} passed, ${fail} failed ===`)
if (failures.length) {
  console.log('FAILURES:')
  for (const f of failures.slice(0, 30)) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('all endless-mode assertions green.')
