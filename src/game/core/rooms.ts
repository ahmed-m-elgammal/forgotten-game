// ============================================================
// rooms.ts — the whole campaign as DATA.
// ------------------------------------------------------------
// WHY: the seven pages are pure authored content. Tuning a room
// (or adding an eighth) never touches engine code.
//
// COMPLETABILITY MATH (verified against physics constants):
//   jump height ≈ 760²/(2·2200) ≈ 131px  → all climbs kept ≤ 90px
//   flat gap reach ≈ 2·760/2200 · 340 ≈ 235px → all gaps ≤ 190px,
//   and every gap over ~130px has a long run-up floor before it.
//   weakened-jump reach (LEAP forgotten, v=342) ≈ 105px → every
//   room keeps a route whose required gaps are ≤ ~110px, and the
//   auto-restore (≤7s) plus respawn cover the rest.
//   GRIP forgotten (icy): accel drops to 850 → top speed 390 is
//   reached in ~0.46s over ~90px of run-up; airtime ≈ 0.69s gives
//   ≈ 269px of slide-reach, so the 190px gap on page 4 stays easy
//   WITH momentum and hard from a standstill — the room's lesson.
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
      'Select a token (1–7), press ENTER to keep it.',
      'When a rule fades, you have seconds to respond.',
    ],
    inkDrops: [],
  },

  // ------------------------------------------------------------
  // ROOM 2 — SOLIDITY + THE GROUND join, and the first ink bottles.
  // High/low two-route layout so a passable ledge can never hard-
  // block; the floor has one small gap with ledges above as the
  // scenic route. The bonus ledge (95px up + 50px across) sits at
  // the very edge of jump reach — a drawn plank makes it trivial.
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
      { id: 'r2-bonus', x: 170, y: 295, w: 110, h: 16, kind: 'ledge' }, // 95 up + 50 across from m2 — plank territory
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
      'bottles hold ink. press C and drag — a drawn line holds for a while.',
    ],
    inkDrops: [
      { x: 300, y: 525 }, // easy, on the first floor
      { x: 225, y: 280 }, // on the bonus ledge — rewards a drawn plank
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
    inkDrops: [{ x: 455, y: 305 }], // high on r3-l3 — a small detour reward
  },

  // ------------------------------------------------------------
  // ROOM 4 — THE GRIP. New icy page: two LONG floors with one
  // 190px run-up gap (easy at speed, hard from a standstill) and
  // forgiving landing zones everywhere. The anchor knot sits mid-
  // room so a slide never costs your checkpoint. Fairness while
  // grip is forgotten: run-up math in the header comment.
  // ------------------------------------------------------------
  {
    index: 3,
    name: 'The Grip',
    subtitle: 'everything slides a little',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r4-f1', x: 0, y: 540, w: 340, h: 60, kind: 'floor' }, // run-up for the big gap
      { id: 'r4-f2', x: 530, y: 540, w: 430, h: 60, kind: 'floor' }, // long landing zone + door
      { id: 'r4-m1', x: 150, y: 465, w: 110, h: 16, kind: 'ledge' }, // 75 up
      { id: 'r4-anchor', x: 430, y: 460, w: 140, h: 16, kind: 'ledge' }, // 80 up, 90 gap — bridges the slide
      { id: 'r4-l3', x: 650, y: 380, w: 120, h: 16, kind: 'ledge' }, // 80 up, 80 gap — scenic perch
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 }, // sits on r4-f2 (530..960)
    checkpoint: { x: 600, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction', 'grip'],
    memorySlots: 2,
    maxCharges: 3,
    firstEventDelay: 10,
    eventInterval: [10, 16],
    warnDuration: 3,
    introNotes: [
      'the holding fades and everything slides.',
      'stop early. start slow. the page is slick.',
    ],
    inkDrops: [{ x: 500, y: 445 }], // on the mid-room anchor ledge
  },

  // ------------------------------------------------------------
  // ROOM 5 — THE WATCHER. All six physical rules; habit bias fully
  // on; the page admits it has been reading over your shoulder.
  // Ink drops sit on both route branches.
  // ------------------------------------------------------------
  {
    index: 4,
    name: 'The Watcher',
    subtitle: 'the margins have handwriting in them now',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r5-f1', x: 0, y: 540, w: 280, h: 60, kind: 'floor' },
      { id: 'r5-f2', x: 400, y: 540, w: 220, h: 60, kind: 'floor' },
      { id: 'r5-f3', x: 750, y: 540, w: 210, h: 60, kind: 'floor' },
      { id: 'r5-l1', x: 180, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r5-l2', x: 380, y: 380, w: 130, h: 16, kind: 'ledge' }, // 80 up, 90 gap
      { id: 'r5-l3', x: 600, y: 450, w: 110, h: 16, kind: 'ledge' }, // 90 up from floor
      { id: 'r5-l4', x: 760, y: 360, w: 130, h: 16, kind: 'ledge' }, // 90 up, 50 gap
    ],
    exit: { x: 870, y: 470, w: 60, h: 70 },
    checkpoint: { x: 500, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction', 'grip'],
    memorySlots: 3,
    maxCharges: 3,
    firstEventDelay: 8,
    eventInterval: [9, 14],
    warnDuration: 3,
    introNotes: [
      'it has been watching you.',
      'It learns what you keep. It forgets that, first.',
    ],
    inkDrops: [
      { x: 235, y: 445 }, // on r5-l1 (left branch)
      { x: 820, y: 345 }, // on r5-l4 (right branch)
    ],
  },

  // ------------------------------------------------------------
  // ROOM 6 — THE NAMING. Built around the door: it stands on its
  // own high ledge, and when the name is forgotten the OUT? label
  // drifts between three anchors computed from the exit rect —
  // one off the ledge's left edge (a deliberate jump), one at the
  // ledge's right edge (a walk), one straight above the door (a
  // full jump). All anchors sit within ~90px of the door center,
  // well inside the 150px drift radius. Auto-restore (7s) means
  // the label rescue is always optional — never a softlock.
  // ------------------------------------------------------------
  {
    index: 5,
    name: 'The Naming',
    subtitle: 'a door is only a word',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r6-f1', x: 0, y: 540, w: 300, h: 60, kind: 'floor' },
      { id: 'r6-f2', x: 410, y: 540, w: 220, h: 60, kind: 'floor' }, // gap 110
      { id: 'r6-f3', x: 730, y: 540, w: 230, h: 60, kind: 'floor' }, // gap 100
      { id: 'r6-l1', x: 180, y: 465, w: 110, h: 16, kind: 'ledge' }, // 75 up
      { id: 'r6-l2', x: 350, y: 390, w: 110, h: 16, kind: 'ledge' }, // 75 up, 60 gap
      { id: 'r6-m1', x: 560, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r6-m2', x: 720, y: 385, w: 110, h: 16, kind: 'ledge' }, // 75 up, 50 gap
      { id: 'r6-dl', x: 800, y: 300, w: 150, h: 16, kind: 'ledge' }, // 85 up, door ledge
    ],
    exit: { x: 845, y: 230, w: 60, h: 70 }, // sits on r6-dl (800..950)
    checkpoint: { x: 480, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction', 'grip', 'naming'],
    memorySlots: 2,
    maxCharges: 3,
    firstEventDelay: 9,
    eventInterval: [9, 15],
    warnDuration: 3,
    introNotes: [
      'the door forgets its name.',
      'touch the wandering word to give it back.',
    ],
    inkDrops: [
      { x: 110, y: 525 }, // easy, near spawn
      { x: 615, y: 445 }, // on r6-m1, mid-climb
    ],
  },

  // ------------------------------------------------------------
  // ROOM 7 — the final climb, extended. Near the top a scripted
  // sequence warns THREE rules in quick succession — including
  // the grip and the naming (sequential, still fully telegraphed).
  // The exit rides a protected platform (noDistort) so the set
  // piece can never hard-block the door. A bonus branch ledge on
  // the left hides one of the two ink drops.
  // ------------------------------------------------------------
  {
    index: 6,
    name: 'What You Kept',
    subtitle: 'the last page writes back',
    spawn: { x: 60, y: 510 },
    platforms: [
      { id: 'r7-f1', x: 0, y: 540, w: 300, h: 60, kind: 'floor' },
      { id: 'r7-f2', x: 410, y: 540, w: 180, h: 60, kind: 'floor' },
      { id: 'r7-f3', x: 710, y: 540, w: 250, h: 60, kind: 'floor' },
      { id: 'r7-la', x: 150, y: 460, w: 100, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r7-lx', x: 20, y: 390, w: 100, h: 16, kind: 'ledge' }, // bonus branch: 30 gap, flat hop from la
      { id: 'r7-lb', x: 300, y: 390, w: 100, h: 16, kind: 'ledge' }, // 70 up, 50 gap
      { id: 'r7-p1', x: 760, y: 460, w: 110, h: 16, kind: 'ledge' }, // 80 up
      { id: 'r7-p2', x: 620, y: 385, w: 110, h: 16, kind: 'ledge' }, // 75 up
      { id: 'r7-p3', x: 470, y: 310, w: 110, h: 16, kind: 'ledge' }, // 75 up, 40 gap
      { id: 'r7-p4', x: 600, y: 235, w: 110, h: 16, kind: 'ledge' }, // 75 up, 20 gap
      { id: 'r7-p5', x: 780, y: 200, w: 140, h: 16, kind: 'ledge', noDistort: true }, // exit perch
    ],
    exit: { x: 845, y: 130, w: 60, h: 70 }, // sits on r7-p5
    checkpoint: { x: 500, y: 540 },
    activeRules: ['gravity', 'jump', 'collision', 'platforms', 'direction', 'grip', 'naming'],
    memorySlots: 3,
    maxCharges: 4,
    firstEventDelay: 9,
    eventInterval: [9, 14],
    warnDuration: 3,
    introNotes: [
      'Last page. It will fight the loudest at the end.',
      'Keep what matters. Let the rest blur.',
    ],
    inkDrops: [
      { x: 70, y: 375 }, // hidden on the bonus branch r7-lx
      { x: 520, y: 295 }, // on r7-p3, deep in the climb
    ],
    script: {
      whenX: 430, // deep in the upper climb
      whenYMax: 340,
      rules: ['gravity', 'grip', 'naming'],
    },
  },
]
