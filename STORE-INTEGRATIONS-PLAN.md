# STORE INTEGRATIONS - PLAY GAMES, REVENUECAT, AND ADS

The detailed plan for adding a paid unlock, platform leaderboards/achievements,
and (only if you insist) ads to **The Notebook That Forgot You**.

**Status: plan only.** None of the integration code in this document has been
added to the game yet. This is the implementation and setup checklist.

**Target app:** `com.notebookforget.game` (iOS + Android)
**First store version:** `1.0.0`
**Pipeline:** GitHub Actions, no Mac required for the normal build/upload path
**Companion docs:** `MONETIZATION.md` (business model), `STORE-LAUNCH.md`
(accounts, signing, store submission)

---

## 0. The recommendation in one screen

| Integration | Ship in 1.0.0? | Recommendation | Real effort | Why |
|---|---|---|---|---|
| **RevenueCat + one-time full-game unlock** | **Yes** | **Do it first** | 2-3 days | It is the only integration that directly makes money. It also forces the web demo gate. |
| **Google Play Games (Android)** | No | **1.1.0** | 2-3 days | Leaderboard + achievements are retention features, not revenue. Play Console app record and testers are already needed for launch. |
| **Apple Game Center (iOS)** | No | **1.1.x, or skip** | 2-4 days | The plugin is fine; the no-Mac Game Center capability/profile work is the risk. Do it after the app is live. |
| **AdMob ads** | **No** | **Do not ship** | 3-5 days + compliance | Technically possible, but the game has no good ad placement, low eCPM, and ads would damage the premium atmosphere and purchase conversion. Full plan is in section 7 if you overrule this. |

**The order is deliberate:**

1. **RevenueCat** - without a paywall, the web version undercuts the mobile app
   and there is no business.
2. **Play Games / Game Center** - nice-to-have social proof, zero direct revenue.
3. **Ads** - a different business model; do not mix it into a $3.99 premium
   puzzle game at launch.

**If you only have one week:** ship 1.0.0 with RevenueCat and the 3-page demo.
Skip Play Games, skip Game Center, skip ads. Those can be 1.1 and 1.2.

---

## 1. What exists today

### Ready

| Piece | Status |
|---|---|
| Game | 8-page campaign, endless mode, three inks, local best score |
| Capacitor shell | Android generated; iOS not generated yet |
| Touch controls | Working |
| Store build flavor | `STORE_EXPORT=1` static export, no GitHub Pages base path |
| Android release | Signed AAB/APK pipeline exists, keystore not generated yet |
| iOS release | Unsigned archive path exists; signing/TestFlight is manual-signing ready |
| Store assets | Icon, Play icon, feature graphic |
| Privacy policy | Public URL exists, but it currently claims **no data collection and no purchases** |

### Missing

| Piece | Why it matters |
|---|---|
| App Store Connect app record | Required before IAP, TestFlight, Game Center |
| Play Console app record | Required before IAP and Play Games |
| RevenueCat project/products | Required for entitlement, restore, purchase analytics |
| Payment agreements (Apple/Google) | Without these, products do not load |
| Web demo gate | The full web game must become pages 1-3 |
| Paywall / restore UI | No purchase path exists |
| Play Games project + IDs | Needed for Android leaderboard/achievements |
| Game Center capability + profile | Needed for iOS leaderboard/achievements |
| Updated privacy policy + store data labels | Required once RevenueCat/PGS/ads exist |
| iOS `ios/` project | `ios-init` has not been run |

### What the player will see after 1.0.0

```
Web (GitHub Pages)             Mobile (free download)
-----------------              ----------------------
Pages 1-3                      Pages 1-3
"to be continued"              Paywall at the page-3 cliffhanger
Store buttons                  $3.99 one-time unlock (launch: $2.99)
No IAP, no ads                 Pages 4-8 + endless mode after purchase
No tracking                    Restore purchases
                               No ads, no subscription, no account
```

The mobile app is one binary. The first three pages are free; the entitlement
opens the rest. Do not build a separate "demo APK" and "full APK" - that doubles
the store work and makes restore/updates harder.

---

## 2. Sequencing and dependencies

### Phase 0 - accounts and store records (start now, parallel with code)

| Task | Depends on | Notes |
|---|---|---|
| Apple Developer Program | Nothing | $99/year, 1-2 day review |
| App Store Connect app record | Apple account | Bundle ID `com.notebookforget.game`, SKU `notebook-that-forgot-you` |
| Google Play Console account | Nothing | $25 one-time, identity verification can take days |
| Play Console app record | Google account | Create as a **free game**, package `com.notebookforget.game` |
| Paid Apps agreement + banking/tax (Apple) | Apple account | IAP will not load without it |
| Play App Signing | Play app record | Default; keep the upload keystore backed up |
| Support email + privacy URL | Nothing | Needs to be public for both stores |

### Phase 1 - RevenueCat and the demo gate (1.0.0)

1. Create products in App Store Connect and Play Console.
2. Create the RevenueCat project, apps, entitlement, and offering.
3. Add `@revenuecat/purchases-capacitor`.
4. Add the demo limit and the paywall.
5. Test with Apple sandbox and Google license testers.
6. Build 1.0.0, upload to TestFlight / Play closed testing.
7. Submit to Apple review; start the Play 14-day clock.
8. Release.

### Phase 2 - Play Games / Game Center (1.1.0)

Only after 1.0.0 is live. Play Games needs the Play app record and a signed build;
Game Center needs the App ID capability and a regenerated profile. Doing this
before 1.0.0 delays the only revenue-critical release for a feature that makes
no money.

### Phase 3 - ads (1.2+, or never)

Start only if the free-tier metrics after 30-60 days show a large non-buying
audience and a better ad/LTV model. The plan in section 7 exists for
completeness, not because it is recommended.

### Critical path

```
Apple/Google accounts
        |
        +--> store records --> IAP products --> RevenueCat --> 1.0.0
        |                                               |
        |                                               +--> Play 14-day clock
        |
        +--> Android AAB --> Play Games (1.1.0)
        |
        +--> iOS shell --> signing/profile --> TestFlight --> Game Center (1.1.x)
```

**The Play 14-day clock is the longest external dependency.** Do not wait for
Play Games or ads to start it. Start it with the monetized 1.0.0 build. If the
RevenueCat work slips, you can upload a build to the closed track to start the
clock and update it before production; keep the same testers opted in and
confirm in Play Console that the clock is still running.

---

## 3. Architecture

### 3.1 Keep the shell, add thin native adapters

Do not rewrite the game or add a backend. The Canvas engine stays the product.
The native integrations are small adapters behind the existing React shell.

```
GameShell.tsx (React chrome)
  |
  +-- DemoEnd / Paywall / Restore UI
  |
  +-- src/native/billing.ts ------> RevenueCat ------> App Store / Play Billing
  |
  +-- src/native/games.ts --------> Play Games / Game Center
  |
  +-- src/native/ads.ts ----------> AdMob (phase 3 only)
  |
  +-- src/game/core/engine.ts ----> maxCampaignRooms (demo gate)
```

### 3.2 File map

| File | Change | Purpose |
|---|---|---|
| `package.json`, `bun.lock` | Add dependencies | RevenueCat, Play Games, optional AdMob |
| `src/native/config.ts` | New | Public SDK keys, product IDs, leaderboard/achievement IDs |
| `src/native/billing.ts` | New | RevenueCat init, entitlement, price, purchase, restore |
| `src/native/games.ts` | New | Play Games/Game Center init, sign-in, score, achievements |
| `src/native/ads.ts` | New (phase 3 only) | UMP consent, ATT, rewarded ad |
| `src/game/core/engine.ts` | Small change | `campaignLimit`, demo victory, `continueCampaign()` |
| `src/components/GameShell.tsx` | Main UI change | Entitlement state, paywall, demo end, native buttons |
| `src/components/Paywall.tsx` | New (or inline) | Price, buy, restore, errors, links |
| `src/components/DemoEnd.tsx` | New (or inline) | Web store CTA / mobile paywall host |
| `public/privacy.html` | Rewrite | Purchases, RevenueCat, platform services, optional ads |
| `public/support.html` | New (recommended) | Support email, refunds, terms links |
| `android/app/src/main/res/values/games-ids.xml` | New | PGS project ID |
| `android/app/src/main/AndroidManifest.xml` | Add metadata | PGS app ID; AdMob app ID if ads |
| `android/app/src/main/res/values/strings.xml` | Add AdMob ID | Only if ads |
| `ios/App/App/Info.plist` | Add AdMob keys | Only if ads |
| `ios/App/App/App.entitlements` | New | Game Center entitlement |
| `ios/App/App.xcodeproj/project.pbxproj` | Add entitlement setting | Game Center capability |
| `.github/workflows/store-release.yml` | Add env/verification | Public keys, manifest/entitlement checks |

