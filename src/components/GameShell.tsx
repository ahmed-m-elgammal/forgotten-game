'use client'
// ============================================================
// GameShell — React wrapper around the canvas engine.
// ------------------------------------------------------------
// WHY React at all: menus (title / pause / victory / legend) are
// much cleaner as DOM with Tailwind. The canvas owns gameplay;
// React owns chrome. The engine is polled once per frame and
// React re-renders ONLY when the engine bumps its uiVersion —
// so the 60fps loop never thrashes the reconciler.
//
// Lifecycle & StrictMode: everything (engine, input, renderer,
// audio, RAF) is created inside the effect and FULLY destroyed
// in the cleanup — remounts can never double loops or listeners.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { GameEngine } from '@/game/core/engine'
import { InputManager } from '@/game/input'
import { Renderer } from '@/game/render/renderer'
import { AudioEngine } from '@/game/audio/synth'
import { RULES } from '@/game/core/rules'
import type { RuleId, UiSnapshot } from '@/game/core/types'
import { VIEW_H, VIEW_W } from '@/game/core/types'

const HAND = { fontFamily: '"Comic Sans MS","Segoe Print","Chalkboard SE",cursive,sans-serif' }

const INITIAL_UI: UiSnapshot = {
  version: 0,
  status: 'title',
  roomIndex: 0,
  roomCount: 7,
  roomName: '',
  roomSubtitle: '',
  charges: 0,
  maxCharges: 0,
  slots: 0,
  pinnedCount: 0,
  erased: 0,
  ink: 0,
  inkMax: 3,
  muted: false,
  legendOpen: false,
  selectedRule: null,
  ending: null,
  stats: null,
}

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [ui, setUi] = useState<UiSnapshot>(INITIAL_UI)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const audio = new AudioEngine()
    const held = { left: false, right: false, up: false, down: false }
    const engine = new GameEngine(audio, held)
    engineRef.current = engine
    // Debug / modding hook (dev builds only): lets tools and tinkerers
    // inspect live engine state via `window.__forgotEngine`.
    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as { __forgotEngine?: GameEngine }).__forgotEngine = engine
    }
    const renderer = new Renderer()
    renderer.init()
    const input = new InputManager(canvas, {
      action: (a) => engine.pressAction(a),
      pointerMove: (x, y) => engine.pointerMove(x, y),
      pointerDown: (x, y) => engine.pointerDown(x, y),
      pointerUp: (x, y) => engine.pointerUp(x, y),
      blur: () => engine.onBlur(),
      setHeld: (l, r) => {
        held.left = l
        held.right = r
      },
      setHeldUD: (u, d) => {
        held.up = u
        held.down = d
      },
      sketchActive: () => engine.sketchMode,
      unlock: () => engine.unlockAudio(),
    })

    // letterbox the fixed 960×600 page into the window, DPR-aware
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const availW = window.innerWidth - 24
      const availH = window.innerHeight - 24
      const scale = Math.min(availW / VIEW_W, availH / VIEW_H)
      const cw = Math.max(320, Math.floor(VIEW_W * scale))
      const ch = Math.max(200, Math.floor(VIEW_H * scale))
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let last = performance.now()
    let ver = -1
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      engine.update(dt)
      ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0)
      renderer.draw(ctx, engine)
      const snap = engine.snapshot()
      if (snap.version !== ver) {
        ver = snap.version
        setUi(snap)
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      input.destroy()
      window.removeEventListener('resize', resize)
      audio.dispose()
      engineRef.current = null
    }
  }, [])

  const act = (fn: (e: GameEngine) => void) => () => {
    const e = engineRef.current
    if (e) fn(e)
  }

  const btn =
    'rounded-lg border-2 border-[#2b2620] bg-[#f5ecd9] px-5 py-2 text-[#2b2620] shadow-[3px_3px_0_#2b2620] transition hover:-translate-y-0.5 hover:shadow-[4px_5px_0_#2b2620] active:translate-y-0 active:shadow-[2px_2px_0_#2b2620]'

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#e6d7b4]">
      {/* desk vignette around the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_55%,rgba(87,66,35,0.25)_100%)]"
      />
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block touch-none rounded-sm shadow-[0_10px_40px_rgba(60,45,20,0.35)] ring-1 ring-[#c9b384]"
          aria-label="THE GAME THAT FORGOT YOU — game canvas"
        />
        <button
          tabIndex={-1}
          onClick={act((e) => e.toggleMute())}
          aria-label={ui.muted ? 'Unmute' : 'Mute'}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#2b2620] bg-[#f5ecd9] text-[#2b2620] shadow transition hover:-translate-y-0.5"
        >
          {ui.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* ---------------- TITLE ---------------- */}
      {ui.status === 'title' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5ecd9]/95 p-4">
          <div className="max-h-full max-w-xl overflow-y-auto text-center text-[#2b2620]">
            <p style={HAND} className="text-sm tracking-wide opacity-70">
              a small notebook fable
            </p>
            <h1 style={HAND} className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">
              THE GAME THAT FORGOT YOU.
            </h1>
            <p className="mt-4 opacity-80">
              The world forgets its rules — gravity, solidity, the ground itself. You have a
              little memory, a few paper clips, and one small scribble of a hero. Keep what
              matters. Reach the door marked OUT?.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.startRun())}>
                Begin
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.toggleLegend())}>
                What do the tokens mean?
              </button>
            </div>
            <p className="mt-5 text-xs opacity-60">
              ENTER to begin · ←/→ or A/D move · SPACE jump · 1–7 select a rule · ENTER keeps it ·
              C sketch · sound starts after your first key or click
            </p>
          </div>
        </div>
      )}

      {/* ---------------- PAUSE ---------------- */}
      {ui.status === 'paused' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5ecd9]/90 p-4">
          <div className="w-full max-w-sm rounded-xl border-2 border-[#2b2620] bg-[#f5ecd9] p-6 text-center text-[#2b2620] shadow-[5px_6px_0_rgba(43,38,32,0.6)]">
            <h2 style={HAND} className="text-2xl">
              the page holds still.
            </h2>
            <p className="mt-1 text-sm opacity-70">
              room {ui.roomIndex + 1} — {ui.roomName}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.resumeGame())}>
                Resume
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.restartRoom())}>
                Restart room
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.toggleLegend())}>
                Legend
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.quitToTitle())}>
                Quit to title
              </button>
            </div>
            <p className="mt-4 text-xs opacity-60">ESC or ENTER resumes · R restarts the room</p>
          </div>
        </div>
      )}

      {/* ---------------- VICTORY ---------------- */}
      {ui.status === 'victory' && ui.ending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5ecd9]/95 p-4">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border-2 border-[#2b2620] bg-[#f5ecd9] p-6 text-center text-[#2b2620] shadow-[5px_6px_0_rgba(43,38,32,0.6)] sm:p-8">
            <p style={HAND} className="text-sm opacity-60">
              the last page is done
            </p>
            <h2 style={HAND} className="mt-1 text-3xl sm:text-4xl">
              the story kept you.
            </h2>
            <p style={HAND} className="mt-2 text-xs uppercase tracking-widest opacity-60">
              {ui.ending.heading}
            </p>
            <p style={HAND} className="mx-auto mt-4 max-w-xl text-lg leading-relaxed sm:text-xl">
              “{ui.ending.line}”
            </p>

            {ui.stats && (
              <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3 text-left text-sm sm:grid-cols-3">
                <Stat label="pages cleared" value={`${ui.stats.pagesCleared} / ${ui.roomCount}`} />
                <Stat label="times erased" value={`${ui.stats.erased}`} />
                <Stat label="jumps" value={`${ui.stats.jumps}`} />
                {ui.stats.planksDrawn > 0 && (
                  <Stat label="lines drawn" value={`${ui.stats.planksDrawn}`} />
                )}
                {ui.stats.topKept && (
                  <Stat
                    label="top kept rule"
                    value={RULES[ui.stats.topKept.rule as RuleId].name}
                  />
                )}
                {(
                  Object.entries(ui.stats.forgotten) as Array<[RuleId, number]>
                ).map(([id, n]) => (
                  <Stat
                    key={id}
                    label={`forgot ${RULES[id].name.toLowerCase()}`}
                    value={`${n}×`}
                    dot={RULES[id].color}
                  />
                ))}
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.startRun())}>
                Play again
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.quitToTitle())}>
                Title
              </button>
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.toggleLegend())}>
                Legend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- LEGEND (from title / pause / victory) ---------------- */}
      {ui.legendOpen && (ui.status === 'title' || ui.status === 'paused' || ui.status === 'victory') && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#2b2620]/40 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border-2 border-[#2b2620] bg-[#f5ecd9] p-6 text-[#2b2620] shadow-[5px_6px_0_rgba(43,38,32,0.7)]">
            <h3 style={HAND} className="text-xl">
              how to read the page
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-[2.5px] border-[#2b2620]" />
                <span>
                  <b>solid ink ring — stable.</b> The rule is working. Nothing to do.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-[2.5px] border-[#d99a2b]" />
                <span>
                  <b>amber flicker + shrinking arc — fading.</b> Seconds to react: press its
                  number, then ENTER to keep it.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-[#2b2620]/50" />
                <span>
                  <b>scribbled out — forgotten.</b> The distortion is live. It comes back on its
                  own within seconds; you can also rescue it with a pin.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-[2.5px] border-[#c98a2d]" />
                <span>
                  <b>paper clip — kept.</b> Pinned for 12 seconds: immune while it lasts. Costs 1
                  memory charge and one keep-slot.
                </span>
              </li>
            </ul>
            <h4 style={HAND} className="mt-5 text-lg">
              the {Object.keys(RULES).length} rules
            </h4>
            <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {(Object.keys(RULES) as RuleId[]).map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: RULES[id].color }}
                  />
                  <span>
                    <b>{RULES[id].name}</b> — {RULES[id].tagline}
                  </span>
                </li>
              ))}
            </ul>
            <h4 style={HAND} className="mt-5 text-lg">
              ink &amp; sketching
            </h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <b>ink bottles</b> refill your pen — three swallows max, gone when the page
                reloads.
              </li>
              <li>
                <b>draw a plank:</b> hold left-click and drag a line — or press C, aim the ghost
                with A/D/W/S, ENTER places it.
              </li>
              <li>
                <b>planks dry out</b> in about 8 seconds, then fade. Three can exist at once.
              </li>
              <li>
                <b>THE NAMING:</b> a nameless door won&apos;t open — touch its wandering word to
                re-ink it.
              </li>
            </ul>
            <p className="mt-4 text-xs opacity-60">
              Falling off the page is never the end: you are erased back to your last anchor. R
              restarts the room at any time.
            </p>
            <div className="mt-4 text-center">
              <button style={HAND} className={btn} tabIndex={-1} onClick={act((e) => e.toggleLegend())}>
                Close (L)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="rounded-lg border border-[#2b2620]/30 bg-[#f8f1e2] px-3 py-2">
      <div className="flex items-center gap-2">
        {dot && (
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        )}
        <span className="text-base font-semibold">{value}</span>
      </div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  )
}
