# STORE LAUNCH — THE GAME THAT FORGOT YOU

Everything needed to ship v1.4+ to **Google Play** and the **Apple App Store**.
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
| Icons & splash | `assets/`, applied into `android/…/res` | Adaptive launcher icons + light/dark splash (regenerate: `python3 scripts/make-store-assets.py && bunx @capacitor/assets generate --android`) |
| CI pipeline | `.github/workflows/store-release.yml` | On every `v*` tag: builds signed Android `.aab`/`.apk` + iOS archive |
| Privacy policy | `public/privacy.html` | Required store URL: `https://ahmed-m-elgammal.github.io/forgotten-game/privacy.html` |

**Store assets** (ready to upload, in `assets/`): `icon-only.png` (1024², App Store icon),
`feature-graphic.png` (1024×500, Play Store banner).

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

### 2.1 One-time: create your upload keystore
The keystore IS your app's identity — if it's lost, the app can never be updated.
Never commit it. Easiest path (no local Java needed):

1. GitHub repo → **Actions** → **store-release** → **Run workflow**
2. Tick **“generate the Android upload keystore”** → Run
3. Download the `upload-keystore` **artifact** → `upload-keystore.jks`
4. The run summary shows the password used. **Save both** somewhere safe
   (password manager), then **delete that workflow run** so the password
   isn't in the logs.

