# THE GAME THAT FORGOT YOU.

A notebook platformer where you never control the hero — you control what the
world *remembers*. A small ink scribble runs and jumps through hand-drawn
pages, while the notebook itself keeps forgetting its own rules: gravity,
solidity, the ground, left and right, the leap, the grip, even the word on
the door. You watch the margins, you spend your memory, and you draw your own
way across.

Everything is procedural — paper grain, boiling ink lines, the sounds. No
sprites, no audio files. The whole campaign is data.

**Play: `http(s)://<host>/forgotten-game/` once Pages is enabled (see Deploy),
or run it locally (below).**

---

## How it plays

- **Rules forget themselves.** Every forget event is telegraphed for 3 s
  (4.5 s on page one): the rule's token flickers amber with a shrinking arc,
  the world hatches in warning color, a margin note appears, a waver plays.
  Nothing is ever instant.
- **You keep what matters.** Select a rule's token (keys `1`–`7`, or click it)
  and press `ENTER` to pin it with a paper clip for 12 seconds. It costs one
  memory charge and one keep-slot. Charges regenerate; slots are per-page.
- **Forgotten rules come back.** Every distortion auto-restores in ≤7 s
  (direction: exactly 4 s). You can also rescue a rule by pinning it mid-alert.
- **Reach the door marked OUT?** to turn the page.

## The seven rules

| Rule | Forgets… | While forgotten |
| --- | --- | --- |
| GRAVITY | the falling | gravity oscillates 0.25×–0.6× with sideways drift |
| THE LEAP | up | jumps spring at 45%, coyote time gone |
| SOLIDITY | the touch | 1–2 ledges go passable (dashed ghosts) |
| THE GROUND | where things stand | 1–3 ledges drift away on sine paths |
| LEFT & RIGHT | the two ways | input inverted, big swap labels on both edges |
| THE GRIP | the holding | ice: weak acceleration, no braking, momentum |
| THE NAMING | the word on the door | the OUT? tag drifts; the door is inert until you touch the word |

## Re-inking (v1.0) — you are also the author

Collect ink bottles and draw temporary plank platforms: hold left-click and
drag a line, or press `C` and aim the ghost plank (`A/D/W/S`), `ENTER` places.
Planks are always solid, live ~8 s, and three of yours can exist at once.

**Three inks (v1.1):**

- **black** — an ordinary plank
- **red** — springs: a real fall onto it rebounds you upward (a trampoline)
- **blue** — brittle: tears after ~2 s of standing on it

Your pen is a FIFO: the next stroke spends the **oldest** swallow, and the
HUD pips show the queue in order.

## The Observer (v1.1: it writes back)

The notebook watches how you play: which rules you always pin, which ledge
you love, how much you jump. It says so in the margin — and then biases its
forgetting toward your habits (65%), while the warning system stays exactly
as fair as before. On page five it stops merely watching: the page arrives
with a plank **it** drew (graphite, slightly wrong), and if you lean on one
of *your* planks too long, it circles that plank in pencil and strikes it —
the plank dries faster. The ending asks what you kept, and (new in v1.1)
*how* you played: only holding on, or writing back.

## Controls

```
←/→ or A/D   move            SPACE / W / ↑   jump
1–7          select a rule   ENTER / E       keep (pin) it
C            sketch mode     left-drag       draw a plank
R            restart room    ESC             pause
M            mute            L               legend
```

## Campaign (8 pages)

First Words · Edges · Mirrors · The Grip · **Imitation** · The Watcher ·
The Naming · What You Kept. Every room is authored data — geometry, rules,
drops, pacing — tuned against the physics math in `src/game/core/rooms.ts`.

## Run it

```bash
bun install
bun run dev      # http://localhost:3000
bun run lint
bunx tsc --noEmit
```

No database, no API usage — the scaffold's `/api` route is unused by the game.

## Project structure

```
src/game/core/    engine.ts (simulation + fairness contract)
                  rules.ts  (the rule registry: one entry = one rule)
                  rooms.ts  (the whole campaign as data)
                  observer.ts (habit tracking, bias, endings)
                  types.ts  (shared vocabulary + all tuning constants)
src/game/render/  renderer.ts (draws engine state, never mutates it)
                  paper.ts   (grain, line boil, handwriting primitives)
src/game/audio/   synth.ts   (100% synthesized SFX, lazy AudioContext)
src/game/input.ts keyboard/mouse bindings, StrictMode-safe
src/components/GameShell.tsx  React chrome: title/pause/victory/legend
```

### Design rules that never break

- Every forget is telegraphed; only one rule is ever in alert; forgotten
  rules auto-restore; nothing is scheduled within 6 s of a respawn.
- The renderer reads engine state and never mutates it; rules.ts flips
  flags on the engine through a narrow `EngineLike` interface (no cycles).
- Adding a rule = one entry in `rules.ts` + listing its id in
  `ROOMS[].activeRules`. Adding a page = one object in `rooms.ts`.

## Deploy (GitHub Pages)

The site is a fully static export (base path `/forgotten-game`):

```bash
STATIC_EXPORT=1 NEXT_DIST_DIR=.next-export bunx next build
# pushes ./out to the gh-pages branch, then enable Pages → source: gh-pages
```

## Version history

- **v1.1.0 — it begins to write back.** Ink colors (red springs, blue
  tears) with FIFO pen queue; the Observer's uncircle; the Imitation room
  and its stranger plank; ending codas; 8-page campaign; GitHub Pages deploy.
- **v1.0.0 — feature-complete.** Re-inking, THE NAMING, THE GRIP; 7 rooms.
- **v0.5.0 — first playable.** Core rules, memory economy, observer, endings.
