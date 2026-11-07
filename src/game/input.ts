// ============================================================
// input.ts — keyboard & mouse binding. One place, full cleanup.
// ------------------------------------------------------------
// WHY a class: React must never own game listeners (StrictMode
// double-mount would duplicate them). The shell constructs one
// InputManager per engine instance and destroys it in cleanup.
//
// Keyboard-first mapping:
//   ←/→ or A/D move · SPACE/W/↑ jump · 1–5 select token
//   ENTER or E keep/unpin · ESC pause · R restart room
//   M mute · L legend · Q quit (paused)
// Scroll-hazard keys are preventDefault-ed so the page never moves.
// ============================================================
import { VIEW_H, VIEW_W } from './core/types'

export interface InputCallbacks {
  /** discrete action, e.g. 'confirm' | 'pin' | 'pause' | 'select:0'… */
  action(a: string): void
  pointerMove(x: number, y: number): void
  pointerDown(x: number, y: number): void
  /** window lost focus → engine auto-pauses */
  blur(): void
  setHeld(left: boolean, right: boolean): void
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
])

export class InputManager {
  private left = false
  private right = false
  private canvas: HTMLCanvasElement
  private cb: InputCallbacks

  constructor(canvas: HTMLCanvasElement, cb: InputCallbacks) {
    this.canvas = canvas
    this.cb = cb
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerdown', this.onWindowPointerDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mousedown', this.onMouseDown)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerdown', this.onWindowPointerDown)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
  }

  private push(): void {
    this.cb.setHeld(this.left, this.right)
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
      case 'Space':
      case 'KeyW':
      case 'ArrowUp':
        this.cb.action('jump')
        break
      case 'Enter':
      case 'NumpadEnter':
        this.cb.action('confirm')
        break
      case 'KeyE':
        this.cb.action('pin')
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
          if (n >= 1 && n <= 5) this.cb.action(`select:${n - 1}`)
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
    }
  }

  /** map a mouse event to logical 960×600 coordinates */
  private toLocal(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * VIEW_W) / r.width,
      y: ((e.clientY - r.top) * VIEW_H) / r.height,
    }
  }

  private onMouseMove = (e: MouseEvent): void => {
    const p = this.toLocal(e)
    this.cb.pointerMove(p.x, p.y)
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.cb.unlock()
    const p = this.toLocal(e)
    this.cb.pointerDown(p.x, p.y)
  }

  /** any click anywhere (menus included) unlocks audio */
  private onWindowPointerDown = (): void => {
    this.cb.unlock()
  }

  private onBlur = (): void => {
    // release held keys so nothing sticks, then let the engine pause
    this.left = false
    this.right = false
    this.push()
    this.cb.blur()
  }
}