### 3.3 Rules for native code

1. **Only call native plugins behind `Capacitor.isNativePlatform()`.**
   The web build must never import or execute RevenueCat, Play Games, or AdMob.
2. **Use dynamic imports** inside the adapter functions. This keeps the web
   bundle clean and avoids "plugin not implemented on web" errors.
3. **Native failures never block the game.** If billing is down, the player can
   still play the demo. If leaderboards fail, the local best still works.
4. **No global state library.** `GameShell` already owns UI state; keep the
   entitlement and sign-in state there. The adapters are stateless functions
   plus a module-level init promise.
5. **No backend.** RevenueCat validates receipts; the stores handle payments;
   Play Games/Game Center store scores. The game stays offline-first.
6. **No accounts.** Do not add email/password, Sign in with Apple, or a custom
   user ID. RevenueCat anonymous IDs and platform game IDs are enough.

### 3.4 Fixed IDs

Use these exact values unless a store rejects one. Keeping them consistent
across code, consoles, and tests avoids the most common integration bug.

| Item | Value |
|---|---|
| Bundle ID / package | `com.notebookforget.game` |
| RevenueCat entitlement | `full_notebook` |
| RevenueCat offering | `default` |
| RevenueCat package | `$rc_lifetime` |
| Store product ID (both stores) | `com.notebookforget.game.full_notebook` |
| Product display name | `Full Notebook` |
| Play Games project ID | `<your PGS project ID>` (numeric, from Play Console) |
| Endless leaderboard ID | `notebook_endless_depth` |
| Achievement prefix | `notebook_` |
| Local best key (existing) | `forgotten-best-page` |
| Local unlock cache | `forgotten-entitlement` (new) |
| Local submitted score | `forgotten-submitted-score` (new) |
| Local pending achievements | `forgotten-pending-achievements` (new) |

**Product ID note:** Apple and Google are separate namespaces, so the same
product ID is allowed. If a console complains, use
`com.notebookforget.game.full_notebook.ios` and `.android`, then map both to the
same RevenueCat entitlement. Do not change it after launch; existing buyers
would lose restore.

### 3.5 Build-time configuration

RevenueCat **public SDK keys** are safe in the app binary. They are not secrets.
Do not put RevenueCat secret keys (`sk_...`) in the app, repo, or CI.

| Variable | Used by | Where |
|---|---|---|
| `NEXT_PUBLIC_REVENUECAT_IOS_KEY` | store export | GitHub Actions repository variable |
| `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` | store export | GitHub Actions repository variable |
| `PGS_PROJECT_ID` | Android resource | Committed in `games-ids.xml` |
| AdMob app IDs | native config | Committed (public) if ads |
| AdMob ad unit IDs | app code | Committed (public) if ads |

The GitHub Pages build does not need any of these. Only the `web` job inside
`store-release.yml` sets them, because that artifact feeds both native shells.

---

## 4. RevenueCat - the one-time full-game unlock

### 4.1 Product model

| Store | Product type | Product ID | Price | Notes |
|---|---|---|---|---|
| App Store | **Non-consumable** | `com.notebookforget.game.full_notebook` | $3.99 | Launch $2.99 for 14 days; enable Family Sharing if available |
| Google Play | **In-app product (non-consumable)** | `com.notebookforget.game.full_notebook` | $3.99 | Launch $2.99; Google handles local pricing |
| RevenueCat | Entitlement | `full_notebook` | - | Attach both store products |
| RevenueCat | Offering | `default` | - | Set as current |
| RevenueCat | Package | `$rc_lifetime` | - | Lifetime package |

**Do not use a subscription.** There is no ongoing service. Apple and Google
review subscriptions with stricter rules (restore, terms, renewal disclosure)
and players will punish it.

**Do not promise cross-platform ownership.** An iOS purchase does not unlock
Android, and vice versa. Restore works only on the same store account. If you
want cross-platform entitlement later, you need accounts + a backend; that is a
different project. Store copy should say "one-time unlock on this store," not
"buy once, play everywhere."

### 4.2 App Store Connect setup

Do this in order. Apple hides IAP until the app record and Paid Apps agreement
exist.

1. **Create the app record**
   - Platform: iOS
   - Name: `The Notebook That Forgot You`
   - Bundle ID: `com.notebookforget.game`
   - SKU: `notebook-that-forgot-you`
   - Primary language: English (U.S.)
   - Price: Free
   - Category: Games > Adventure (secondary: Puzzle)
   - Availability: all countries/regions where you can support the game
   - Privacy policy URL: `https://ahmed-m-elgammal.github.io/forgotten-game/privacy.html`
   - Support URL: a real support page or the repository URL
   - Copyright: your name / studio

2. **Complete the Paid Apps agreement**
   - App Store Connect > Business > Agreements, Tax, and Banking.
   - Accept the Paid Apps agreement.
   - Complete banking and tax forms.
   - Without this, `getOfferings()` returns no products.

3. **Create the in-app purchase**
   - App Store Connect > Your App > Monetization > In-App Purchases.
   - Type: **Non-Consumable**.
   - Reference Name: `Full Notebook`.
   - Product ID: `com.notebookforget.game.full_notebook`.
   - Price: $3.99; schedule $2.99 for the first 14 days if you want a launch
     price. Do not hardcode the price in the game; read `priceString`.
   - Localization: English display name `Full Notebook`; description
     `Pages 4-8, endless mode, all inks, all endings. One purchase.`
   - Review screenshot: the paywall, landscape, with the price and "Restore"
     visible. No external store links.
   - Availability: all territories.
   - Family Sharing: enable if the option is available for this product.
   - Add the IAP to the 1.0.0 app version before submitting. A new non-consumable
     normally must be submitted with an app version (or the next version) before
     it can be reviewed.

4. **Create sandbox testers**
   - App Store Connect > Users and Access > Sandbox > Testers.
   - Use a dedicated Apple ID, not your personal one.
   - On the test device, sign out of the App Store (Settings > App Store), then
     run the TestFlight build; the sandbox prompt appears at purchase.

5. **App Review notes**
   - "The full game is a non-consumable IAP. Restore Purchases is on the title
     screen and the paywall. No account or login is required. The first three
     pages are free."

### 4.3 Google Play setup

Google requires the app to exist and at least one build to be uploaded before
billing can be tested. Sideloaded APKs cannot purchase.

1. **Create the app**
   - Play Console > All apps > Create app.
   - Name: `The Notebook That Forgot You`
   - Package: `com.notebookforget.game`
   - App or game: Game
   - Free or paid: Free
   - Category: Games > Puzzle (tags: platformer, adventure, indie)
   - Contact email: your support email
   - Privacy policy URL: same public URL as Apple

2. **Complete the store setup**
   - App access: "All functionality is available without special access."
   - Ads: **No** (unless you actually ship ads; then yes).
   - Content rating questionnaire: digital purchases = yes; ads = no; no
     user-generated content; no location sharing.
   - Data safety: purchase history at minimum once RevenueCat is in. Do not
     submit "no data collected" after adding the SDK.
   - Target audience: 13+ (or your actual rating). Do not put the game in
     Families if it has purchases or ads.
   - Play App Signing: enabled (default). Keep the upload keystore safe.

3. **Create the in-app product**
   - Play Console > Monetize > Products > In-app products > Create.
   - Product ID: `com.notebookforget.game.full_notebook`.
   - Name: `Full Notebook`.
   - Description: `Pages 4-8, endless mode, all inks, all endings. One purchase.`
   - Price: $3.99; launch $2.99 if desired.
   - Status: **Active**.

4. **Set up license testing**
   - Play Console > Setup > License testing.
   - Add the Google accounts of your testers.
   - Testers install from the internal/closed track, not from a sideloaded APK.
   - Test purchases are free; use the test card. Do not use real payment
     instruments.

5. **Upload a build to a track**
   - Upload the signed AAB to Internal testing first (fast).
   - Then create the Closed testing track with 12 testers for the 14-day clock.
   - The in-app product must be Active and the build must be from Play for
     billing to work.

### 4.4 RevenueCat project setup

1. **Create the project** at `app.revenuecat.com`.
   - Project: `The Notebook That Forgot You`.

2. **Add the two apps**
   - iOS app: bundle ID `com.notebookforget.game`.
   - Android app: package `com.notebookforget.game`.
   - Copy the **public SDK keys** (`appl_...` for iOS, `goog_...` for Android).
   - Never copy the secret keys into the app.

3. **Connect the stores**
   - iOS: add an App Store Connect API key (Issuer ID, Key ID, `.p8`) so
     RevenueCat can import products and validate purchases. Follow RevenueCat's
     current iOS setup guide; have the app-specific shared secret ready if the
     dashboard asks for it.
   - Android: create a Google Cloud service account, grant it the Play Console
     permissions RevenueCat lists, download the JSON key, and upload it to
     RevenueCat. This is the Google Play Developer API connection, not the Play
     Games project.
   - Never commit the `.p8` or the service-account JSON.

