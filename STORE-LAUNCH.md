# STORE LAUNCH — THE NOTEBOOK THAT FORGOT YOU

Everything needed to ship v1.0.0 to **Google Play** and the **Apple App Store**.
The heavy lifting (builds, icons, splash, versions, signing hooks) is automated —
your part is accounts, secrets, and pressing the upload buttons.

---

## 0. What this repo now contains

| Piece | File(s) | Purpose |
| --- | --- | --- |
| Touch support | `src/game/input.ts`, `src/components/GameShell.tsx` | Pointer events (finger-drag draws planks), on-screen move/jump/keep/pads on touch screens |
| Mobile polish | `src/app/layout.tsx` | No pinch-zoom, notch-safe, paper-colored status bar |
| Capacitor shell | `capacitor.config.ts`, `android/` | Native wrapper — same Canvas engine, ~100% code reuse |
| Store export flavor | `next.config.ts` (`STORE_EXPORT=1`), `npm run build:store` | Static build **without** the GitHub Pages base path |
| Icons & splash | `assets/`, applied into `android/…/res` and `ios/…/Assets.xcassets` | Adaptive launcher icons + light/dark splash for both stores (regenerate: `python3 scripts/make-store-assets.py && bunx @capacitor/assets generate --android --ios`) |
| CI pipeline | `.github/workflows/store-release.yml` | On every `v*` tag: builds signed Android `.aab`/`.apk` + uploads iOS to TestFlight |
| Privacy policy | `public/privacy.html` | Required store URL: `https://ahmed-m-elgammal.github.io/forgotten-game/privacy.html` |

**Store assets** (ready to upload, in `assets/`): `icon-only.png` (1024², App Store icon),
`play-icon-512.png` (512², Play Store icon), `feature-graphic.png` (1024×500, Play Store banner).

---

## 1. Accounts (the only things money can buy that code can't)

| Store | Cost | Note |
| --- | --- | --- |
| Google Play Console | **$25 one-time** | play.google.com/console — identity check can take a few days |
| Apple Developer Program | **$99 / year** | developer.apple.com/programs — enrollment review 1–2 days |

