// ============================================================
// synth.ts — AudioEngine: 100% synthesized, zero assets.
// ------------------------------------------------------------
// WHY lazy: browsers refuse audio before a user gesture, so the
// AudioContext is created/resumed only on the first key/click.
// Every sound is oscillators + a shared noise buffer + ADSR-ish
// gain envelopes through one master gain (0.15). Mute state
// persists in-session (module scope) so remounts keep it.
// ============================================================

let sessionMuted = false

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private muted = sessionMuted
  private waver: { stop: () => void } | null = null
  private sketchLoop: { stop: () => void } | null = null
  private ambient: { stop: () => void } | null = null

  // ---- lifecycle ---------------------------------------------------
  /** Call on ANY user gesture (keydown / pointerdown). */
  unlock(): void {
    this.ensureCtx()
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  private ensureCtx(): void {
    if (this.ctx) return
    if (typeof window === 'undefined') return
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.15
      this.master.connect(this.ctx.destination)
    } catch {
      this.ctx = null
      this.master = null
    }
  }

  /** pause menu / window blur */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }

  /** gameplay resume */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  dispose(): void {
    this.stopWaver()
    this.stopSketchLoop()
    this.stopAmbient()
    const c = this.ctx
    this.ctx = null
    this.master = null
    this.noiseBuf = null
    if (c) {
      try {
        void c.close()
      } catch {
        // context already closed — nothing to do
      }
    }
  }

  // ---- mute ---------------------------------------------------------
  isMuted(): boolean {
    return this.muted
  }

  toggleMute(): void {
    this.setMuted(!this.muted)
  }

  setMuted(m: boolean): void {
    this.muted = m
    sessionMuted = m
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.15, this.ctx.currentTime, 0.02)
    }
  }

  // ---- internals -----------------------------------------------------
  private ok(): boolean {
    return !!this.ctx && !!this.master && !this.muted
  }

  private noiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null
    if (!this.noiseBuf) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = b
    }
    return this.noiseBuf
  }

  private tone(o: {
    f: number
    f1?: number
    type?: OscillatorType
    at?: number
    dur: number
    g?: number
    attack?: number
    filter?: number
  }): void {
    if (!this.ok()) return
    const ctx = this.ctx as AudioContext
    const t0 = o.at ?? ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.f, t0)
    if (o.f1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur)
    }
    const gn = ctx.createGain()
    const peak = o.g ?? 0.2
    gn.gain.setValueAtTime(0.0001, t0)
    gn.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.012))
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    let node: AudioNode = osc
    if (o.filter) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = o.filter
      osc.connect(f)
      node = f
    }
    node.connect(gn)
    gn.connect(this.master as GainNode)
    osc.start(t0)
    osc.stop(t0 + o.dur + 0.05)
  }

  private hiss(o: {
    at?: number
    dur: number
    g: number
    type: BiquadFilterType
    f: number
    f1?: number
    q?: number
  }): void {
    if (!this.ok()) return
    const ctx = this.ctx as AudioContext
    const t0 = o.at ?? ctx.currentTime
    const buf = this.noiseBuffer()
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = o.type
    fl.Q.value = o.q ?? 0.8
    fl.frequency.setValueAtTime(o.f, t0)
    if (o.f1) {
      fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur)
    }
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(0.0001, t0)
    gn.gain.exponentialRampToValueAtTime(o.g, t0 + 0.015)
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    src.connect(fl)
    fl.connect(gn)
    gn.connect(this.master as GainNode)
    src.start(t0)
    src.stop(t0 + o.dur + 0.05)
  }

  // ---- named SFX ------------------------------------------------------
  /** pinning a rule — warm two-note chime */
  preserve(): void {
    this.tone({ f: 523.25, dur: 0.3, g: 0.32 })
    this.tone({ f: 659.25, at: (this.ctx?.currentTime ?? 0) + 0.09, dur: 0.38, g: 0.28 })
  }

  /** a rule is forgotten — paper tear + falling pitch + the ache:
   *  a quiet semitone drop (B → Bb) underneath, v1.3's musical
   *  stinger for loss. It should hurt a LITTLE, not announce. */
  forgetPaper(): void {
    if (!this.ok()) return
    const t0 = (this.ctx as AudioContext).currentTime
    this.hiss({ at: t0, dur: 0.3, g: 0.5, type: 'bandpass', f: 1600, f1: 300, q: 0.7 })
    this.tone({ f: 260, f1: 70, type: 'sawtooth', dur: 0.28, g: 0.2, filter: 1200 })
    this.tone({ f: 246.94, at: t0 + 0.05, dur: 0.5, g: 0.09, attack: 0.03 })
    this.tone({ f: 233.08, at: t0 + 0.27, dur: 0.7, g: 0.08, attack: 0.04 })
  }

  /** auto-restore / remembered — noise sweep up + soft note */
  restore(): void {
    this.hiss({ dur: 0.26, g: 0.22, type: 'highpass', f: 400, f1: 2600 })
    this.tone({ f: 392, f1: 588, dur: 0.24, g: 0.12 })
  }

  /** checkpoint — small bell (sine + harmonic) */
  checkpointBell(): void {
    this.tone({ f: 880, dur: 0.9, g: 0.28, attack: 0.004 })
    this.tone({ f: 1760, dur: 0.5, g: 0.1, attack: 0.004 })
  }

  /** room clear — four-note arpeggio over a page rustle (v1.3:
   *  the paper sound makes the arpeggio a page event, not a UI blip) */
  roomClear(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.pageRustle()
    const notes = [392, 494, 587.33, 783.99]
    notes.forEach((f, i) => {
      this.tone({ f, at: t + i * 0.11, dur: 0.3, g: 0.26 })
    })
  }

  /** a page of paper slides — used by page turns (v1.3) */
  pageRustle(): void {
    if (!this.ok()) return
    const t0 = (this.ctx as AudioContext).currentTime
    this.hiss({ at: t0, dur: 0.42, g: 0.16, type: 'bandpass', f: 700, f1: 1600, q: 0.8 })
    this.hiss({ at: t0 + 0.12, dur: 0.3, g: 0.1, type: 'bandpass', f: 1000, f1: 1900, q: 1 })
  }

  /** the Observer speaks — low soft hum with beating vibrato */
  habitHum(): void {
    this.tone({ f: 108, dur: 1.0, g: 0.26, attack: 0.2 })
    this.tone({ f: 111, dur: 1.0, g: 0.2, attack: 0.2 })
  }

  /** victory — the ending theme (v1.3: a full phrase, not a blip):
   *  the five-note rising motif, an answering phrase, and a warm
   *  resolving chord over a low pad. ~4.5s, one-shot. */
  victory(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5]
    notes.forEach((f, i) => {
      this.tone({ f, at: t + i * 0.17, dur: 0.5, g: 0.26 })
    })
    // answering phrase — the story exhales
    const answer = [783.99, 880, 783.99, 659.25]
    answer.forEach((f, i) => {
      this.tone({ f, at: t + 1.05 + i * 0.19, dur: 0.42, g: 0.2 })
    })
    // warm resolve: C-major spread + the low pad underneath
    ;[523.25, 659.25, 783.99].forEach((f) => {
      this.tone({ f, at: t + 1.9, dur: 1.7, g: 0.14, attack: 0.06 })
    })
    this.tone({ f: 130.81, dur: 3.4, g: 0.15, attack: 0.4 })
    this.tone({ f: 196, dur: 3.0, g: 0.08, attack: 0.5 })
  }

  /** endless run over — the notebook closes: three soft falling
   *  notes and a last page-settle, the mirror of roomClear */
  gameOver(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const notes = [392, 311.13, 233.08]
    notes.forEach((f, i) => {
      this.tone({ f, at: t + i * 0.22, dur: 0.42, g: 0.2, filter: 1200 })
    })
    this.hiss({ at: t + 0.66, dur: 0.3, g: 0.16, type: 'lowpass', f: 500 })
  }

  /** very quiet tick on jump */
  jumpTick(): void {
    this.tone({ f: 620, f1: 880, type: 'triangle', dur: 0.06, g: 0.06 })
  }

  /** soft tap on landing */
  landTap(): void {
    this.hiss({ dur: 0.05, g: 0.28, type: 'lowpass', f: 420 })
    this.tone({ f: 140, f1: 90, dur: 0.06, g: 0.1 })
  }

  /** erased — muted thud + page-flip swish */
  erased(): void {
    this.tone({ f: 100, f1: 40, dur: 0.4, g: 0.45 })
    this.hiss({ at: (this.ctx?.currentTime ?? 0) + 0.05, dur: 0.18, g: 0.28, type: 'bandpass', f: 900, q: 0.6 })
  }

  /** direction reversal — urgent two-tone horn */
  directionHorn(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.tone({ f: 370, type: 'square', at: t, dur: 0.18, g: 0.24, filter: 900 })
    this.tone({ f: 294, type: 'square', at: t + 0.19, dur: 0.26, g: 0.24, filter: 800 })
  }

  /** tried to keep with no charges / no slots */
  pinDenied(): void {
    this.tone({ f: 180, f1: 150, type: 'triangle', dur: 0.14, g: 0.16 })
  }

  /** a paper clip slipped off (pin expired) */
  pinSlip(): void {
    this.tone({ f: 330, f1: 240, type: 'triangle', dur: 0.16, g: 0.1 })
  }

  /** unpinning early */
  unpin(): void {
    this.tone({ f: 480, f1: 360, type: 'triangle', dur: 0.09, g: 0.09 })
  }

  // ---- RE-INKING SFX -------------------------------------------------
  /** an ink bottle plucked from the page — short wet pluck */
  inkPickup(): void {
    this.tone({ f: 660, f1: 990, type: 'triangle', dur: 0.09, g: 0.16 })
    this.tone({ f: 1320, dur: 0.05, g: 0.06, at: (this.ctx?.currentTime ?? 0) + 0.06 })
  }

  /** pencil tip tap — a stroke (or the sketch mode) begins */
  sketchStart(): void {
    this.hiss({ dur: 0.05, g: 0.2, type: 'bandpass', f: 2400, q: 1.2 })
    this.tone({ f: 190, type: 'triangle', dur: 0.05, g: 0.1 })
  }

  /** soft tap when a plank is placed */
  plankPlace(): void {
    this.tone({ f: 220, f1: 180, type: 'triangle', dur: 0.08, g: 0.18 })
    this.hiss({ dur: 0.04, g: 0.12, type: 'lowpass', f: 900 })
  }

  /** a plank dries away — soft downward pencil sweep */
  plankFade(): void {
    this.hiss({ dur: 0.28, g: 0.14, type: 'bandpass', f: 1200, f1: 260, q: 0.7 })
  }

  /** red ink — landing becomes a spring: quick rubbery up-chirp */
  plankBounce(): void {
    this.tone({ f: 210, f1: 540, type: 'triangle', dur: 0.13, g: 0.2 })
    this.hiss({ dur: 0.05, g: 0.1, type: 'bandpass', f: 1500, q: 1 })
  }

  /** blue ink — a brittle plank tears underfoot: rip + papery crunch */
  plankTear(): void {
    this.hiss({ dur: 0.2, g: 0.42, type: 'bandpass', f: 2200, f1: 380, q: 0.6 })
    this.tone({ f: 160, f1: 60, type: 'sawtooth', dur: 0.14, g: 0.14, filter: 800 })
  }

  /** the Observer writes back — two dry graphite scratches, lower
   *  and quieter than the player's pen (it is not trying to be heard) */
  observerScratch(): void {
    if (!this.ok()) return
    const t = this.ctx as AudioContext
    const t0 = t.currentTime
    this.hiss({ at: t0, dur: 0.12, g: 0.13, type: 'bandpass', f: 1150, f1: 850, q: 1.6 })
    this.hiss({ at: t0 + 0.14, dur: 0.1, g: 0.1, type: 'bandpass', f: 950, f1: 1250, q: 1.6 })
  }

  /** THE NAMING rescue — a quick re-inking scribble burst */
  reInk(): void {
    if (!this.ok()) return
    const t = this.ctx as AudioContext
    const t0 = t.currentTime
    this.hiss({ at: t0, dur: 0.1, g: 0.22, type: 'bandpass', f: 2100, f1: 1500, q: 1.1 })
    this.hiss({ at: t0 + 0.1, dur: 0.09, g: 0.18, type: 'bandpass', f: 1700, f1: 2300, q: 1.1 })
    this.tone({ f: 520, f1: 780, type: 'triangle', at: t0 + 0.02, dur: 0.12, g: 0.1 })
  }

  /** quiet bandpassed noise scratch while a stroke is being dragged */
  startSketchLoop(): void {
    if (!this.ok() || this.sketchLoop) return
    const ctx = this.ctx as AudioContext
    const t0 = ctx.currentTime
    const buf = this.noiseBuffer()
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = 'bandpass'
    fl.frequency.value = 1900
    fl.Q.value = 2.2
    // a slow wobble on the filter makes it read as “scribble”
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 7.3
    const lfoG = ctx.createGain()
    lfoG.gain.value = 420
    lfo.connect(lfoG)
    lfoG.connect(fl.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(0.028, t0 + 0.06)
    src.connect(fl)
    fl.connect(g)
    g.connect(this.master as GainNode)
    src.start(t0)
    lfo.start(t0)
    this.sketchLoop = {
      stop: () => {
        const t = ctx.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
        g.gain.linearRampToValueAtTime(0.0001, t + 0.07)
        src.stop(t + 0.1)
        lfo.stop(t + 0.1)
      },
    }
  }

  stopSketchLoop(): void {
    if (this.sketchLoop) {
      try {
        this.sketchLoop.stop()
      } catch {
        // nodes already stopped — fine
      }
      this.sketchLoop = null
    }
  }

  // ---- room-tone ambience (v1.3) ---------------------------------------
  /** a barely-there pad under play: C2+G2 triangles through a low
   *  filter with a slow breathing LFO — the sound of a quiet room
   *  where a notebook is thinking. Fades in over ~2.5s. */
  startAmbient(): void {
    if (!this.ok() || this.ambient) return
    const ctx = this.ctx as AudioContext
    const t0 = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(0.05, t0 + 2.5)
    const fl = ctx.createBiquadFilter()
    fl.type = 'lowpass'
    fl.frequency.value = 240
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = 65.41 // C2
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = 98.0 // G2
    const o3 = ctx.createOscillator()
    o3.type = 'sine'
    o3.frequency.value = 130.81 // C3, quiet — the shape under the shape
    const g3 = ctx.createGain()
    g3.gain.value = 0.35
    // slow breathing on the whole bed
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoG = ctx.createGain()
    lfoG.gain.value = 0.014
    lfo.connect(lfoG)
    lfoG.connect(g.gain)
    o1.connect(fl)
    o2.connect(fl)
    o3.connect(g3)
    g3.connect(fl)
    fl.connect(g)
    g.connect(this.master as GainNode)
    o1.start(t0)
    o2.start(t0)
    o3.start(t0)
    lfo.start(t0)
    this.ambient = {
      stop: () => {
        const t = ctx.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
        g.gain.linearRampToValueAtTime(0.0001, t + 0.6)
        o1.stop(t + 0.7)
        o2.stop(t + 0.7)
        o3.stop(t + 0.7)
        lfo.stop(t + 0.7)
      },
    }
  }

  stopAmbient(): void {
    if (this.ambient) {
      try {
        this.ambient.stop()
      } catch {
        // nodes already stopped — fine
      }
      this.ambient = null
    }
  }

  // ---- warning waver (looped while a countdown runs) -------------------
  startWaver(): void {
    if (!this.ok() || this.waver) return
    const ctx = this.ctx as AudioContext
    const t0 = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.25)
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = 196
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = 199.5 // detune = soft worry
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.2
    const lfoG = ctx.createGain()
    lfoG.gain.value = 0.03
    lfo.connect(lfoG)
    lfoG.connect(g.gain)
    o1.connect(g)
    o2.connect(g)
    g.connect(this.master as GainNode)
    o1.start(t0)
    o2.start(t0)
    lfo.start(t0)
    this.waver = {
      stop: () => {
        const t = ctx.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
        g.gain.linearRampToValueAtTime(0.0001, t + 0.12)
        o1.stop(t + 0.15)
        o2.stop(t + 0.15)
        lfo.stop(t + 0.15)
      },
    }
  }

  stopWaver(): void {
    if (this.waver) {
      try {
        this.waver.stop()
      } catch {
        // nodes already stopped — fine
      }
      this.waver = null
    }
  }
}