4. **Create the entitlement**
   - Identifier: `full_notebook`.
   - Description: `Pages 4-8, endless mode, all endings.`

5. **Create/import the products**
   - App Store product: `com.notebookforget.game.full_notebook`.
   - Play product: `com.notebookforget.game.full_notebook`.
   - Attach both to the `full_notebook` entitlement.

6. **Create the offering**
   - Identifier: `default`.
   - Package: Lifetime (`$rc_lifetime`).
   - Attach the iOS and Android products.
   - Mark the offering as **current**.
   - The game uses a custom paywall, not RevenueCat Paywalls. You only need the
     offering for price and purchase.

7. **Sandbox**
   - RevenueCat automatically separates sandbox data in the dashboard.
   - Do not judge revenue/conversion from sandbox purchases.

### 4.5 App code - `src/native/billing.ts`

Keep this file small and boring. The exact types can be adjusted to the plugin
version, but the shape should be:

```ts
import { Capacitor } from '@capacitor/core'
import type { PurchasesPlugin } from '@revenuecat/purchases-capacitor'

const IOS_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? ''
const ANDROID_KEY = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''

let initPromise: Promise<PurchasesPlugin | null> | null = null

export function billingAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

async function getPurchases(): Promise<PurchasesPlugin | null> {
  if (!billingAvailable()) return null
  if (!initPromise) {
    initPromise = (async () => {
      const { Purchases } = await import('@revenuecat/purchases-capacitor')
      const apiKey = Capacitor.getPlatform() === 'ios' ? IOS_KEY : ANDROID_KEY
      if (!apiKey) throw new Error('RevenueCat public key missing')
      await Purchases.configure({ apiKey })
      return Purchases
    })()
  }
  return initPromise
}

export function hasFullNotebook(customerInfo: {
  entitlements: { active: Record<string, unknown> }
}): boolean {
  return Boolean(customerInfo.entitlements.active['full_notebook'])
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
  const pkg =
    offerings.current?.lifetime ??
    offerings.current?.availablePackages.find((p) => p.packageType === 'LIFETIME')
  return pkg?.product.priceString ?? null
}

export async function purchaseFullNotebook(): Promise<boolean> {
  const Purchases = await getPurchases()
  if (!Purchases) return false
  const offerings = await Purchases.getOfferings()
  const pkg =
    offerings.current?.lifetime ??
    offerings.current?.availablePackages.find((p) => p.packageType === 'LIFETIME')
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
```

Implementation notes:

- Cache the entitlement locally only as an **offline grace** value. The source
  of truth is always RevenueCat's `customerInfo`.
- On launch: read the cache immediately (so a paying player is never locked out
  offline), then refresh in the background. If the refresh succeeds and the
  entitlement is gone (refund/chargeback), lock the full game again.
- Do not log customer info, receipts, or the anonymous app user ID.
- Do not call `Purchases.configure` more than once. The module-level promise
  handles React remounts.
- Do not call `Purchases.logIn` unless you add real accounts later.
- If the offering is missing, show "The notebook is resting. Try again later."
  Do not show a broken purchase button.

### 4.6 GameShell state

Add one small state object near the existing UI state:

```ts
type BillingState = {
  native: boolean
  ready: boolean
  unlocked: boolean
  price: string | null
  busy: 'purchase' | 'restore' | null
  error: string | null
}
```

On mount:

1. If `!Capacitor.isNativePlatform()`, mark `native: false`, `ready: true`,
   `unlocked: false`. The web is always the demo.
2. If native, read the cached entitlement first, then call
   `loadEntitlement()` and `loadPrice()`.
3. Set the engine's campaign limit to `unlocked ? 8 : 3`.
4. If the player purchases or restores successfully:
   - set `unlocked: true`;
   - set `engine.campaignLimit = 8`;
   - if the player is sitting on the demo end screen, call
     `engine.continueCampaign()` so they turn to page 4 instead of replaying;
   - write the offline cache.

Do not add a second global store. The game already uses local state and an
external store only for the best score; billing is the same scale.

### 4.7 Paywall UX

The paywall should feel like a page in the notebook, not a store ad.

**Trigger points**

1. **After page 3** - the primary, natural cliffhanger. This is the only
   mandatory gate.
2. **Title screen** - a quiet `Unlock the full notebook` link/button if not
   unlocked. Not a modal on launch.
3. **Endless button** - if tapped while locked, show the same paywall with
   "The margins are part of the full notebook."
4. **Restore** - always visible on the title screen and paywall.

**Copy**

```
The notebook has five more pages.
And it never stops writing.

[ Unlock the full notebook - $3.99 ]
[ Restore purchase ]

One purchase. No subscription. No ads. Play offline.
```

Use `priceString` from the store, not a hardcoded `$3.99`. If the price is still
loading, disable the button and show `...`; do not guess.

**States**

| State | UI |
|---|---|
| Loading | Disabled button, `Opening the notebook...` |
| Ready | Price + enabled buy button |
| Purchasing | Disabled button, `Turning the page...` |
| Purchase cancelled | Return to paywall, no error banner |
| Pending (Google) | `Your payment is still pending. The page will unlock when it clears.` |
| Restore in progress | Disabled restore, `Looking for your purchase...` |
| Restore found | `Welcome back. The rest of the notebook is yours.` then continue |
| Nothing to restore | `No purchase found on this account.` |
| Store unavailable | `The store is resting. Try again in a moment.` |
| Already unlocked | Do not show the paywall; show the game |

**Rules**

- Never show the paywall mid-page.
- Never show it on first launch.
- Never block the demo's first three pages.
- Never show two purchase prompts at once.
- The paywall must be dismissible; the player can return to the title or stay
  on the demo end screen.
- On web, the CTA is "Continue on iPhone / Android" with store links. There is
  no web purchase.
- On iOS and Android, do **not** link to external stores or a web checkout for
  digital goods. Use the native purchase path.
- Include Privacy and Terms links. Apple's standard EULA is acceptable for the
  terms link if you do not have custom terms.

**Accessibility**

- Real `<button>` elements, not clickable divs.
- Visible focus ring.
- `aria-live="polite"` for purchase/restore errors.
- At least 44x44 px touch targets.
- Escape/back closes the paywall (but not during an active purchase).
- The canvas is landscape; the paywall must scroll on short screens.

### 4.8 Restore, offline, and edge cases

| Case | Expected behavior |
|---|---|
| Fresh install, no purchase | Pages 1-3 only; paywall at page 3 |
| Purchase succeeds | Unlock immediately; no restart; continue to page 4 |
| Purchase cancelled | Stay on paywall; no error spam |
| Purchase pending (Google cash) | Show pending message; unlock on next entitlement refresh |
| Purchase fails (network/store) | Keep demo; show retry |
| App killed after purchase | On relaunch, entitlement refresh unlocks |
| Reinstall on same store account | Restore unlocks |
| New device, same store account | Restore unlocks |
| Different store account | No purchase found; buy again if desired |
| iOS -> Android | Separate purchase; no cross-store restore |
| Offline after purchase | Cached entitlement unlocks; refresh later |
| Offline fresh install | Demo only; show "Connect to restore" on the paywall |
| Refund/chargeback | Next successful refresh locks the full game; do not delete local best |
| Family Sharing (iOS) | If enabled, family members can restore/play |
| Price unavailable | Disable buy; never show a wrong price |
| Double tap | `busy` guard prevents duplicate purchase calls |
| RevenueCat outage | Demo still works; no crash |
| Old app version | Entitlement still works; update prompt optional |

**Offline cache format**

```ts
{ "unlocked": true, "checkedAt": 1760000000000 }
```

Use it only when the network/store check fails. Refresh on every launch. A
`shortcut:` comment in the code should note: cached entitlement is an offline
grace, not a security boundary; a determined user can modify local storage.

### 4.9 Testing RevenueCat

**Apple**

- TestFlight build (not a debug Xcode build if you have no Mac).
- Sandbox Apple ID signed out of the App Store first.
- Test: fresh, buy, cancel, restore, reinstall, offline, refund (sandbox
  refunds may not behave like production), family sharing if enabled.
- The sandbox purchase sheet shows `[Environment: Sandbox]`. If it shows
  production, stop.

**Google**

- Internal testing build; license tester account.
- Test card; purchase is free.
- Test: fresh, buy, cancel, pending (if available), restore, reinstall,
  offline, second device, account switch.
- If the product does not load, check: app uploaded to a track, product Active,
  license tester added, tester installed from Play, correct package.

**Both**

- The paywall price matches the store's localized price.
- Restore is visible and works.
- The web demo has no native purchase UI.
- The app does not crash if RevenueCat is unreachable.
- The game still runs at 60fps; billing init is off the render path.

