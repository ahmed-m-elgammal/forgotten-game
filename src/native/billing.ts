// RevenueCat's public SDK keys are safe in the app binary. Never put an
// `sk_...` secret key here, in the repo, or in CI.
import { Capacitor } from '@capacitor/core'
import type { PurchasesPlugin } from '@revenuecat/purchases-capacitor'
import type { CustomerInfo } from '@revenuecat/purchases-capacitor'

const IOS_KEY = 'appl_KaLljGriGlXLFgdjHjGyndfweUB'
const ANDROID_KEY = 'goog_ocdjtbjUiktrkOSvIYvhxwTyvhQ'
const CACHE_KEY = 'forgotten-full-notebook'

export function billingAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

/** Offline grace only - localStorage is not a security boundary. */
export function readCachedUnlock(): boolean {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const value = JSON.parse(raw) as { unlocked?: unknown }
    return value.unlocked === true
  } catch {
    return false
  }
}

export function writeCachedUnlock(unlocked: boolean): void {
  try {
    if (unlocked) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ unlocked: true, checkedAt: Date.now() }))
    } else {
      window.localStorage.removeItem(CACHE_KEY)
    }
  } catch {
    /* private mode - entitlement still works for this session */
  }
}

let initPromise: Promise<PurchasesPlugin | null> | null = null

async function getPurchases(): Promise<PurchasesPlugin | null> {
  if (!billingAvailable()) return null
  if (!initPromise) {
    initPromise = (async () => {
      const { Purchases } = await import('@revenuecat/purchases-capacitor')
      const apiKey = Capacitor.getPlatform() === 'ios' ? IOS_KEY : ANDROID_KEY
      await Purchases.configure({ apiKey })
      return Purchases
    })().catch((error) => {
      // a failed configure must not poison every later purchase attempt
      initPromise = null
      throw error
    })
  }
  return initPromise
}

export function hasFullNotebook(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active.full_notebook)
}

export async function loadEntitlement(): Promise<boolean> {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  const { customerInfo } = await Purchases.getCustomerInfo()
  return hasFullNotebook(customerInfo)
}

export async function loadPrice(): Promise<string | null> {
  const Purchases = await getPurchases()
  if (!Purchases) return null
  const offerings = await Purchases.getOfferings()
  return offerings.current?.lifetime?.product.priceString ?? null
}

export async function purchaseFullNotebook(): Promise<boolean> {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  const offerings = await Purchases.getOfferings()
  const pkg = offerings.current?.lifetime
  if (!pkg) throw new Error('Full Notebook product is not available')
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
  return hasFullNotebook(customerInfo)
}

export async function restoreFullNotebook(): Promise<boolean> {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  const { customerInfo } = await Purchases.restorePurchases()
  return hasFullNotebook(customerInfo)
}

export function isUserCancelled(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      ((error as { userCancelled?: unknown }).userCancelled === true ||
        (error as { code?: unknown }).code === '1'),
  )
}
