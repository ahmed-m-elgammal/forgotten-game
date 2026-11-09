'use client'
// Demo cliffhanger + store page. It is deliberately a page, not a
// billboard: the notebook asks for the rest of the story, once.
import { useEffect, useRef } from 'react'
import type { BillingBusy } from '@/native/useBilling'

const HAND = { fontFamily: '"Comic Sans MS","Segoe Print","Chalkboard SE",cursive,sans-serif' }

export type PaywallReason = 'demo' | 'title' | 'endless'

interface PaywallProps {
  native: boolean
  reason: PaywallReason
  price: string | null
  busy: BillingBusy
  error: string | null
  notice: string | null
  onBuy: () => void
  onRestore: () => void
  onClose: () => void
}

const COPY: Record<PaywallReason, { eyebrow: string; heading: string; body: string }> = {
  demo: {
    eyebrow: 'page three',
    heading: 'the notebook has five more pages.',
    body: 'You reached the edge of the free pages. The next five rooms — and the endless margins — are waiting in the full notebook.',
  },
  title: {
    eyebrow: 'the whole notebook',
    heading: 'keep the rest of the story.',
    body: 'The first three pages are free. Unlock all eight pages and the endless margins with one purchase.',
  },
  endless: {
    eyebrow: 'the margins',
    heading: 'the margins are part of the notebook.',
    body: 'Endless mode writes new pages forever. It comes with the full notebook — one purchase, no subscription.',
  },
}

export default function Paywall({
  native,
  reason,
  price,
  busy,
  error,
  notice,
  onBuy,
  onRestore,
  onClose,
}: PaywallProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    return () => previous?.focus?.()
  }, [])

  // The game listens for keys on window. Capture here so Enter/Escape
  // cannot start or pause the game behind the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape' && !busy) {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const copy = COPY[reason]
  const btn =
    'rounded-lg border-2 border-[#2b2620] bg-[#f5ecd9] px-5 py-2 text-[#2b2620] shadow-[3px_3px_0_#2b2620] transition hover:-translate-y-0.5 hover:shadow-[4px_5px_0_#2b2620] active:translate-y-0 active:shadow-[2px_2px_0_#2b2620] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-[3px_3px_0_#2b2620] disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_#2b2620]'
  const primary =
    'rounded-lg border-2 border-[#2b2620] bg-[#2b2620] px-5 py-3 text-[#f5ecd9] shadow-[3px_3px_0_rgba(43,38,32,0.35)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-heading"
      aria-describedby="paywall-body"
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#e6d7b4]/95 p-4"
    >
      <div
        ref={panelRef}
        className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-xl border-2 border-[#2b2620] bg-[#f5ecd9] p-6 text-center text-[#2b2620] shadow-[5px_6px_0_rgba(43,38,32,0.6)] sm:p-8"
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-2 rounded-md px-2 text-2xl leading-none opacity-50 hover:opacity-100 disabled:opacity-20"
          disabled={busy !== null}
          onClick={onClose}
        >
          ×
        </button>
        <p style={HAND} className="text-xs uppercase tracking-[0.2em] opacity-60">
          {copy.eyebrow}
        </p>
        <h2 id="paywall-heading" style={HAND} className="mt-2 text-2xl leading-tight sm:text-3xl">
          {copy.heading}
        </h2>
        <p id="paywall-body" style={HAND} className="mx-auto mt-4 max-w-md text-base leading-relaxed opacity-80">
          {copy.body}
        </p>

        {native ? (
          <>
            <div className="mt-6 flex flex-col items-stretch gap-3">
              <button
                type="button"
                style={HAND}
                className={primary}
                disabled={!price || busy !== null}
                onClick={onBuy}
              >
                {busy === 'purchase'
                  ? 'turning the page…'
                  : price
                    ? `Unlock the full notebook - ${price}`
                    : 'opening the notebook…'}
              </button>
              <button
                type="button"
                style={HAND}
                className={btn}
                disabled={busy !== null}
                onClick={onRestore}
              >
                {busy === 'restore' ? 'looking for your purchase…' : 'Restore purchase'}
              </button>
            </div>
            <p className="mt-4 text-xs opacity-60">
              One purchase. No subscription. No ads. Apple or Google handles the payment.
            </p>
          </>
        ) : (
          <>
            <p style={HAND} className="mt-6 text-lg">
              The rest of the notebook is on iPhone and Android.
            </p>
            <button type="button" style={HAND} className={`${btn} mt-5`} onClick={onClose}>
              Back to title
            </button>
          </>
        )}

        {(error || notice) && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-4 text-sm ${error ? 'text-[#a33a2a]' : 'text-[#39628f]'}`}
          >
            {error ?? notice}
          </p>
        )}

        {native && (
          <button
            type="button"
            style={HAND}
            className="mt-4 text-sm underline underline-offset-4 opacity-60 disabled:opacity-30"
            disabled={busy !== null}
            onClick={onClose}
          >
            {reason === 'demo' ? 'Back to title' : 'not yet'}
          </button>
        )}
      </div>
    </div>
  )
}