### 4.10 RevenueCat launch checklist

- [ ] App Store Connect app record exists
- [ ] Paid Apps agreement, banking, tax complete
- [ ] IAP created, priced, localized, screenshot attached
- [ ] Play Console app record exists
- [ ] Play IAP created and **Active**
- [ ] Play App Signing enabled; upload keystore backed up
- [ ] RevenueCat apps created with correct bundle/package
- [ ] RevenueCat public keys in GitHub Actions variables
- [ ] RevenueCat secret keys NOT in repo/app
- [ ] Entitlement `full_notebook` attached to both products
- [ ] Offering `default` current, `$rc_lifetime` package attached
- [ ] TestFlight purchase and restore pass
- [ ] Play internal-testing purchase and restore pass
- [ ] Offline/cached entitlement pass
- [ ] Privacy policy updated
- [ ] Store data disclosures updated
- [ ] Review notes explain the IAP and restore

---

## 5. The demo gate (required for the paywall to mean anything)

### 5.1 Web

The GitHub Pages build becomes pages 1-3, then a quiet "to be continued" page
with store buttons. No IAP, no ads, no account.

- Keep the same game, same URL, same base path `/forgotten-game/`.
- The web is the top of the funnel, not a substitute product.
- Do not ship the full web game and ask mobile users to pay; that is the
  fastest way to make zero mobile revenue.

### 5.2 Mobile

The binary contains all 8 rooms. The **campaign limit** is 3 while locked and 8
after purchase. This avoids a second APK/IPA and lets the purchase continue the
same run.

### 5.3 Small engine change

Do not slice `ROOMS` in the data file. The native binary must be able to unlock
the rest without a restart. Add a limit to the engine:

```ts
// engine.ts
campaignLimit = 3 // set by the shell: 3 locked, 8 unlocked

// in doAdvance():
const limit = Math.min(this.campaignLimit, ROOMS.length)
if (this.roomIndex + 1 < limit) {
  this.roomIndex++
  this.loadRoom(this.roomIndex)
  this.bumpUi()
} else {
  this.status = 'victory'
  // existing ending/audio code
}

// in snapshot():
roomCount: this.mode === 'endless'
  ? this.roomIndex + 1
  : Math.min(this.campaignLimit, ROOMS.length)
```

Add one method for the post-purchase transition:

```ts
continueCampaign(): void {
  if (this.status !== 'victory') return
  if (this.roomIndex + 1 >= ROOMS.length) return
  this.roomIndex++
  this.loadRoom(this.roomIndex)
  this.status = 'playing'
  this.bumpUi()
}
```

The shell sets `campaignLimit`:

- Web: 3 (always).
- Native locked: 3.
- Native unlocked: 8.
- After purchase from the demo end: set 8, then `continueCampaign()`.

### 5.4 UI behavior

- When `ui.status === 'victory'` and the player is still locked, render the
  **DemoEnd / Paywall** overlay instead of the normal victory/ending screen.
  This avoids spoiling the ending and turns the cliffhanger into the offer.
- On web, the overlay is the store CTA.
- On native, it is the paywall.
- The normal victory screen and ending remain for unlocked players.
- The title screen's endless button opens the paywall when locked.
- The local best score remains available; it is not paywalled.

### 5.5 Copy for the web demo

```
The notebook has five more pages.
And it never stops writing.

Read the rest on iPhone or Android.
[ App Store ] [ Google Play ]

The first three pages are free.
One purchase. No ads. No subscription.
```

Add the store badges only after the apps are live; link to the store listings,
not to a checkout.

### 5.6 Do not over-engineer the gate

- The demo cap is a product decision, not DRM. A determined web user can inspect
  the bundle. Accept it.
- Do not add server checks, obfuscation, or license servers.
- Do not hide the web demo from search; it is the funnel.
- Do not change the GitHub Pages base path.

---

## 6. Play Games + Game Center

### 6.1 Scope

Add **one global endless-depth leaderboard** and **6-8 achievements**. No
multiplayer, no cloud saves, no sign-in gate, no cross-platform leaderboard.

| Platform | Service | Plugin |
|---|---|---|
| Android | Google Play Games Services v2 | `@idleflowgames/capacitor-play-games` |
| iOS | Apple Game Center (GameKit) | same plugin |
| Web | none | safe no-op; hide the UI |

The plugin is a single TypeScript API for both platforms. It is early (0.3.x),
so pin the exact version and keep the integration thin.

**Why not at launch:** it adds 2-4 days, requires the Play app record and a
regenerated iOS profile, and makes no direct money. It is a 1.1 feature.

### 6.2 Leaderboard and achievements

| Logical item | ID | Trigger |
|---|---|---|
| Deepest page | `notebook_endless_depth` | Endless run ends; submit best depth |
| First page | `notebook_first_page` | Complete campaign page 1 |
| Through the demo | `notebook_page_three` | Complete campaign page 3 |
| The whole notebook | `notebook_first_ending` | Complete the 8-page campaign |
| Into the margins | `notebook_endless_first` | Start an endless run |
| Page 10 | `notebook_depth_10` | Reach endless depth 10 |
| Page 25 | `notebook_depth_25` | Reach endless depth 25 |
| Page 50 | `notebook_depth_50` | Reach endless depth 50 |

You can add `notebook_all_inks` (use all three inks in one run) if the stats
already track it. Do not add achievements that require purchases; they should
reward play, not payment.

**Score:** the existing shell already computes the endless score as
`ui.roomIndex + 1` and saves it to `forgotten-best-page`. Submit that same
integer. Do not submit campaign progression as a leaderboard score.

**Cheating:** scores are client-side and can be spoofed. Keep the leaderboard
cosmetic. If you ever attach prizes, you need server-side verification
(`requestServerSideAccess` / identity signature) and a backend.

### 6.3 Android - Google Play Games setup

1. **Create the Play Games Services project**
   - Play Console > Play Games Services > Setup and management > Configuration.
   - Create a project; fill the game name, category, and contact details.
   - Copy the **project ID** (numeric). This is not the package name and not the
     Google Cloud project number.

2. **Add the resource**
   - Create `android/app/src/main/res/values/games-ids.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="game_services_project_id" translatable="false">YOUR_PGS_PROJECT_ID</string>
</resources>
```

3. **Add the manifest metadata**
   - Inside `<application>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
  android:name="com.google.android.gms.games.APP_ID"
  android:value="@string/game_services_project_id" />
```

   - `google-services.json` is not required for PGS v2. Do not add Firebase just
     for this.

4. **Create the leaderboard and achievements**
   - Play Games Services > Leaderboards > Create:
     - Name: `Deepest Page`
     - ID: `notebook_endless_depth`
     - Score format: Integer
     - Sort: High to low
     - Range: 1-9999
   - Create each achievement with its ID, name, description, points, and icon.
   - Publish the Play Games configuration. Changes can take hours to propagate.

5. **Add testers**
   - Play Games Services > Testers: add the same Google accounts that are in
     your Play testing tracks.
   - Play Console > License testing: add them there too if testing purchases.

6. **Upload the first build**
   - PGS needs the Play app record and a build on a track.
   - If Play Console asks for a SHA-1, use the **App signing key certificate**
     SHA-1 from Setup > App integrity, not the upload key. With Play App
     Signing, the app signing key is the one Google uses to distribute.
   - Install from the internal/closed track on a real device with the Play Store.

7. **Verify sign-in**
   - Install/open the Play Games app once on the test device.
   - Sign in with a tester account.
   - Launch the game, sign in, submit a score, open the leaderboard.

**Common Android failures**

| Symptom | Likely cause |
|---|---|
| Sign-in returns cancelled (`12501`) | Tester not added, app not on a track, PGS config not published |
| `DEVELOPER_ERROR` | Wrong project ID, package mismatch, SHA-1 mismatch |
| Leaderboard opens empty | Wrong ID, score not submitted, config not published |
| Purchase works but PGS does not | Different Google account for Play and PGS; use the same tester |
| Works in debug, fails in release | Release signed with a different key; PGS uses the app signing key |

### 6.4 iOS - Game Center setup (the no-Mac part)

This is the only part of the plan that is materially harder without a Mac.
The plugin needs the Game Center capability and a provisioning profile that
includes it. There are three honest options:

**Option A - borrow a Mac for 30 minutes (recommended if possible)**

1. Run the `ios-init` workflow first, or generate `ios/` locally on the Mac.
2. Open `ios/App/App.xcodeproj` in Xcode.
3. Select the App target > Signing & Capabilities > + Capability > **Game
   Center**.
4. Commit the modified `ios/` project (including the new entitlements file).
5. In App Store Connect, enable Game Center on the App ID and create the
   leaderboard/achievements.
6. Regenerate the App Store distribution profile with Game Center enabled, then
   update `APPLE_PROFILE_B64`.