### 2.2 One-time: add repo secrets
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | `base64 -w0 upload-keystore.jks` (mac: `base64 -i upload-keystore.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 2.1 |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | same password |

### 2.3 Every release
```bash
# from the repo root
git tag v1.4.0 && git push origin main --tags
```
The `store-release` workflow runs → download the `android-store-v1.4.0`
artifact → you get `app-release.aab` (store upload) + `app-release.apk`
(direct install testing: `adb install app-release.apk`).

### 2.4 Play Console checklist
1. **All apps → Create app**: name *The Game That Forgot You*, default
   language English, **Game**, Free.
2. **Test → Closed testing**: create a track, upload the `.aab` (or start in
   internal testing with up to 100 testers — no 12-tester rule there, good for
   a first build sanity check).
3. **Store listing**: paste the copy from §4 below, upload `feature-graphic.png`
   + 2–8 phone screenshots (see §5).
4. **Content rating → IARC questionnaire**: puzzle game, no violence beyond
   cartoon ink, no sharing, no purchases, no ads → expected rating *Everyone /
   PEGI 3*.
5. **App content**: privacy policy URL =
   `https://ahmed-m-elgammal.github.io/forgotten-game/privacy.html`
   Data safety form: **No data collected, no data shared** (true — the game
   keeps the best score in on-device localStorage only).
6. When the closed test has its testers and 14 days are done → **Promote to
   production**. Reviews usually clear within a day for small puzzle games.

---

## 3. iOS — App Store (step by step)

### 3.1 One-time: commit the iOS shell
Needs macOS only for 10 minutes — done **by CI**:
Actions → **store-release** → Run workflow → tick **“create & commit the
ios/ project”**. The workflow runs `cap add ios` on a macOS runner and pushes
`ios/` back to `main`. From then on, releases reuse the committed project.

### 3.2 One-time: Apple certificates (in App Store Connect / developer portal)
1. **Certificates**: create an *Apple Distribution* certificate
   (Keys → Certificates → `+`). Download the `.cer`, open it in **Keychain
   Access**, export the *private key + cert* pair as **Certificates.p12**
   (set a p12 password).
2. **Identifiers**: register App ID `com.ahmedmelgammal.forgottengame`
   (explicit).
3. **Profiles**: create an *App Store* provisioning profile for that App ID
   with the distribution certificate. Download the `.mobileprovision`.

### 3.3 Add repo secrets

| Secret | Value |
| --- | --- |
| `APPLE_P12_B64` | base64 of Certificates.p12 |
| `APPLE_P12_PASSWORD` | the p12 export password |
| `APPLE_PROFILE_B64` | base64 of the `.mobileprovision` |
| `APPLE_TEAM_ID` | your 10-char Team ID (Membership page) |
| `KEYCHAIN_PASSWORD` | any random string (CI keychain password) |

### 3.4 Every release
Same as Android — push the `v*` tag; the workflow produces a **signed
`.ipa`** artifact. (Without the secrets it still produces an unsigned
`.xcarchive` you can open in Xcode on any Mac and sign there manually.)

### 3.5 App Store Connect checklist
1. **My Apps → +** → New App: name, language, bundle ID
   `com.ahmedmelgammal.forgottengame`, SKU `forgotten-game`.
2. **TestFlight**: upload the `.ipa` (drag it into
   [Transporter](https://apps.apple.com/app/transporter/id1450874784) from the
   Mac App Store, or `xcrun altool --upload-app -f App.ipa -t ios`… Transporter
   is the zero-CLI path). Internal testing is available ~15 min after
   processing.
3. **App Store tab**: screenshots (§5), description (§4), privacy policy URL,
   App Privacy → *Data Not Collected*, content age rating questionnaire,
   export compliance → uses standard encryption only (HTTPS) → exempt.
4. Submit for review. Notebook games with no data collection review cleanly;
   typical 24–48 h.

---

## 4. Store listing copy (paste-ready)

**App name** — The Game That Forgot You

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
> No accounts. No ads. No data collected. Just you, a paper clip, and a
> notebook that is trying to forget you.
>
> “a small notebook fable”

**Category**: Games → Puzzle (Play: also add *Adventure* as secondary if offered).
**Content rating answer guide**: cartoon-level “violence” only (ink figure gets
erased), no user interaction, no purchases, no ads → *Everyone / 4+*.

---

## 5. Screenshots

Take from the **deployed site** in a desktop browser at mobile sizes
(DevTools → device toolbar), while playing:
1. Title page (paper texture + the hero)
2. A mid-game moment with an amber rule warning (the money shot — eraser
   effect visible)
3. Finger-drawing a plank over a gap (shows touch play)
4. THE MARGINS endless mode with the Observer's pencil circles

- **Play**: min 2 phone screenshots, 16:9 or 9:16, ≥ 320 px, ≤ 3840 px
  (capture at 1080×1920 for 6.7″ and 1080×2340 for taller phones — 2 each is fine)
- **Apple**: 6.7″ **1290×2796** (required) + 6.5″ **1284×2778 or 1242×2688**
  (required if supported), iPad 12.9″ **2048×2732** (only if you enable iPad)

Frame them on the paper background (the game IS the aesthetic — no marketing
framing needed).

---

## 6. Release flow from now on

```bash
# 1. bump package.json version (and android default versionName if you like)
# 2. commit + tag
git tag v1.5.0 && git push origin main --tags
# 3. CI builds everything → download artifacts → upload to each console
# 4. web players get it automatically (gh-pages flow unchanged)
```

`versionCode` (Android) and `CFBundleVersion` (iOS) auto-increment from the
CI run number, so every upload ascends — you never think about it.

---

## 7. Troubleshooting

- **Android build “unsigned”** → a required keystore secret is missing/empty.
- **iOS job fails at signing** → profile expired, or profile's bundle ID ≠
  `com.ahmedmelgammal.forgottengame`, or the profile doesn't include the
  distribution certificate you uploaded.
- **Play rejects the first `.aab`** → you uploaded to production directly;
  new personal accounts must start in a test track (§2.4 step 2).
- **Changed app name/icon later** → icons: regenerate via
  `scripts/make-store-assets.py` + `bunx @capacitor/assets generate`; name:
  edit `capacitor.config.ts` (`appName`) and re-run the *ios-init* flow after
  deleting `ios/` (Android label comes from the same config at `cap sync`).
