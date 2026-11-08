'use client'
// The store only exists in the native shell. Web is the 3-page demo and
// never talks to RevenueCat.
import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { GameEngine } from '@/game/core/engine'
import {
  billingAvailable,
  isUserCancelled,
  loadEntitlement,
  loadPrice,
  purchaseFullNotebook,
  readCachedUnlock,
  restoreFullNotebook,
  writeCachedUnlock,
} from './billing'

export type BillingBusy = 'purchase' | 'restore' | null

export function useBilling(engineRef: RefObject<GameEngine | null>) {
  const [native, setNative] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [price, setPrice] = useState<string | null>(null)
  const [busy, setBusy] = useState<BillingBusy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const applyUnlock = useCallback(
    (next: boolean) => {
      setUnlocked(next)
      writeCachedUnlock(next)
      const engine = engineRef.current
      if (!engine) return
      engine.campaignLimit = next ? 8 : 3
      // buying from the demo cliffhanger should turn page 4, not replay 1-3
      if (next && engine.status === 'victory') engine.continueCampaign()
    },
    [engineRef],
  )

  useEffect(() => {
    const isNative = billingAvailable()
    setNative(isNative)
    if (!isNative) return

    if (readCachedUnlock()) applyUnlock(true)
    let cancelled = false
    Promise.allSettled([loadEntitlement(), loadPrice()]).then(([entitlement, priceResult]) => {
      if (cancelled) return
      if (entitlement.status === 'fulfilled') applyUnlock(entitlement.value)
      if (priceResult.status === 'fulfilled') setPrice(priceResult.value)
    })
    return () => {
      cancelled = true
    }
  }, [applyUnlock])

  const buy = useCallback(async () => {
    if (busy) return
    setBusy('purchase')
    setError(null)
    setNotice(null)
    try {
      if (await purchaseFullNotebook()) {
        applyUnlock(true)
      } else {
        setError('The store is still finishing. Try Restore in a moment.')
      }
    } catch (err) {
      // closing the store sheet is not an error
      if (!isUserCancelled(err)) {
        setError('The store could not finish. Check your connection and try again.')
      }
    } finally {
      setBusy(null)
    }
  }, [applyUnlock, busy])

  const restore = useCallback(async () => {
    if (busy) return
    setBusy('restore')
    setError(null)
    setNotice(null)
    try {
      if (await restoreFullNotebook()) {
        applyUnlock(true)
        setNotice('Welcome back. The rest of the notebook is yours.')
      } else {
        setError('No full-notebook purchase was found on this account.')
      }
    } catch {
      setError('The store could not finish. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }, [applyUnlock, busy])

  const refreshPrice = useCallback(async () => {
    try {
      setPrice(await loadPrice())
    } catch {
      /* keep the last known price; the buy button stays disabled without one */
    }
  }, [])

  const clearMessages = useCallback(() => {
    setError(null)
    setNotice(null)
  }, [])

  return {
    native,
    unlocked,
    price,
    busy,
    error,
    notice,
    buy,
    restore,
    refreshPrice,
    clearMessages,
  }
}