7. Run the release workflow; verify the archive.

**Option B - text-patch the generated project (no Mac)**

1. Create `ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.game-center</key>
  <true/>
</dict>
</plist>
```

2. Add the entitlement build setting to all configurations in
   `ios/App/App.xcodeproj/project.pbxproj`:

```
CODE_SIGN_ENTITLEMENTS = App/App.entitlements;
```

   - Add it to the App target's Debug and Release build settings.
   - If the file is not in the project's file references, add it; otherwise
     Xcode may not copy it. A text patch is fragile; verify with an archive.
3. Enable Game Center on the App ID in the Apple Developer portal.
4. Create the leaderboard/achievements in App Store Connect.
5. Regenerate the distribution profile with Game Center enabled and update
   `APPLE_PROFILE_B64`.
6. Add a CI verification step:

```bash
codesign -d --entitlements :- build/App.xcarchive/Products/Applications/App.app
```

   The output must contain `com.apple.developer.game-center`.
7. If signing fails with "provisioning profile doesn't include the
   com.apple.developer.game-center entitlement," the profile is stale. Regenerate
   it; do not try to bypass.

**Option C - skip Game Center for now (recommended if Option A is unavailable)**

Ship Android Play Games in 1.1.0 and keep the local best on iOS. Add Game Center
in 1.1.1 when you can use a Mac or a cloud Mac. The iOS game is fully playable
without it. Do not block the launch on this.

**App Store Connect Game Center setup**

- App Store Connect > Your App > Features > Game Center.
- Leaderboards > Create:
  - Reference Name: `Deepest Page`
  - Leaderboard ID: `notebook_endless_depth`
  - Score Format: Integer
  - Score Submission: Best score
  - Sort: High to low
  - Range: 1-9999
- Achievements > Create each ID from section 6.2.
  - Points: 5-100 each; total under 1000.
  - Hidden: no (unless you want a secret).
  - Image: 512x512 or 1024x1024 PNG. Use simple ink-doodle icons.
- Submit the leaderboard/achievements with the app version. Game Center content
  is reviewed with the app.

### 6.5 App code - `src/native/games.ts`

Keep the wrapper thin and failure-tolerant:

```ts
import { Capacitor } from '@capacitor/core'
import type { PlayGamesPlugin } from '@idleflowgames/capacitor-play-games'

let initPromise: Promise<PlayGamesPlugin | null> | null = null

export function gamesAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

async function getGames(): Promise<PlayGamesPlugin | null> {
  if (!gamesAvailable()) return null
  if (!initPromise) {
    initPromise = (async () => {
      const { PlayGames } = await import('@idleflowgames/capacitor-play-games')
      await PlayGames.initialize()
      return PlayGames
    })()
  }
  return initPromise
}

export async function signInGames(interactive = false): Promise<boolean> {
  const games = await getGames()
  if (!games) return false
  const { signedIn } = await games.signIn({ silent: !interactive })
  return signedIn
}

export async function isSignedIn(): Promise<boolean> {
  const games = await getGames()
  if (!games) return false
  return games.isSignedIn()
}

export async function submitDepth(score: number): Promise<void> {
  const games = await getGames()
  if (!games) return
  await games.submitScore({ leaderboardId: 'notebook_endless_depth', score })
}

export async function unlock(id: string): Promise<void> {
  const games = await getGames()
  if (!games) return
  await games.unlockAchievement({ id })
}

export async function openLeaderboard(): Promise<void> {
  const games = await getGames()
  if (!games) return
  await games.showLeaderboard({ leaderboardId: 'notebook_endless_depth' })
}

export async function openAchievements(): Promise<void> {
  const games = await getGames()
  if (!games) return
  await games.showAchievements()
}
```

Implementation rules:

- Call `initialize()` once, after any ATT prompt (only relevant if ads exist).
- Use silent sign-in first. Do **not** show an interactive sign-in prompt on
  launch. Provide a "Play Games" / "Game Center" button on the title screen and
  game-over screen.
- If sign-in fails, hide the platform buttons and leave the local best intact.
- Add a `signInStateChanged` listener to update the UI if the player signs out
  from system settings.
- Submit the score after game over, not during play. If the player is offline,
  queue the best and submit on the next sign-in.
- Unlock achievements at the event, not every frame. Keep a local `Set` of
  already-unlocked IDs and a small pending queue for offline events.
- Do not call `requestServerSideAccess`; there is no backend.
- Do not use snapshots/cloud saves in 1.1. They add account/ownership edge cases
  for no player-visible benefit yet.

### 6.6 UX

Add only three small surfaces:

1. **Title screen**: `Play Games` or `Game Center` sign-in/status link, plus
   `Leaderboard` when signed in. Do not make it a giant button; the game's title
   is the hero.
2. **Game over (endless)**: `You reached page N` + `Sign in to post your page`
   if signed out, or `Leaderboard` if signed in. Never block the retry.
3. **Achievements**: a small `Achievements` link on the title screen. The
   platform's native UI handles the list; do not build a custom achievement
   screen.

Do not add:
- a sign-in gate;
- a "Play Games" splash screen;
- a custom leaderboard UI (the native one is better);
- cross-platform scores (they are separate);
- a purchase tie-in.

### 6.7 Testing Play Games / Game Center

| Case | Expected |
|---|---|
| Signed out, launch | No prompt; game plays; local best works |
| Tap sign-in, cancel | No crash; stays signed out |
| Signed in, finish endless | Score submitted; leaderboard shows it |
| Signed in, finish campaign | Achievement unlocks; no score |
| Offline, finish run | No crash; local best saved; pending score/achievement |
| Offline -> online, launch | Pending score/achievement flushes |
| Sign out in system settings | UI updates; local best stays |
| Second device, same account | Leaderboard score appears; no cloud save |
| Different platform | Separate leaderboard; no cross-play claim |
| Web build | No native buttons, no errors |
| Plugin unavailable | Hidden features; game still works |

### 6.8 Effort and go/no-go

| Work | Estimate |
|---|---|
| Android PGS project, IDs, manifest, testers | 1-2 days |
| Android plugin integration + tests | 1 day |
| iOS Game Center capability/profile/project | 1-2 days with Mac; 2-4 days text-patching |
| Shared code/UI/testing | 1 day |
| Buffer/review | 1-2 days |

**Go/no-go:** if the plugin blocks the Android release build for more than a
day, drop Play Games from that release. RevenueCat is the priority. If Game
Center signing is not verifiable, ship Android-only leaderboards and keep iOS
local.

---

## 7. Ads - technically possible, strongly not recommended

### 7.1 The short version

Can you add ads? Yes. `@capacitor-community/admob` works with Capacitor 8 and
supports banners, interstitials, and rewarded ads. Should you? **No, not for
this game at launch.**

The game's value is atmosphere, trust, and a one-time purchase. Ads break all
three. The revenue math is also bad at this scale.

### 7.2 The math (ballpark, not a promise)

- A rewarded ad might earn $10-25 eCPM in a good market; a banner far less.
- 1,000 daily players, one rewarded view each, 50% fill: roughly $5-12/day
  before taxes and unsold inventory.
- One $3.99 purchase nets about $3.39 at the 15% store rate. At a $15 eCPM,
  you need roughly **226 rewarded views** to equal one sale.
- If ads annoy even one potential buyer per 226 players, you break even at
  best; in practice, a premium puzzle game loses more.
- Ads add consent, ATT, privacy labels, Data Safety, app-ads.txt, ad SDK
  maintenance, test devices, and review risk. That is 3-5 days you could spend
  on the paywall or launch marketing.

**Do not buy user acquisition ads either.** Mobile CPIs are $1-3; revenue per
download at a 3% purchase rate is about $0.10. Paid acquisition loses money.

### 7.3 Placement analysis for this game

| Placement | Verdict |
|---|---|
| Banner on title | Breaks the notebook aesthetic; low revenue |
| Interstitial between pages | Worst possible; interrupts the core loop |
| App-open ad | Hostile; kills the mood before play |
| Rewarded for an extra bookmark | Distorts leaderboard fairness; needs "assisted" scoring |
| Rewarded to unlock page 4 temporarily | Cannibalizes the $3.99 unlock |
| Rewarded for a cosmetic ink/theme | Only sane option, but the game has no cosmetic economy yet |

**Therefore:** there is no good ad placement in the current design. If you want
ads, you are changing the product to free-to-play with cosmetics or energy.
That is a different game and a different plan.

### 7.4 If you overrule this - minimum viable ad plan

Only if you accept the tradeoffs:

1. **Rewarded ads only.** No banners, no interstitials, no app-open ads.
2. **Never show ads to `full_notebook` owners.** Check the entitlement first.
3. **Never show ads during gameplay.** Only at the title screen or after a run.
4. **Opt-in.** A button labeled `Watch to support the notebook` or `Watch for
   a cosmetic`. Never auto-play.
