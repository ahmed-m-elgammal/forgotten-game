// ============================================================
// input.ts — keyboard & pointer binding. One place, full cleanup.
// ------------------------------------------------------------
// WHY a class: React must never own game listeners (StrictMode
// double-mount would duplicate them). The shell constructs one
// InputManager per engine instance and destroys it in cleanup.
//
// v1.4 "storefront": the canvas listens to POINTER events, not
// mouse events — one code path serves mouse, trackpad, pen and
// FINGER, so the mobile store builds draw planks with a thumb.
// Stroke ownership: the first pointer to touch the canvas owns
// the stroke until it lifts; extra fingers are ignored (and a
// stray pointerup from a HUD button can't end someone's stroke).
//
// Keyboard-first mapping:
//   ←/→ or A/D move · SPACE jump · 1–7 select token
//   ENTER or E keep/unpin · C sketch · ESC pause · R restart room
//   M mute · L legend · Q quit (paused)
// While sketch mode is open, W/S/↑/↓ nudge the ghost plank
// (SPACE keeps jumping) and left-drag always draws a stroke.
// Scroll-hazard keys are preventDefault-ed so the page never moves.
// ============================================================
import { VIEW_H, VIEW_W } from './core/types'

export interface InputCallbacks {
  /** discrete action, e.g. 'confirm' | 'pin' | 'pause' | 'select:0'… */
  action(a: string): void
  pointerMove(x: number, y: number): void
  pointerDown(x: number, y: number): void
  /** left button released — finishes a sketch stroke */
  pointerUp(x: number, y: number): void
  /** window lost focus → engine auto-pauses */
  blur(): void
  setHeld(left: boolean, right: boolean): void
  /** sketch ghost nudges (held while sketch mode is open) */
  setHeldUD(up: boolean, down: boolean): void
  /** is the engine's sketch mode open? (W/↑ must nudge, not jump) */
  sketchActive(): boolean
  /** any gesture unlocks the AudioContext */
  unlock(): void
}

const PREVENT = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'NumpadEnter',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
])

export class InputManager {
  private left = false
  private right = false
  private up = false
  private down = false
  private canvas: HTMLCanvasElement
  private cb: InputCallbacks
  /** pointerId that owns the current sketch stroke (null = none) */
  private strokeId: number | null = null
  /** last known canvas-local point — used if a stroke is cancelled */
  private lastPt: { x: number; y: number } = { x: 0, y: 0 }

  constructor(canvas: HTMLCanvasElement, cb: InputCallbacks) {
    this.canvas = canvas
    this.cb = cb
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
    // any pointer anywhere (menus included) unlocks audio
    window.addEventListener('pointerdown', this.onAnyPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onCanvasPointerDown)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    window.removeEventListener('pointerdown', this.onAnyPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown)
  }

  private push(): void {
    this.cb.setHeld(this.left, this.right)
  }

  private pushUD(): void {
    this.cb.setHeldUD(this.up, this.down)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const c = e.code
    if (PREVENT.has(c)) e.preventDefault()
    this.cb.unlock()
    if (e.repeat) return
    switch (c) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = true
        this.push()
        break
      case 'ArrowRight':
      case 'KeyD':
        this.right = true
        this.push()
        break
      case 'ArrowUp':
      case 'KeyW':
        this.up = true
        this.pushUD()
        // inside a sketch, ↑ nudges the ghost plank instead of jumping
        if (!this.cb.sketchActive()) this.cb.action('jump')
        break
      case 'ArrowDown':
      case 'KeyS':
        this.down = true
        this.pushUD()
        break
      case 'Space':
        this.cb.action('jump') // SPACE always jumps — no sketch deadlock
        break
      case 'Enter':
      case 'NumpadEnter':
        this.cb.action('confirm')
        break
      case 'KeyE':
        this.cb.action('pin')
        break
      case 'KeyC':
        this.cb.action('sketch')
        break
      case 'Escape':
        this.cb.action('pause')
        break
      case 'KeyR':
        this.cb.action('restart')
        break
      case 'KeyM':
        this.cb.action('mute')
        break
      case 'KeyL':
        this.cb.action('legend')
        break
      case 'KeyQ':
        this.cb.action('quit')
        break
      default:
        if (c.startsWith('Digit')) {
          const n = Number(c.slice(5))
          if (n >= 1 && n <= 7) this.cb.action(`select:${n - 1}`)
        }
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = false
        this.push()
        break
      case 'ArrowRight':
      case 'KeyD':
        this.right = false
        this.push()
        break
      case 'ArrowUp':
      case 'KeyW':
        this.up = false
        this.pushUD()
        break
      case 'ArrowDown':
      case 'KeyS':
        this.down = false
        this.pushUD()
        break
    }
  }

  /** map a pointer event to logical 960×600 coordinates */
  private toLocal(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * VIEW_W) / r.width,
      y: ((e.clientY - r.top) * VIEW_H) / r.height,
    }
  }

  /** hover + stroke movement — forward if free or if this pointer owns the stroke */
  private onPointerMove = (e: PointerEvent): void => {
    if (this.strokeId !== null && e.pointerId !== this.strokeId) return
    const p = this.toLocal(e)
    this.lastPt = p
    this.cb.pointerMove(p.x, p.y)
  }

  /** a stroke starts: first pointer claims it, others wait */
  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (this.strokeId !== null) return // a stroke is already in progress
    if (e.pointerType === 'mouse' && e.button !== 0) return // left-button gesture
    this.strokeId = e.pointerId
    this.cb.unlock()
    const p = this.toLocal(e)
    this.lastPt = p
    this.cb.pointerDown(p.x, p.y)
  }

  /** release anywhere (even off-canvas) ends the stroke — only its owner */
  private onPointerUp = (e: PointerEvent): void => {
    if (this.strokeId === null || e.pointerId !== this.strokeId) return
    this.strokeId = null
    const p = this.toLocal(e)
    this.cb.pointerUp(p.x, p.y)
  }

  /** system stole the pointer (gesture/notification shade) → end stroke */
  private onPointerCancel = (e: PointerEvent): void => {
    if (this.strokeId === null || e.pointerId !== this.strokeId) return
    this.strokeId = null
    this.cb.pointerUp(this.lastPt.x, this.lastPt.y)
  }

  /** any pointerdown anywhere (menus included) unlocks audio */
  private onAnyPointerDown = (): void => {
    this.cb.unlock()
  }

  private onBlur = (): void => {
    // release held keys so nothing sticks, then let the engine pause
    this.left = false
    this.right = false
    this.up = false
    this.down = false
    this.push()
    this.pushUD()
    this.cb.blur()
  }
}