> **Google gotcha:** personal Play accounts created after Nov 2023 must run a
> **closed test with 12 testers for 14 days** before production access. Start
> recruiting testers early (friends' Google accounts are fine). Organization
> accounts skip this.

**Recommended order: Google first** (fully automatable end-to-end, instant review
these days), Apple second (certificates add a manual hour).

---

## 2. Android — Google Play (step by step)

### 2.1 One-time: create your upload keystore (local)
The keystore IS your app's identity - if it's lost, the app can never be updated.
Never commit it, and **never generate it in GitHub Actions**: this repo is
public, so Actions artifacts and run summaries are world-readable.

Use `keytool` (ships with Java 21) on your own machine. Windows PowerShell:

```powershell
keytool -genkeypair -v -keystore "$HOME\notebookforget-upload.jks" -alias upload `
  -keyalg RSA -keysize 2048 -validity 10000 -storetype JKS
```

macOS / Linux:

```bash
keytool -genkeypair -v -keystore ~/notebookforget-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 -storetype JKS
```

Enter a strong password (use the same one for the key when asked) and fill in
the name/organization prompts. **Back up the `.jks` and the password** in a
password manager or offline drive - losing either blocks all future updates.

### 2.2 One-time: add repo secrets
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | base64 of the `.jks` (commands below) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 2.1 |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | same password as the keystore |

Windows PowerShell:

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\notebookforget-upload.jks"))
$b64 | gh secret set ANDROID_KEYSTORE_B64
gh secret set ANDROID_KEYSTORE_PASSWORD   # paste the password when prompted
gh secret set ANDROID_KEY_ALIAS --body upload
gh secret set ANDROID_KEY_PASSWORD        # paste the same password
```

macOS / Linux:

```bash
base64 -w0 ~/notebookforget-upload.jks | gh secret set ANDROID_KEYSTORE_B64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body upload
gh secret set ANDROID_KEY_PASSWORD
```

### 2.3 Every release
The first store release is **1.0.0** (the old `v1.0.0` tag belongs to the web
history). Run it manually: **Actions → store-release → Run workflow → version
`1.0.0`**.

Later releases use a tag:
```bash
git tag v1.0.1 && git push origin main --tags
```
The workflow runs → download the Android artifact → you get
`app-release.aab` (store upload) + `app-release.apk` (direct install testing:
`adb install app-release.apk`).

### 2.4 Play Console checklist
1. **All apps → Create app**: name *The Notebook That Forgot You*, default
   language English, **Game**, Free.
2. **Test → Closed testing**: create a track, upload the `.aab` (or start in
   internal testing with up to 100 testers — no 12-tester rule there, good for
   a first build sanity check).
3. **Store listing**: paste the copy from §4 below, upload `feature-graphic.png`
   + 2–8 phone screenshots (see §5).
4. **Content rating → IARC questionnaire**: puzzle game, no violence beyond
   cartoon ink, no user-generated content, one-time in-app purchase, no ads →
   expected rating *Everyone / PEGI 3*.
5. **App content**: privacy policy URL =
   `https://ahmed-m-elgammal.github.io/forgotten-game/privacy.html`.
   **Data safety is not “no data”**: declare *Purchase history* and
   *Device or other IDs* collected (not shared, encrypted in transit) by
   RevenueCat for app functionality — validating and restoring the one-time
   full-notebook unlock. No account, no ads, no analytics, no location.
   Give the privacy-policy contact as the deletion-request route.
6. When the closed test has its testers and 14 days are done → **Promote to
   production**. Reviews usually clear within a day for small puzzle games.

---

## 3. iOS — App Store (step by step)

### 3.1 One-time: commit the iOS shell
**Done.** `ios/` is committed, and `cap sync ios` includes RevenueCat in
`ios/App/CapApp-SPM/Package.swift`. Future releases reuse the committed project.

### 3.2 One-time: distribution certificate + App Store profile (Windows works)
No Mac needed — OpenSSL (bundled with Git for Windows) makes the CSR:
```bash
openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr \
  -subj "/CN=Ahmed Elgammal/O=Ahmed Elgammal/C=EG"
```
1. developer.apple.com → **Certificates** → **+** → **Apple Distribution** →
   upload `dist.csr` → download `distribution.cer`.
2. Combine into a `.p12` (choose a password when prompted):
```bash
openssl x509 -inform DER -in distribution.cer -out distribution.pem
openssl pkcs12 -export -legacy -inkey dist.key -in distribution.pem -out Certificates.p12
```
3. developer.apple.com → **Identifiers** → **+** → App ID
   `com.notebookforget.game` (explicit).
4. developer.apple.com → **Profiles** → **+** → **App Store Connect**
   (Distribution) → that App ID → the certificate above → download the
   `.mobileprovision`.
5. Base64 both files (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("Certificates.p12")) | Set-Content p12.b64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("profile.mobileprovision")) | Set-Content profile.b64
```
Keep the `.p12`, profile and password backed up — they expire yearly.

### 3.3 Add repo secrets

| Secret | Value |
| --- | --- |
| `APPLE_P12_B64` | contents of `p12.b64` |
| `APPLE_P12_PASSWORD` | the `.p12` export password |
| `APPLE_PROFILE_B64` | contents of `profile.b64` |
| `APPLE_TEAM_ID` | your 10-char Team ID (Membership page) |
| `ASC_KEY_ID` | App Store Connect API Key ID |
| `ASC_ISSUER_ID` | API Issuer ID |
| `ASC_KEY_P8_B64` | base64 of `AuthKey_….p8` |

The CI build uses the API key **only** for the TestFlight upload; signing uses
the certificate/profile. RevenueCat separately needs an App Store Connect key
so it can sync the product and validate/restore the IAP. Xcode never
auto-creates certificates, so CI cannot burn through Apple's certificate limit.

### 3.4 Every release
Same as Android — push a `v*` tag, or run the workflow manually with the
version input. CI builds, signs, and uploads to **TestFlight**. Without the
signing secrets it still produces an unsigned `.xcarchive`; without the
API-key secrets it leaves the signed `.ipa` as an artifact.

### 3.5 App Store Connect checklist
1. **My Apps → +** → New App: name *The Notebook That Forgot You*, language,
   bundle ID `com.notebookforget.game`, SKU
   `notebook-that-forgot-you`. Do this **before** the first CI release.
2. **TestFlight**: the CI release uploads the build automatically. Add
   yourself as an *Internal* tester and install via the TestFlight app
   (~15 min after processing). No Mac or Transporter needed.
3. **App Store tab**: screenshots (§5), description (§4), privacy policy URL,
   App Privacy → **not** *Data Not Collected*. Declare *Purchases → Purchase
   History* and *Identifiers → User ID / Device ID*, used for app functionality
   (RevenueCat entitlement validation and restore), not used for tracking.
   Content age rating questionnaire, export compliance → standard encryption
   only (HTTPS) → exempt.
4. In-App Purchases: create the non-consumable
   `com.notebookforget.game.full_notebook` at the planned price and attach it
   to the RevenueCat offering before submitting.
5. Submit for review. Mention “Restore Purchase” in the review notes; typical
   24–48 h.

---

## 4. Store listing copy (paste-ready)

**App name** — The Notebook That Forgot You

**Play short description (≤80 chars)**
> A notebook platformer where the world forgets its own rules. Keep what matters.

**Apple subtitle (≤30 chars)**
> the notebook forgets you

**Keywords (≤100 chars, Apple)**
> notebook,paper,ink,platformer,puzzle,memory,rules,indie,handdrawn,erasure

**Play full description**
> The world is written in a notebook — and the notebook is forgetting.
>
> Gravity. Solidity. The ground itself. Left and right. One by one, the rules
> of the world flicker amber and fade, and the little ink scribble that is you
> has to live with whatever survives.
>
> You don't control the forgetting. You control the remembering:
> • **KEEP rules** with paper clips — 12 seconds of immunity, limited slots
> • **DRAW planks** with your finger — a stroke of ink becomes a real bridge,
>   red ink springs you skyward, blue ink tears if you linger
> • **WATCH the Observer** — the margins study how you play, and forget the
>   rules you lean on the most
>
> Two ways to play:
> • **The campaign** — 8 hand-ruled pages, three endings, a door marked OUT?
> • **THE MARGINS** — an endless notebook that writes new pages forever.
>   How deep can you make it before the ink gives out?
>
> No accounts. No ads. No tracking. The first three pages are free; one
> purchase unlocks the rest. Just you, a paper clip, and a notebook that is
> trying to forget you.
>
> “a small notebook fable”

**Category**: Games → Puzzle (Play: also add *Adventure* as secondary if offered).
**Content rating answer guide**: cartoon-level “violence” only (ink figure gets
erased), no user interaction, one-time in-app purchase, no ads → *Everyone / 4+*.

---

## 5. Screenshots

The deployed Pages build is the 3-page demo, so it cannot show pages 4–8 or
endless mode. Capture from a local dev build instead:

1. Run `bun dev`, open `http://localhost:3000` in Chrome DevTools device mode
   at a landscape phone size (e.g. 932×430, or 2796×1290 for the App Store set).