5. **No leaderboard advantage.** If an ad grants an extra bookmark, do not
   submit that run to the leaderboard.
6. **Start with a single placement** and a kill switch. Measure fill, eCPM,
   retention, and purchase conversion for 30 days.

### 7.5 AdMob setup

1. Create an AdMob account.
2. Add the Android app (`com.notebookforget.game`) and iOS app.
3. Create one rewarded ad unit per platform.
4. Add the AdMob **app IDs**:
   - Android: `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
  android:name="com.google.android.gms.ads.APPLICATION_ID"
  android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY" />
```

   - iOS: `ios/App/App/Info.plist`:

```xml
<key>GADIsAdManagerApp</key>
<true/>
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
<key>NSUserTrackingUsageDescription</key>
<string>This identifier helps show relevant ads that keep the notebook free to try.</string>
```

   - Add the `SKAdNetworkItems` Google requires; start with Google's own
     identifier and follow its current iOS quick-start list.
5. Add `@capacitor-community/admob` and run `bunx cap sync`.

### 7.6 Consent, ATT, and code order

Ads require a consent flow, not just an SDK call:

1. Request UMP consent info.
2. Show the consent form if required.
3. If consent is not ready, **do not request ads**.
4. On iOS, request ATT (after the consent context, before ad initialization).
5. Initialize AdMob.
6. Prepare/show the rewarded ad only after a user tap.

```ts
import { Capacitor } from '@capacitor/core'

let adsReady = false

export async function initAds(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob')

  let consent = await AdMob.requestConsentInfo()
  if (
    consent.isConsentFormAvailable &&
    consent.status === AdmobConsentStatus.REQUIRED
  ) {
    consent = await AdMob.showConsentForm()
  }
  if (!consent.canRequestAds) return false

  if (Capacitor.getPlatform() === 'ios') {
    await AdMob.requestTrackingAuthorization()
  }

  await AdMob.initialize()
  adsReady = true
  return true
}
```

Do not initialize AdMob before consent. Do not show the ATT prompt on first
launch without context. If the player declines, serve non-personalized ads only
if the consent framework allows it; otherwise show no ads.

### 7.7 app-ads.txt

AdMob requires `app-ads.txt` at the **root** of your developer website, for
example:

```
https://your-domain.com/app-ads.txt
```

For a GitHub Pages project site, the root is `https://ahmed-m-elgammal.github.io/`,
not `/forgotten-game/`. You cannot put the file at the user-site root unless you
create a `ahmed-m-elgammal.github.io` repository. Options:

- buy a custom domain and host `app-ads.txt` at its root;
- create a user-site GitHub Pages repo just for the file;
- skip ads.

Without app-ads.txt, demand and revenue are lower. This is another reason the
ads plan is not worth it at launch.

### 7.8 Ads testing

- Use Google's **test ad unit IDs** and test devices. Never click your own
  production ads.
- Test EEA/UK consent (form shown, declined, accepted), US/CCPA, iOS ATT
  accepted/denied, offline, ad unavailable, and a paying user (no ads).
- Verify no ad appears on top of gameplay controls or the paywall.
- Verify the game still runs if the ad SDK fails to initialize.
- Verify Data Safety and App Privacy labels after the SDK is included.

### 7.9 Ads go/no-go

Do not enable ads unless all are true:

- The free tier is large and retains well after 30-60 days.
- Purchase conversion is below 1%, so ad revenue is not cannibalizing sales.
- You have a cosmetic or optional reward that does not affect the leaderboard.
- You have a domain root for app-ads.txt.
- You have updated privacy, Data Safety, App Privacy, and content rating.
- You accept a lower-quality first impression.

If any of those is false, skip ads. A $2.99 cosmetic IAP or a tip jar is a
better use of the same engineering time.

---

## 8. Privacy, legal, and store disclosures

### 8.1 The current policy is wrong after integration

`public/privacy.html` currently says:

- "We don't keep anything."
- "no ads"
- "no purchases"
- "no third-party trackers"

That is true today, but it becomes false the moment RevenueCat, Play Games,
Game Center, or AdMob is added. **Do not ship 1.0.0 with the old policy.**

### 8.2 Data map

