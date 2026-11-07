// ============================================================
// rooms.ts — the whole campaign as DATA.
// ------------------------------------------------------------
// WHY: the five pages are pure authored content. Tuning a room
// (or adding a sixth) never touches engine code.
//
// COMPLETABILITY MATH (verified against physics constants):
//   jump height ≈ 760²/(2·2200) ≈ 131px  → all climbs kept ≤ 90px
//   flat gap reach ≈ 2·760/2200 · 340 ≈ 235px → all gaps ≤ 130px
//   weakened-jump reach (LEAP forgotten, v=342) ≈ 105px → every
//   room keeps a route whose required gaps are ≤ ~110px, and the
//   auto-restore (≤7s) plus respawn cover the rest.
// ============================================================
import type { RoomDef } from './types'

export const ROOMS: RoomDef[] = [
  // ------------------------------------------------------------
  // ROOM 1 — safe tutorial. Two small gaps (90/100px), a step,
  // long 4.5s warnings, unmissable onboarding lines.
  // ------------------------------------------------------------
  {
    index: 0,
    name: 'First Words',
    subtitle: 'the world tries forgetting something small',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r1-f1', x: 0, y: 540, w: 320, h: 60, kind: 'floor' },
      { id: 'r1-f2', x: 410, y: 540, w: 210, h: 60, kind: 'floor' },
      { id: 'r1-f3', x: 720, y: 540, w: 240, h: 60, kind: 'floor' },
      { id: 'r1-s1', x: 250, y: 470, w: 110, h: 16, kind: 'ledge' }, // step (70px up)
      { id: 'r1-s2', x: 480, y: 430, w: 120, h: 16, kind: 'ledge' }, // rest perch
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 },
    checkpoint: { x: 515, y: 540 },
    activeRules: ['gravity', 'jump'],
    memorySlots: 1,
    maxCharges: 2,
    firstEventDelay: 10,
    eventInterval: [11, 16],
    warnDuration: 4.5, // extra-long, gentle telegraphing on page one
    introNotes: [
      'The world forgets. Tokens on the edge are its rules.',
      'Select a token (1–5), press ENTER to keep it.',
      'When a rule fades, you have seconds to respond.',
    ],
  },

  // ------------------------------------------------------------
  // ROOM 2 — SOLIDITY + THE GROUND join. High/low two-route layout
  // so a passable ledge can never hard-block; the floor has one
  // small gap with ledges above as the scenic route.
  // ------------------------------------------------------------
  {
    index: 1,
    name: 'Edges',
    subtitle: 'some things were only ever suggested',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r2-f1', x: 0, y: 540, w: 380, h: 60, kind: 'floor' },
      { id: 'r2-f2', x: 470, y: 540, w: 490, h: 60, kind: 'floor' },
      { id: 'r2-m1', x: 150, y: 465, w: 120, h: 16, kind: 'ledge' }, // 75 up
      { id: 'r2-m2', x: 330, y: 390, w: 130, h: 16, kind: 'ledge' }, // 75 up, 60 gap
      { id: 'r2-m3', x: 540, y: 315, w: 140, h: 16, kind: 'ledge' }, // 75 up, 80 gap
      { id: 'r2-m4', x: 760, y: 380, w: 120, h: 16, kind: 'ledge' }, // drop across 80 gap
      { id: 'r2-m5', x: 620, y: 470, w: 100, h: 16, kind: 'ledge' }, // rest ledge
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 },
    checkpoint: { x: 560, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms'],
    memorySlots: 2,
    maxCharges: 3,
    firstEventDelay: 9,
    eventInterval: [9, 15],
    warnDuration: 3,
    introNotes: [
      'More of its rules live here.',
      'Two things can be kept at once — but memory runs out.',
    ],
  },

  // ------------------------------------------------------------
  // ROOM 3 — LEFT & RIGHT joins. Two 110px gaps make inversion
  // bite; the floor itself is the safe low route. An overhang and
  // a high ledge route give the Observer favorite perches.
  // ------------------------------------------------------------
  {
    index: 2,
    name: 'Mirrors',
    subtitle: 'the two ways argue about which is which',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r3-f1', x: 0, y: 540, w: 240, h: 60, kind: 'floor' },
      { id: 'r3-f2', x: 350, y: 540, w: 260, h: 60, kind: 'floor' },
      { id: 'r3-f3', x: 720, y: 540, w: 240, h: 60, kind: 'floor' },
      { id: 'r3-o1', x: 230, y: 415, w: 130, h: 16, kind: 'ledge' }, // overhang of the first gap
      { id: 'r3-l1', x: 420, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r3-l2', x: 560, y: 390, w: 110, h: 16, kind: 'ledge' }, // 70 up, 30 gap
      { id: 'r3-l3', x: 400, y: 320, w: 110, h: 16, kind: 'ledge' }, // 70 up, 50 gap
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 },
    checkpoint: { x: 480, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction'],
    memorySlots: 2,
    maxCharges: 3,
    firstEventDelay: 9,
    eventInterval: [9, 15],
    warnDuration: 3,
    introNotes: [
      'Here, left and right can forget themselves.',
      'Watch the edges. The page will tell you.',
    ],
  },

  // ------------------------------------------------------------
  // ROOM 4 — THE WATCHER. All five rules; habit bias fully on;
  // the page admits it has been reading over your shoulder.
  // ------------------------------------------------------------
  {
    index: 3,
    name: 'The Watcher',
    subtitle: 'the margins have handwriting in them now',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r4-f1', x: 0, y: 540, w: 280, h: 60, kind: 'floor' },
      { id: 'r4-f2', x: 400, y: 540, w: 220, h: 60, kind: 'floor' },
      { id: 'r4-f3', x: 750, y: 540, w: 210, h: 60, kind: 'floor' },
      { id: 'r4-l1', x: 180, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r4-l2', x: 380, y: 380, w: 130, h: 16, kind: 'ledge' }, // 80 up, 90 gap
      { id: 'r4-l3', x: 600, y: 450, w: 110, h: 16, kind: 'ledge' }, // 90 up from floor
      { id: 'r4-l4', x: 760, y: 360, w: 130, h: 16, kind: 'ledge' }, // 90 up, 50 gap
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 },
    checkpoint: { x: 500, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction'],
    memorySlots: 2,
    maxCharges: 3,
    firstEventDelay: 8,
    eventInterval: [9, 14],
    warnDuration: 3,
    introNotes: [
      'it has been watching you.',
      'It learns what you keep. It forgets that, first.',
    ],
  },

  // ------------------------------------------------------------
  // ROOM 5 — the final climb. Near the top a scripted sequence
  // warns THREE rules in quick succession (sequential, still fair).
  // The exit rides a protected platform (noDistort) so the set
  // piece can never hard-block the door.
  // ------------------------------------------------------------
  {
    index: 4,
    name: 'What You Kept',
    subtitle: 'the last page writes back',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r5-f1', x: 0, y: 540, w: 300, h: 60, kind: 'floor' },
      { id: 'r5-f2', x: 410, y: 540, w: 180, h: 60, kind: 'floor' },
      { id: 'r5-f3', x: 710, y: 540, w: 250, h: 60, kind: 'floor' },
      { id: 'r5-la', x: 150, y: 460, w: 100, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r5-lb', x: 300, y: 390, w: 100, h: 16, kind: 'ledge' }, // 70 up, 50 gap
      { id: 'r5-p1', x: 760, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r5-p2', x: 620, y: 385, w: 110, h: 16, kind: 'ledge' }, // 75 up
      { id: 'r5-p3', x: 470, y: 310, w: 110, h: 16, kind: 'ledge' }, // 75 up, 40 gap
      { id: 'r5-p4', x: 600, y: 235, w: 110, h: 16, kind: 'ledge' }, // 75 up, 20 gap
      { id: 'r5-p5', x: 780, y: 200, w: 140, h: 16, kind: 'ledge', noDistort: true }, // exit perch
    ],
    exit: { x: 845, y: 130, w: 60, h: 70 }, // sits on r5-p5
    checkpoint: { x: 500, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction'],
    memorySlots: 3,
    maxCharges: 4,
    firstEventDelay: 9,
    eventInterval: [9, 14],
    warnDuration: 3,
    introNotes: [
      'Last page. It will fight the loudest at the end.',
      'Keep what matters. Let the rest blur.',
    ],
    script: {
      whenX: 430, // deep in the upper climb
      whenYMax: 340,
      rules: ['gravity', 'jump', 'direction'],
    },
  },
]