2. In the console, open the full campaign for this dev session:
   `window.__forgotEngine.campaignLimit = 8`, then
   `window.__forgotEngine.startRun()`. Jump straight to page 4 with
   `window.__forgotEngine.roomIndex = 3; window.__forgotEngine.loadRoom(3)`.
   The `__forgotEngine` hook exists only in `bun dev`, never in store builds.
3. Capture:
   - Title page (paper texture + the hero)
   - Page 4/5 with an amber rule warning (the money shot — eraser effect visible)
   - Finger-drawing a plank over a gap (turn on touch emulation)
   - `window.__forgotEngine.debugStartEndless(4)` for THE MARGINS

- **Play**: min 2 phone screenshots, landscape 16:9 (1920×1080 is ideal),
  ≥ 320 px, ≤ 3840 px.
- **Apple**: 6.7″ landscape **2796×1290** (required) and iPad 13″ landscape
  **2752×2064** (the project targets iPhone + iPad; 12.9″ 2732×2048 is also
  accepted). App Store Connect shows the exact sizes — the game is designed
  for landscape, so keep them landscape.

Frame them on the paper background (the game IS the aesthetic — no marketing
framing needed).

---

## 6. Release flow from now on

First store release: after adding the signing secrets (§3.3), use
**Actions → store-release → Run workflow → version `1.0.0`**. A dry run without
signing secrets already passes and produces a signed Android AAB/APK plus an
unsigned iOS archive.

For later releases:
1. Pick the next version (e.g. `1.0.1`) and bump `package.json` to match.
2. `git tag v1.0.1 && git push origin main --tags` — or run the workflow
   manually with that version.
3. CI builds everything → download artifacts → upload to each console.
4. Web players get it automatically (gh-pages flow unchanged).

`versionCode` (Android) and `CFBundleVersion` (iOS) auto-increment from the
CI run number, so every upload ascends — you never think about it.

---

## 7. Troubleshooting

- **Android build “unsigned”** → a required keystore secret is missing/empty.
- **iOS job fails at signing** → profile expired, or profile's bundle ID ≠
  `com.notebookforget.game`, or the profile doesn't include
  the distribution certificate you uploaded.
- **iOS upload fails** → create the App Store Connect app record first; check
  the API key role and that `ASC_KEY_ID` / `ASC_ISSUER_ID` / `.p8` all belong
  to the same key.
- **Play rejects the first `.aab`** → you uploaded to production directly;
  new personal accounts must start in a test track (§2.4 step 2).
- **Changed app name/icon later** → icons: regenerate via
  `scripts/make-store-assets.py` + `bunx @capacitor/assets generate`; name:
  edit `capacitor.config.ts` (`appName`) and re-run the *ios-init* flow after
  deleting `ios/` (Android label comes from the same config at `cap sync`).