| Data | Source | Purpose | Shared with | Store disclosure |
|---|---|---|---|---|
| Purchase history / entitlement | Apple/Google via RevenueCat | Unlock, restore, fraud prevention | Apple/Google, RevenueCat | Purchases |
| Anonymous app user ID, device/OS, IP | RevenueCat SDK | Purchase validation, analytics | RevenueCat | Identifiers / Purchases (follow RevenueCat's guide) |
| Player ID, display name | Play Games / Game Center | Leaderboard, achievements | Google/Apple | Identifiers / Gameplay (follow platform guidance) |
| Advertising ID, IP, approximate location, ad interactions | AdMob (if ads) | Ads, consent, fraud prevention | Google/AdMob partners | Identifiers, Usage, Location (if ads) |
| Best score, mute state, cached entitlement | Device local storage | Gameplay, offline unlock | Nobody | Not collected; stays on device |

RevenueCat and AdMob are service providers/processors. The stores are the
merchants of record. Do not claim "no data collected" after adding either SDK.

### 8.3 Privacy policy rewrite outline

Replace the current "short version" and "what we never do" with:

1. **Short version** - "The game keeps your best score and settings on your
   device. Purchases are processed by Apple/Google and RevenueCat. If you use
   platform leaderboards, Apple/Google receive your player ID. We do not sell
   personal data."
2. **Purchases** - what RevenueCat receives, why, retention, how to restore.
3. **Platform game services** - Play Games/Game Center player ID/display name;
   optional sign-in; link to platform privacy policies.
4. **Ads** - only if enabled: AdMob, advertising ID, consent, ATT, opt-out.
5. **Local data** - best score, mute, cached entitlement; uninstall clears it.
6. **Children** - not directed to children; no actual knowledge; purchases
   require store account/parental approval; ads (if any) not designed for kids.
7. **Your choices** - restore, contact support, store refund process, consent
   settings (if ads).
8. **Contact** - a real support email, not only a GitHub issue link.
9. **Changes** - updated date.

### 8.4 Store labels

**Apple App Privacy**

- Do not select "Data Not Collected."
- At minimum: **Purchases** (purchase history).
- If RevenueCat/analytics/ads adds identifiers: **Identifiers**.
- If ads: **Usage Data**, **Identifiers**, and possibly **Location** (approximate).
- Follow RevenueCat's current App Privacy guide for the exact "linked to you"
  answers; the app has no account, but RevenueCat may still classify data.
- If you add crash reporting later, declare **Diagnostics**.

**Google Play Data Safety**

- At minimum: **Purchase history** collected, encrypted in transit.
- RevenueCat may also mean **Device or other IDs**.
- Play Games: player ID / gameplay data handled by Google; follow the form.
- Ads: **Advertising ID**, approximate location, ad interactions.
- Data deletion: no app account; uninstall clears local data; purchase records
  are retained by the stores/RevenueCat; provide a support contact.
- Do not mark "No data collected."

**Content ratings**

- Digital purchases: yes.
- Ads: yes only if ads are actually present.
- User-generated content: no.
- Location sharing: no.
- Target audience: 13+ (or your actual choice). Avoid Families.

### 8.5 Support and terms

Add a small public support page or section:

- Support email (dedicated, monitored).
- "Purchases are handled by Apple/Google. Refunds follow the store's policy."
- "Restore purchases is on the title screen and paywall."
- "No account is required."
- Links to the privacy policy and the platform terms/EULA.

Apple's standard EULA is acceptable for a simple non-subscription IAP. If you
write custom terms, have them reviewed; do not copy a subscription template.

### 8.6 Analytics

Do not add a third-party analytics SDK at launch. RevenueCat and the store
consoles give you purchases, installs, and conversion. Adding analytics means
more privacy labels, consent, and maintenance for very little signal at this
scale.

If you add it later:

- Prefer a privacy-friendly, EU-hosted option.
- Never send player IDs, emails, or free-form text.
- Update the policy and both stores' data disclosures.
- Do not track across apps without ATT (iOS).

---

## 9. CI/CD, signing, and release mechanics

### 9.1 Public configuration (not secrets)

| Name | Value | Where |
|---|---|---|
| `REVENUECAT_IOS_KEY` | `appl_...` | GitHub Actions **variable** |
| `REVENUECAT_ANDROID_KEY` | `goog_...` | GitHub Actions **variable** |
| `PGS_PROJECT_ID` | numeric | `games-ids.xml` (committed) |
| AdMob app IDs | `ca-app-pub-...` | native config (committed, only if ads) |
| AdMob rewarded unit IDs | `ca-app-pub-.../...` | app config (committed, only if ads) |

RevenueCat public SDK keys are not secrets, but keeping them in repository
variables makes it easy to swap test/production projects without code changes.
Never put RevenueCat **secret** keys (`sk_...`) in the app or CI.

### 9.2 Existing secrets

Keep using the secrets from `STORE-LAUNCH.md`:

- `ANDROID_KEYSTORE_B64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (`upload`)
- `ANDROID_KEY_PASSWORD`
- `APPLE_P12_B64`
- `APPLE_P12_PASSWORD`
- `APPLE_PROFILE_B64`
- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_P8_B64`

Do not add RevenueCat/Google service-account JSON to GitHub. Those go into the
RevenueCat dashboard only.

### 9.3 Workflow changes

In `.github/workflows/store-release.yml`:

1. **Add the RevenueCat keys to the store web build** (only the `web` job that
   produces `next-store`):

```yaml
env:
  NEXT_PUBLIC_REVENUECAT_IOS_KEY: ${{ vars.REVENUECAT_IOS_KEY }}
  NEXT_PUBLIC_REVENUECAT_ANDROID_KEY: ${{ vars.REVENUECAT_ANDROID_KEY }}
```

2. **Fail the build if a native release is missing a key.** After Phase 1 is
   live, add a small check to the web job:

```bash
test -n "$NEXT_PUBLIC_REVENUECAT_IOS_KEY"
test -n "$NEXT_PUBLIC_REVENUECAT_ANDROID_KEY"
```

   Do not ship a "demo only" store build by accident.

3. **Commit `bun.lock`** after adding the plugins. CI uses
   `bun install --frozen-lockfile`.

4. **Android manifest verification** (after the build):

```bash
grep -q "com.android.vending.BILLING" \
  android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml
grep -q "com.google.android.gms.games.APP_ID" \
  android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml
```

   The exact intermediate path can vary; use `find` if needed. The point is to
   catch a missing billing permission or PGS metadata before upload.

5. **iOS entitlement verification** (only after Game Center):

```bash
codesign -d --entitlements :- \
  build/App.xcarchive/Products/Applications/App.app
```

   Fail the job if `com.apple.developer.game-center` is missing.

6. **iOS shell**: run `ios-init` once, commit `ios/`, then add RevenueCat via
   `cap sync`. RevenueCat, Play Games, and AdMob all ship SPM-compatible
   packages, so the Capacitor 8 SPM template should work. Verify with the first
   TestFlight archive.

7. **Versioning**: the first store release is manual, version `1.0.0`. Do not
   recreate the old `v1.0.0` tag. Future releases use `v1.0.1`, `v1.0.2`, etc.
   The workflow's run number is the build number/versionCode; it increases
   monotonically.

### 9.4 One-time setup order

1. Generate the Android keystore via the workflow; save the `.jks` and password.
2. Add the Android secrets.
3. Create the Play app record and upload an AAB to Internal testing.
4. Create the Apple app record, App ID, distribution certificate/profile.
5. Add the Apple/ASC secrets.
6. Run `ios-init`; commit `ios/`.
7. Add RevenueCat (and Game Center later); run `cap sync`; commit.
8. Run the manual 1.0.0 release.
9. Download the signed AAB and TestFlight build.
10. Start Play closed testing (12 testers) and TestFlight testing.

### 9.5 Release sequence for 1.0.0

1. Update privacy/support pages.
2. Add RevenueCat code + paywall + demo gate.
3. `bun install`; commit lockfile.
4. Run `bun run lint`; run `bun run build:store` locally.
5. Manual smoke test on Android/iOS if possible.
6. Run the `store-release` workflow with version `1.0.0`.
7. Upload the AAB to Play Internal testing; test purchase.
8. Upload to TestFlight; test purchase.
9. Fix; re-run (new versionCode/build number).
10. Promote to Play Closed testing with 12 testers; start the clock.
11. Submit iOS 1.0.0 with the IAP attached.
12. After Play's 14 days, apply for production; promote the build.
13. Launch. Tag future releases only.

---

## 10. QA matrix

### RevenueCat / demo

- [ ] Web: pages 1-3 only; no native UI; store CTA works.
- [ ] Android fresh install: pages 1-3; paywall at page 3; price shown.
- [ ] Android purchase: unlock; continue to page 4; endless works.
- [ ] Android cancel: no unlock; no crash; can retry.
- [ ] Android restore: works after reinstall.
- [ ] Android offline after purchase: cached unlock.
- [ ] Android offline fresh: demo; restore shows a network error.
- [ ] iOS fresh TestFlight: pages 1-3; paywall; price.
- [ ] iOS sandbox purchase: unlock; continue.
- [ ] iOS cancel: no unlock.
- [ ] iOS restore: works after reinstall.
- [ ] iOS offline after purchase: cached unlock.
- [ ] Refund/chargeback: next refresh locks.
- [ ] Price localization: no hardcoded `$`.
- [ ] Double-tap purchase: one sheet, no duplicate.
- [ ] Store outage: demo still playable.
- [ ] Paywall accessibility: focus, labels, 44px, scroll.
- [ ] Web demo is not accidentally full game.
- [ ] Local best still works while locked.

### Play Games / Game Center

- [ ] Signed out: no prompt; game plays.
- [ ] Sign-in cancel: no crash.
- [ ] Signed in: endless score appears on leaderboard.
- [ ] Achievement unlocks once, not repeatedly.
- [ ] Campaign completion achievement.
- [ ] Offline run queues score/achievement; flushes later.
- [ ] Sign out in system settings updates UI.
- [ ] Second device: leaderboard appears; no cloud save.
- [ ] Web: no buttons/errors.
- [ ] Android: PGS config published; tester account works.
- [ ] iOS: Game Center entitlement present in archive.
- [ ] iOS: profile includes Game Center.

### Ads (only if enabled)

- [ ] No ads for `full_notebook` owners.
- [ ] UMP form in EEA/UK; decline respected.
- [ ] ATT accepted/denied; non-personalized fallback.
- [ ] Test ad unit only; no production ads in test.
- [ ] No ad over controls/paywall.
- [ ] Offline/unavailable: game still works.
- [ ] Data Safety/App Privacy updated.
- [ ] app-ads.txt at domain root.
- [ ] Content rating includes ads.

### Store/review

- [ ] Apple: IAP attached to 1.0.0; review notes; screenshot.
- [ ] Apple: Restore visible.
- [ ] Apple: no external purchase links.
- [ ] Google: IAP Active; app on track; license testers.
- [ ] Google: Data safety; content rating; ads declaration.
- [ ] Both: privacy/support URLs live.
- [ ] Both: screenshots landscape; paywall screenshot if requested.
- [ ] Both: "no account required" accurate.
- [ ] Both: no mention of the other store's platform feature.
- [ ] Both: version 1.0.0, build number increasing.

---

## 11. Effort and timeline

### Realistic effort

| Work | Days |
|---|---|
| Store records, agreements, products | 1-2 (mostly waiting) |
| RevenueCat project + keys | 0.5 |
| Demo gate + paywall + restore UI | 2-3 |
| RevenueCat testing (Apple + Google) | 1-2 |
| Privacy/support/store labels | 0.5-1 |
| Play Games Android | 2-3 |
| Game Center iOS | 2-4 (signing-dependent) |
| Ads (if) | 3-5 |
| Store review/closed test | 14+ days for Play; 1-3 days for Apple |

### Calendar that actually works

**Week 0 - accounts**

- Apple Developer + Play Console accounts.
- App records, Paid Apps agreement, banking/tax.
- Support email and privacy URL.
- Keystore generation.

**Week 1 - RevenueCat**

- Create IAP products and RevenueCat project.
- Add billing adapter, paywall, demo gate.
- Test on Android internal testing and iOS TestFlight.
- Fix price/restore/offline issues.

**Week 2 - start the clocks**

- Upload 1.0.0 to Play Closed testing with 12 testers; start the 14-day clock.
- Submit iOS 1.0.0 with the IAP attached.
- Keep testers opted in; do not change the package or remove the track.

**Weeks 3-4 - launch**

- Apple review/launch.
- Play production access after 14 days; promote.
- Monitor reviews, refunds, crashes.
- Start 1.1 Play Games work only after 1.0.0 is live.

**Weeks 5-8 - 1.1**

- Play Games Android.
- Game Center iOS if the signing path is comfortable.
- Update store copy and privacy.
- Do not add ads unless the data says so.

### If you must start the Play clock immediately

Upload the current build to Closed testing today, then upload the RevenueCat
build to the same closed track before production. The 14-day clock is tied to
the testers staying opted in; a build update should not reset it, but confirm in
Play Console. This is a fallback, not the recommended path: testers should test
the real monetized build.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Play Games plugin is incompatible with Gradle 8.14/SDK 36 | Medium | Delays 1.1 | Test on a branch; bump Gradle/AGP/compileSdk only if needed; pin plugin 0.3.3 |
| Game Center entitlement/profile mismatch without a Mac | High | iOS 1.1 delay | Borrow a Mac or skip iOS Game Center; verify archive entitlements in CI |
| RevenueCat products not loading | Medium | No revenue | Complete Paid Apps agreement, IAP metadata, Active Play product, correct keys |
| Store rejects IAP because it is not attached to the version | Medium | Review delay | Add IAP to 1.0.0 before submission; review notes |
| Privacy policy/Data Safety stale | High if skipped | Rejection/removal | Rewrite before 1.0.0; follow RevenueCat/store guides |
| Play 14-day clock not started | Medium | Launch delay | Start closed testing with 12 testers as soon as 1.0.0 is testable |
| Android billing tested from sideload | High | "Product unavailable" | Always test from Internal/Closed track |
| Cross-store purchase confusion | Medium | Refunds/bad reviews | Do not promise cross-platform ownership; separate restore per store |
| Paywall shown at the wrong time | Low | Bad reviews | Only after page 3, title link, endless lock; never mid-page |
| Offline paying user locked out | Medium | Refund/bad review | Cache entitlement; refresh in background |
| Ads hurt conversion/retention | High | Revenue loss | Do not ship ads; if tested, rewarded-only and gate behind data |
| app-ads.txt missing | High if ads | Low ad revenue | Custom domain root or skip ads |
| Plugin adds ATT/consent ordering bugs | Medium if ads | Crashes/rejection | Follow UMP -> ATT -> initialize; test devices |
| Old v1.0.0 tag confusion | Low | CI/version confusion | Use manual 1.0.0 workflow; future tags v1.0.1+ |
| Keystore lost | Low | Cannot update Android app | Back up the `.jks` and passwords; Play App Signing recovery |
| Scope creep (PGS + ads at launch) | High | Missed launch | Ship RevenueCat only; 1.1/1.2 for the rest |

---

## 13. Checklists

### A. Decisions (before code)

- [ ] Free download + $3.99 one-time unlock (recommended)
- [ ] Launch price $2.99 for 14 days, or skip the launch discount
- [ ] Web becomes pages 1-3
- [ ] Play Games in 1.1, not 1.0
- [ ] Game Center in 1.1.x or skip
- [ ] No ads at launch
- [ ] Support email chosen
- [ ] Cross-platform purchase not promised

### B. Accounts and store records

- [ ] Apple Developer Program active
- [ ] App Store Connect app record created
- [ ] Paid Apps agreement, banking, tax complete
- [ ] Play Console account verified
- [ ] Play app record created
- [ ] Play App Signing enabled
- [ ] Android upload keystore generated and backed up
- [ ] Apple distribution certificate/profile created
- [ ] ASC API key created
- [ ] `ios-init` run and `ios/` committed
- [ ] 12 Play testers recruited

### C. RevenueCat

- [ ] Apple IAP created and priced
- [ ] Play IAP created and Active
- [ ] RevenueCat project/apps created
- [ ] App Store Connect API key connected
- [ ] Google service account connected
- [ ] Entitlement `full_notebook`
- [ ] Offering `default`, package `$rc_lifetime`
- [ ] Public keys in GitHub variables
- [ ] No secret keys in repo
- [ ] Sandbox purchase/restore passed
- [ ] License tester purchase/restore passed

### D. Code

- [ ] `@revenuecat/purchases-capacitor` added, lockfile committed
- [ ] `src/native/billing.ts` added
- [ ] `GameShell` entitlement state
- [ ] Paywall/DemoEnd UI
- [ ] Engine `campaignLimit` + `continueCampaign()`
- [ ] Web cap at 3 pages
- [ ] Native free cap at 3 pages
- [ ] Unlocked cap at 8 pages
- [ ] Cached entitlement/offline grace
- [ ] Restore visible
- [ ] Price from `priceString`
- [ ] Error/cancel/pending states
- [ ] Accessibility pass
- [ ] No native imports on web

### E. Play Games (1.1)

- [ ] PGS project created
- [ ] `games-ids.xml` added
- [ ] Manifest PGS metadata added
- [ ] Leaderboard `notebook_endless_depth`
- [ ] 6-8 achievements
- [ ] PGS config published
- [ ] Testers added
- [ ] Plugin pinned
- [ ] Silent sign-in only
- [ ] Score submit on game over
- [ ] Achievements on events
- [ ] Offline queue
- [ ] Android device test
- [ ] Web no-op

### F. Game Center (1.1.x)

- [ ] Game Center enabled on App ID
- [ ] Leaderboard/achievements in App Store Connect
- [ ] Capability/entitlement in Xcode project
- [ ] Profile regenerated with Game Center
- [ ] `APPLE_PROFILE_B64` updated
- [ ] CI entitlement check
- [ ] TestFlight sandbox test
- [ ] Local best fallback still works
- [ ] If blocked: skip iOS Game Center, ship Android only

### G. Ads (only if overriding the recommendation)

- [ ] Business case accepted
- [ ] Rewarded-only placement chosen
- [ ] No ads for buyers
- [ ] No ads during gameplay
- [ ] AdMob app IDs in native config
- [ ] UMP consent
- [ ] ATT (iOS)
- [ ] Test ad units/test devices
- [ ] app-ads.txt at domain root
- [ ] Privacy/Data Safety/App Privacy updated
- [ ] Content rating updated
- [ ] Kill switch
- [ ] 30-day measurement plan

### H. Launch

- [ ] Privacy policy updated and live
- [ ] Support page/email live
- [ ] Store data labels updated
- [ ] Store listing says "free demo + one-time unlock" honestly
- [ ] No external purchase links on mobile
- [ ] IAP attached to 1.0.0
- [ ] Restore tested on both stores
- [ ] Play closed test 12 testers / 14 days
- [ ] TestFlight tested
- [ ] Screenshots landscape
- [ ] Review notes written
- [ ] Version 1.0.0, build number increasing
- [ ] Old `v1.0.0` tag not recreated
- [ ] Post-launch monitoring for refunds/crashes

---

## 14. Appendix

### 14.1 Install commands

```bash
# RevenueCat
bun add @revenuecat/purchases-capacitor@14.1.0

# Play Games / Game Center
bun add @idleflowgames/capacitor-play-games@0.3.3

# Optional ads (do not add at launch)
bun add @capacitor-community/admob@8.3.0

bunx cap sync
```

Pin native plugins to exact versions. Do not let a `^` range silently change
native code between releases.

### 14.2 Useful commands

```bash
# Store export locally
bun run build:store

# Future tagged release (1.0.0 is manual)
git tag v1.0.1
git push origin main --tags

# Manual 1.0.0 release
gh workflow run store-release.yml -f version=1.0.0
```

### 14.3 Reference links

- Apple Developer: https://developer.apple.com/programs/
- App Store Connect: https://appstoreconnect.apple.com/
- Google Play Console: https://play.google.com/console/
- RevenueCat docs: https://www.revenuecat.com/docs/
- RevenueCat Capacitor SDK: https://www.revenuecat.com/docs/getting-started/installation/capacitor
- Play Games Services: https://developer.android.com/games/pgs
- Game Center: https://developer.apple.com/game-center/
- AdMob: https://admob.google.com/
- UMP consent: https://developers.google.com/admob/android/privacy
- app-ads.txt: https://support.google.com/admob/answer/9363762

### 14.4 Open decisions

1. **Launch price:** $3.99 with $2.99 for 14 days, or $3.99 from day one?
   Recommendation: use the launch price only if you can schedule it in both
   stores without manual work; otherwise keep $3.99 and avoid a calendar bug.
2. **Game Center:** do you have access to a Mac or cloud Mac for 30 minutes?
   If not, skip iOS Game Center for 1.1 and ship Android only.
3. **Ads:** is there any scenario where you would accept a lower-quality first
   impression for a few dollars a day? If not, mark ads permanently out of
   scope and remove the AdMob package from the plan.
4. **Support email:** create a dedicated address; do not use a personal inbox
   you do not monitor.
5. **Cross-platform ownership:** confirm you are comfortable with separate
   purchases. If not, the product needs accounts and a backend, which is a
   different project.

### 14.5 Definition of done for 1.0.0

- A new player can install from TestFlight/Play, play pages 1-3, see a fair
  paywall, buy once, continue to page 4, and finish the game.
- Restore works after reinstall on both stores.
- A paying player can play offline.
- The web demo is pages 1-3 and links to the stores.
- The game does not crash if RevenueCat/the store is unavailable.
- Privacy policy and both stores' data labels are accurate.
- No ads, no subscription, no account.
- The build is signed, versioned 1.0.0, and uploaded to both stores.

---

**Bottom line:** implement RevenueCat and the demo gate now. Add Play Games and
Game Center in 1.1 if players ask for scores. Do not add ads to this game.
