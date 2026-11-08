# MONETIZATION — THE NOTEBOOK THAT FORGOT YOU

A practical plan to make money from the game, in priority order. This is a
plan only — no game code is changed by this document.

---

## 0. The honest version

This is a short, artistic, niche puzzle-platformer. It will not pay a salary on
mobile downloads alone. The realistic outcomes are:

- **No marketing:** a few hundred to a few thousand dollars in year one.
- **Good organic launch + press/creators:** roughly $5–15k in year one.
- **Store feature or viral short-form moment:** $30–70k+ in year one.

The plan below is designed to reach the middle case, with a shot at the top
case. The biggest mistake would be adding ads, a subscription, or paid user
acquisition. The second biggest mistake would be leaving the full game free on
the web while trying to sell it on mobile.

**Fixed costs are tiny:** Apple $99/year, Google $25 one-time, Steam $100 per
app, RevenueCat $0 under $2.5k/month, no servers. Break-even is roughly 40–75
sales. Time and marketing are the real costs.

---

## 1. The one decision that matters: what stays free on the web?

The game is currently playable for free, in full, on GitHub Pages. If that
stays true, mobile buyers are effectively donating — they can play the same
game in Safari. Mobile revenue will be low no matter how good the store page is.

Pick one before launch:

### Option A — Web becomes a 3-page demo (recommended)

- Web/GitHub Pages: pages 1–3, ending on a cliffhanger and a "full notebook"
  link to the stores.
- Mobile/Steam: the full 8-page campaign, endless mode, all inks, all endings.
- The web build is the top of the funnel, not a substitute product.
- This is the only model where a paid unlock makes business sense.

Implementation is a build-time flag: the web build exports only the first 3
rooms, the store build exports all of them. The demo ends with a quiet
"to be continued" page and store buttons. (Small code change; not part of this
plan.)

### Option B — Web stays full and free

- Monetize web via itch.io pay-what-you-want, Ko-fi, GitHub Sponsors, Patreon.
- Mobile is a paid "convenience edition" for people who want it on their phone.
- Revenue is mostly donations. This is the community-friendly path, not the
  revenue path.
- If you choose this, do not expect mobile sales to be meaningful, and do not
  spend money on mobile ads.

### Option C — Web stays full for launch, then becomes a demo

- Builds goodwill and an audience first, but the later gate can feel like a
  bait-and-switch and generate backlash.
- Not recommended unless you have a specific audience-building reason.

**Recommendation: Option A.** The game is not widely launched yet, so this is
the cheapest moment to make the web a demo. Keep the full web version available
to you locally and in the store builds; only the public GitHub Pages build is
capped.

---

## 2. Recommended business model

### Mobile: free download + one-time full-game unlock

- **Free:** pages 1–3 (~10–20 minutes), enough to teach the hook, re-inking,
  and the Observer.
- **Paywall:** after page 3, at a natural cliffhanger — not mid-page, not on
  first launch. Copy: *"The notebook has five more pages. And it never stops
  writing."* → **Unlock the full notebook — $3.99** / **Restore purchase**.
- **Unlock includes:** pages 4–8, endless mode, all three inks, all endings,
  future content updates.
- **Price:** $3.99 US regular; $2.99 launch price for 14 days. Regional pricing
  from the store tiers, with manual reductions in lower-income markets.
- **No ads. No subscription. No accounts. No cross-app tracking. Pay once, play
  offline.** Make that a selling point in the store copy.
- **Restore purchases** is mandatory on iOS; add it on Android too.
- **Family Sharing:** enable it where the store supports it for this product.

Use **RevenueCat** (`@revenuecat/purchases-capacitor`). It handles StoreKit 2,
Play Billing, restore, entitlements, and purchase analytics. Free up to $2,500
monthly tracked revenue, then 1% of tracked revenue. For one non-consumable,
this is dramatically less work than building receipt validation yourself.

**Why not ads:** the game's entire value is atmosphere and trust. Interstitials
break both. eCPM on a niche premium game is low, consent/privacy overhead is
real, and the reviews will punish it. The math does not justify the damage.

**Why not a subscription:** there is no ongoing service. A subscription would
be hostile and would fail review/expectations.

### If you must launch this week with zero code: paid app at $2.99

- No IAP integration; the app itself is the purchase.
- The web must still become a demo, or the paid app is undercut.
- Downside: fewer trials, lower conversion, and switching to free+IAP later is
  messy for existing buyers. Choose this only if shipping now matters more than
  revenue.

### What the mobile funnel looks like

```
Store page view
  → free install (25–40% of store page views is a healthy free-app rate)
    → demo start
      → page 1 complete (teach the hook)
        → page 3 complete (the cliffhanger)
          → paywall view
            → purchase (2–5% of installs is a good target)
              → restore tested
                → review prompt after a win
```

At 3% conversion and $3.39 net per $3.99 sale (15% store fee), **revenue per
download is about $0.10**. That is the number that kills paid user acquisition:
typical mobile CPIs are $1–3. Do not buy ads for this game. Organic, featuring,
short-form, and Steam are the acquisition channels.

---

## 3. Revenue streams, in priority order

| # | Stream | Effort | Revenue potential | When |
|---|--------|--------|------------------|------|
| 1 | Mobile full-game unlock ($3.99) | Medium (IAP + demo gate) | $200–$13k/yr in scenarios | Launch |
| 2 | Steam paid version ($6.99) | Medium–high (port + store page) | $1.5k–$49k/yr in scenarios | 3–6 months after mobile |
| 3 | itch.io pay-what-you-want ($4.99 suggested) | Low | $100–$2k/yr | Launch |
| 4 | Expansion / content DLC ($2.99) | High (new content) | 10–20% of buyers | 3–6 months after launch |
| 5 | Soundtrack / art book ($2.99–$4.99) | Low–medium | $50–$500 | With Steam |
| 6 | Tip jar ($1.99/$4.99 IAP or Ko-fi on web) | Low | $50–$500 | Launch |
| 7 | Physical notebook merch ($18–$24) | High (logistics) | $0–$1k unless it blows up | Only after demand |
| 8 | Apple Arcade / Play Pass / Netflix Games | Medium (pitch) | Can be meaningful, unpredictable | After traction |
| 9 | Publishing deal | Medium (negotiation) | Advances/marketing, at 20–50% rev share | Only if it brings reach |
| 10 | Ads | Low | Pennies, brand damage | Never |

### 3.1 Steam is the biggest upside

The game is a natural PC/Steam title: distinctive art, a strong logline,
keyboard/mouse already works, and PC players pay for short artistic experiences.

- Wrap the built web game in **Electron** (easiest) or **Tauri** (smaller).
- Add Steam achievements, Steam Cloud saves, and optionally trading cards.
- Price **$6.99**, launch at 10–15% off. A $9.99 "deluxe" bundle with the
  soundtrack/art book is optional.
- Create the Steam page **3–6 months before launch** to collect wishlists.
  Target 5,000–10,000 wishlists before launch; below that, Steam visibility is
  limited.
- Run a free demo during **Steam Next Fest**. The demo can be the same 3-page
  web demo.
- Steam takes 30%; net per $6.99 sale ≈ $4.89. One thousand copies ≈ $4.9k;
  ten thousand ≈ $49k.
- Windows first. Steam Deck via Proton is a bonus; native gamepad support is a
  later improvement. macOS can wait.

### 3.2 itch.io

- Upload the same web demo (or full game) as pay-what-you-want with a $4.99
  suggested price. itch.io's default cut is 10%; you can adjust it.
- Use it for devlogs, festival submissions, and the "support the developer"
  path without adding payments to your own site.
- It will not be a major revenue source, but it costs almost nothing.

### 3.3 Content DLC / expansion

After launch, if players ask for more:

- New pages/rules/inks ("The Margins, Vol. 2"), a daily seeded challenge, or a
  page editor.
- Price $1.99–$2.99. Expect 10–20% of buyers to convert.
- Free content updates are better for reviews and press; paid DLC only when
  there is clear demand.

### 3.4 Soundtrack / art book

- The audio is procedural, so an "album" means rendering and mastering tracks —
  more work than it sounds. Do it only if you enjoy it or a musician helps.
- An art book PDF (page designs, margin notes, process) is cheaper to produce.
- Sell on Bandcamp (name-your-price) and as a Steam DLC/bundle.

### 3.5 Merch

- The obvious item: a physical "notebook that forgot you" journal with the seven
  rules inside and blank pages. A paper clip and red/blue ink pens make a nice
  collector's kit.
- Use a limited pre-order (50–100 units) before spending on inventory.
- Print-on-demand margins are thin; a local printer is better at 100+ units.
- This is a brand/loyalty play, not a revenue driver. Do it after the game has
  fans, not before.

### 3.6 Licensing and publishing

- **Apple Arcade / Google Play Pass / Netflix Games:** pitch after launch with
  reviews, press, and retention data. These can pay license fees or per-play
  royalties, but acceptance is unpredictable and terms may require mobile
  exclusivity. Read the contract.
- **Humble Bundle:** a one-time bundle deal after launch; low effort, modest
  revenue.
- **Publishers:** only consider one that brings marketing/porting you cannot do
  yourself. For a finished game, giving up 20–50% of revenue for a logo is a bad
  deal. Get advice before signing anything.

### 3.7 Tips

- Web: Ko-fi / Buy Me a Coffee / GitHub Sponsors link in the demo and README.
- Mobile: a tip jar IAP ($1.99/$4.99 consumable) is allowed, but it adds IAP
  surface area for little revenue. Skip it at launch; add it only if fans ask.
- Patreon only if you commit to regular devlogs/early builds. Do not start one
  you will abandon.

---

## 4. Pricing and unit economics

### Recommended prices

| Product | Price | Notes |
|---------|-------|-------|
| Mobile full unlock | **$3.99** ($2.99 launch) | One-time, non-consumable, restore |
| Steam | **$6.99** (10–15% launch discount) | Includes achievements/cloud; deluxe bundle optional |
| itch.io | **$4.99 suggested PWYW** | Demo or full game |
| Expansion | **$2.99** | Only after demand |
| Soundtrack | **$2.99** | Bandcamp/Steam DLC |
| Art book | **$4.99** | PDF |
| Tip jar | **$1.99 / $4.99** | Optional |

### What you actually keep

- **Apple:** 30% standard; **15%** if you enroll in the App Store Small Business
  Program (new developers qualify; enrollment is not automatic and can take
  weeks). Enroll **before launch**. Net on $3.99 at 15% ≈ **$3.39**.
- **Google Play:** 15% for the first $1M via the service fee tier. In the 2026
  US/EEA/UK structure, new installs are 10% service + 5% billing ≈ 15%. Net on
  $3.99 ≈ **$3.39**.
- **Steam:** 30% standard. Net on $6.99 ≈ **$4.89**.
- **itch.io:** 10% default. Net on a $4.99 average ≈ **$4.49**.
- **RevenueCat:** $0 under $2,500 monthly tracked revenue; then 1% of all
  tracked revenue. MTR is measured before store fees, so the effective rate on
  net is slightly higher.
- **Taxes:** stores remit VAT/sales tax in most regions; income tax is your
  responsibility. Fill out the tax forms and talk to a local accountant. Do not
  guess.

### Break-even

Fixed costs year one: Apple $99 + Google $25 + Steam $100 (later) + optional
domain ≈ **$125–$225**. At ~$3.39 net per mobile sale, break-even is ~40–70
sales. That is achievable; the hard part is reaching the people.

---

## 5. Realistic projections (illustrative, not promises)

Assumptions: mobile $3.99 with 15% store fee ($3.39 net), 3–4% install→purchase;
Steam $6.99 with 30% fee ($4.89 net); mobile downloads and Steam copies are
separate audiences (some overlap).

| | Quiet launch | Good organic launch | Featured / viral |
|---|---:|---:|---:|
| Mobile downloads (year 1) | 2,000 | 20,000 | 100,000 |
| Demo→purchase | 3% | 3.5% | 4% |
| Mobile sales | 60 | 700 | 4,000 |
| **Mobile net** | **$203** | **$2,373** | **$13,560** |
| Steam copies | 300 | 2,000 | 10,000 |
| **Steam net** | **$1,467** | **$9,780** | **$48,900** |
| itch.io / tips | $100 | $500 | $2,000 |
| **Total net (pre-income-tax)** | **≈$1,770** | **≈$12,650** | **≈$64,460** |

The quiet case is the default if you launch and tell no one. The middle case
requires 4–6 weeks of focused marketing. The top case requires a store feature,
a viral clip, or a major creator video — do not budget on it.

---

## 6. Store optimization (ASO) checklist

### Apple App Store

- **Title:** The Notebook That Forgot You (28/30 chars).
- **Subtitle (30 chars):** "A puzzle platformer" or "A forgotten platformer".
  Do not repeat title words.
- **Keywords (100 chars, comma-separated, no spaces):** platformer,puzzle,indie,
  story,art,ink,notebook,memory,narrative,offline,adventure,drawing.
- **Promotional text:** use the hook: "The world forgets its rules. You decide
  what it remembers."
- **Screenshots:** 6–8 landscape. First screenshot must communicate the hook
  without reading. Captions: "The world forgets its rules." / "Pin the rule.
  Save the moment." / "Draw your own way across." / "The notebook is watching."
- **App preview:** 15–30 s, landscape, captions, no voiceover needed. Show a
  rule vanishing, a pin, a drawn plank, the door.
- **Icon:** one strong shape, high contrast, no text, readable at 48 px. If the
  current icon relies on the title, replace it with a notebook/ink-scribble
  symbol.
- **Ratings:** prompt after a satisfying page escape, not at launch. Use the
  native review API. Never incentivize reviews.
- **Age rating:** answer honestly; the tone is eerie, not gore. Likely 9+/12+.

### Google Play

- **Short description (80 chars):** "The world forgets its rules. You decide
  what it remembers. Draw your way out." (fits)
- **Full description:** hook, 5–7 feature bullets, "no ads / no accounts / pay
  once / offline", accessibility, support email. Use keywords naturally; do not
  keyword-stuff.
- **Feature graphic:** already generated with the title — keep it readable at
  small sizes.
- **Screenshots:** landscape, same first-three-screenshot rule.
- **Data safety:** declare IAP purchase history (RevenueCat) honestly. If you
  add analytics, declare it. No ads/tracking keeps this simple.
- **Closed testing:** personal accounts need 12 testers for 14 continuous days
  before production. Start that clock early.

### Both stores

- Respond to every review for the first 6 months. Fix crashes within 48 hours.
- Update every 4–6 weeks for the first 6 months; updates help ranking and give
  press a reason to write.
- Localize if reviews show demand. Priority: EFIGS + Japanese, Korean, Simplified
  Chinese, Russian, Portuguese (BR). The margin notes are literary — do not
  machine-translate them without a human pass.

---

## 7. Launch marketing plan

### 7.1 Assets to prepare (before launch)

- **Press kit:** one-page fact sheet, logline, 5 screenshots, 3 GIFs, 30–60 s
  trailer, key art, dev bio, store links, contact email. Host it in a public
  folder/Notion page.
- **Trailer:** hook in the first 5 seconds. Show, in order: a rule disappears,
  the player pins it, a plank is drawn, the Observer writes back, the door.
  End on title + "Out now on iOS, Android, and Steam." Use the game's own synth
  audio, not generic trailer music.
- **10–20 vertical clips (9:16):** 7–15 s each. Hooks:
  - "This platformer forgets its own rules."
  - "You don't control the hero. You control what the world remembers."
  - "The game watches how you play — then uses it against you."
  - "I drew a bridge out of ink and the notebook deleted gravity."
- **Store badges/links** and a `/press` page.

### 7.2 Channels that fit this game

| Channel | Effort | Why it fits |
|---------|--------|-------------|
| TikTok / Reels / Shorts | High (3–5 posts/week) | The visual hook is instantly understandable |
| Reddit (r/WebGames, r/IndieGaming, r/AndroidGaming, r/iosgaming, r/playmygame) | Medium | Playable web demo is the best post; follow self-promo rules |
| Hacker News "Show HN" | Low | Procedural art/fairness auditor is HN catnip; web demo converts |
| YouTube/Twitch creators (10k–200k) | Medium | One good video can outperform $1k of ads; offer keys, not paid coverage |
| Press (TouchArcade, Pocket Gamer, 148Apps, indie newsletters) | Medium | Personalized pitches with a GIF and a specific reason |
| itch.io | Low | Devlogs, tags, festivals |
| Steam wishlist/Next Fest | High | Highest-value PC channel; start early |
| Festivals/awards (IGF, A MAZE., Indie Cup, Day of the Devs) | Medium | Credibility + press; deadlines are months ahead |
| Apple/Google editorial nomination | Low | Free lottery ticket; submit 2–4 weeks before launch |

### 7.3 Launch sequence

1. **Android closed test** (12 testers, 14 days) — collect feedback, fix, then
   production. This runs while you prepare iOS/Steam.
2. **iOS TestFlight** in parallel; submit after the Android feedback.
3. **Web demo** goes live with the mobile launch; every page ends with store
   links.
4. **Launch day:** Reddit post, Show HN, TikTok/Shorts, press emails, creator
   emails, launch discount. Tuesday–Thursday, not Friday. Avoid AAA launch weeks.
5. **First 72 hours:** reply to every comment/review; fix anything broken; post
   a "we hit #X" / "thank you" update if it lands.
6. **Weeks 2–6:** weekly devlog/clip, pitch roundups ("best indie games of the
   month"), submit to awards, plan Steam.

### 7.4 The pitch

> **The Notebook That Forgot You** is a hand-drawn platformer where you never
> control the hero — you control what the world remembers. Gravity, solidity,
> left and right, even the word on the door keep disappearing. Pin a rule with
> a paper clip, draw a plank in ink, and turn the page before the notebook
> forgets you.

That is the whole marketing plan in one paragraph. Use it everywhere.

---

## 8. Retention and content roadmap

A short narrative game lives or dies on word of mouth. Retention features are
not about squeezing players; they are about giving them a reason to tell someone.

- **Daily seeded challenge** (endless mode): same seed for everyone, shareable
  depth score. No backend needed if the seed is derived from the date.
- **Achievements**: in-game for 1.0 (page completions, endings, no-pin runs,
  depth milestones); platform Game Center/Play Games later (see 8.1).
- **Endless mode** already exists — surface it on the store page and in the
  paywall. It is the answer to "is it too short?"
- **Photo mode / share card** at the end of a run: a generated page with the
  player's stats ("I reached page 37; the notebook remembered me"). Low effort,
  high shareability.
- **Free content update** at 4–6 weeks: one new page/rule or a daily challenge.
  This is a press hook and a review prompt.
- **Paid expansion** only after demand is proven.

### 8.1 Game Center / Google Play Games — worth it for 1.0?

**Short answer: no. Skip it for 1.0.0; add it in 1.1 if players ask for global
scores.** It is optional in both stores, makes no direct money, and is a
retention/ASO feature, not a revenue feature.

They are not one service:

- Apple **Game Center** (GameKit) is iOS only.
- Android's equivalent is **Google Play Games Services** (PGS v2).
- "Linking Game Center to both stores" is not a thing. You integrate each
  platform separately; a unified cross-platform leaderboard needs a backend.

**What it buys:** a global endless-depth leaderboard (today the best score is
local only), achievements for pages/endings/depth, and native sign-in/leaderboard
UI. It is a small "real game" signal for reviews and store copy. Direct revenue
impact: roughly zero.

**Why not now:**

- iOS: Game Center needs the capability on the App ID, a regenerated App Store
  provisioning profile (`APPLE_PROFILE_B64`), and the entitlement in the Xcode
  project. Your no-Mac CI uses manual signing; this adds moving parts.
- Android: Play Games Services needs the Play Console app record, a PGS project,
  the app-signing SHA-1, and testers. The app-signing SHA-1 is only available
  after the first AAB is uploaded under Play App Signing.
- It adds 2–4 days of integration/testing plus review risk, and delays the
  things that actually make money (web demo, $3.99 unlock, Steam page).

**If/when you add it:**

- Use `@idleflowgames/capacitor-play-games` (Capacitor 8.5+, one API for GameKit
  and PGS v2, safe no-op on web). Other `capacitor-game-connect` packages are
  forks; verify Capacitor 8 support before installing.
- One global leaderboard (`endless_depth`) + 6–8 achievements. No multiplayer,
  no cloud saves, no sign-in gate.
- Sign-in optional; local best always works; submission failures stay silent.
- Separate leaderboards per platform. A unified board needs Supabase/Firebase/
  PlayFab; not worth it for 1.0.
- Update the privacy policy and store data disclosures (player ID).
- Store copy: "Game Center leaderboards" on iOS, "Play Games leaderboards" on
  Android. Do not mention Game Center on Google Play.
- Cheaper 1.0 alternative: in-game achievements + local best + a share card.

---

## 9. Analytics and experiments

You cannot optimize what you cannot see. Store consoles give installs and
revenue; they do not show where the demo loses people. Add the minimum.

### Events

- `demo_started`
- `page_completed` (page index)
- `paywall_viewed`
- `purchase_started`
- `purchase_completed`
- `purchase_restored`
- `endless_started`
- `endless_ended` (depth)
- `review_prompt_shown` / `review_submitted`

Use an anonymous install ID. No IDFA/GAID, no personal data, no accounts. A
privacy-friendly tool (PostHog cookieless, TelemetryDeck, or a simple endpoint)
is enough. Update the privacy policy and the store data disclosures.

### Experiments (sequential, not simultaneous)

1. Paywall after page 2 vs page 3.
2. $2.99 launch vs $3.99 launch (compare conversion and revenue per install,
   not just conversion).
3. Paywall copy: "Unlock the full notebook" vs "Keep reading."
4. Launch discount 20% vs no discount.
5. Review prompt after page 1 vs after a later win.

Do not run more than one at a time with low traffic; you will not have
statistical significance. Pick the biggest lever (paywall placement) first.

### Benchmarks to watch

| Metric | Healthy target |
|--------|----------------|
| Store page → install (free app) | 25–40% |
| Demo start → page 3 complete | 40–60% |
| Install → purchase | 2–5% |
| D1 retention | 20–30% |
| Rating | 4.5+ |
| Refund rate | <5% |
| Steam wishlist → launch sale | 10–20% |

If install→purchase is under 1%, fix the demo/paywall before buying traffic. If
it is over 5%, consider a higher price or more content.

---

## 10. Legal, privacy, and money setup

- **Apple Small Business Program:** enroll now (15% vs 30%). Approval can take
  weeks; new developers qualify. Accept the Paid Apps agreement first.
- **Google Play 15% tier:** ensure your account group/service-fee enrollment is
  complete. New installs in the 2026 US/EEA/UK structure are ~15% all-in.
- **Tax forms:** complete Apple/Google tax and banking info. Non-US developers
  usually file a W-8BEN; tax treaty rates vary. Consult a local accountant; do
  not rely on a blog post.
- **Payouts:** verify your bank/Payoneer/Wise setup before launch. A sale you
  cannot withdraw is not revenue.
- **Business entity:** not required to start as an individual. Consider a local
  company/LLC once revenue is meaningful, for liability and taxes.
- **Privacy policy:** update it for IAP (purchase history via RevenueCat) and any
  analytics. Apple App Privacy and Google Data Safety must match reality.
  No ads/tracking/IDFA keeps this simple and avoids ATT.
- **Terms:** Apple's standard EULA is acceptable for most apps; link it. Add a
  support email and a refund FAQ (refunds are handled by the stores).
- **Age rating:** complete the questionnaires honestly. The game is eerie, not
  gory; likely 9+/12+.
- **Consumer law:** the EU/UK have strong refund/withdrawal rules; the stores
  handle most of it. Do not make promises the stores do not honor.

---

## 11. 90-day action plan

### Week 1 — decide and build the funnel

- [ ] Choose Option A (web demo) or B (web full). Recommended: A.
- [ ] Implement the demo cap (3 pages) and the end-of-demo store CTA.
- [ ] Add the IAP: RevenueCat project, non-consumable `full_notebook`, entitlement,
      offering, paywall screen, restore button.
- [ ] Test sandbox purchases, restore, offline unlock, and refund behavior.
- [ ] Add minimal analytics (or decide to use RevenueCat + store consoles only).
- [ ] Update the privacy policy and store data disclosures.

### Week 2 — assets and accounts

- [ ] Enroll in Apple Small Business Program; complete tax/banking.
- [ ] Finalize icon, screenshots (landscape), preview video, feature graphic.
- [ ] Write store copy (title, subtitle, keywords, short/full description).
- [ ] Build the press kit, trailer, and 10 short-form clips.
- [ ] Create the Google Play closed test and recruit 12 testers.
- [ ] Upload the iOS build to TestFlight.

### Week 3 — soft launch

- [ ] Android closed test live; collect feedback; fix crashes/confusion.
- [ ] iOS external TestFlight; submit for review after feedback.
- [ ] Web demo live with store links.
- [ ] Start press/creator outreach (30–50 personalized emails).
- [ ] Post 3–5 short-form clips.

### Week 4 — launch

- [ ] Android production release; iOS release when approved.
- [ ] Launch discount (14 days).
- [ ] Reddit + Show HN + TikTok/Shorts + press follow-ups.
- [ ] Submit featuring/editorial nominations.
- [ ] Reply to every review/comment; fix urgent bugs.

### Weeks 5–8 — growth

- [ ] Weekly devlog/clip; one small update (daily challenge or achievements).
- [ ] Pitch "best indie games" roundups and awards.
- [ ] Start the Steam page and wishlist campaign.
- [ ] Analyze funnel; adjust paywall/price if needed.
- [ ] Localize the store listing (not the game yet) into 3–5 languages.

### Weeks 9–12 — expand

- [ ] Steam demo + Next Fest submission.
- [ ] Free content update; review prompt.
- [ ] Pitch Apple Arcade / Play Pass / Netflix Games with metrics.
- [ ] Decide on paid expansion based on demand.
- [ ] If revenue is working, budget a small creator campaign ($200–$500);
      if not, do not buy ads.

---

## 12. Budget

| Item | Cost | Note |
|------|------|------|
| Apple Developer Program | $99/year | Already required |
| Google Play Console | $25 one-time | Already required |
| Steam Direct | $100 per app | Recoupable after $1k revenue |
| RevenueCat | $0 under $2.5k/mo | Then 1% of tracked revenue |
| Analytics | $0–$20/month | Privacy-friendly tier |
| Domain | $0–$15/year | GitHub Pages is fine |
| Trailer/edit | $0–$500 | Self-made is acceptable |
| Creator seeding | $0–$500 | Keys + micro-sponsorships |
| Paid ads | **$0** | Do not start here |
| **Year-one total** | **≈$125–$1,250** | Excludes your time |

---

## 13. What not to do

- Do not add interstitial ads or a subscription.
- Do not pay for installs, reviews, or "guaranteed featuring."
- Do not launch the full game free on the web and expect mobile sales.
- Do not launch on all platforms on the same day with no marketing.
- Do not set a $0.99 price; after fees it signals low quality and earns pennies.
- Do not gate the ending so late that the free demo feels like a trick. Gate
  after a complete arc/cliffhanger.
- Do not use fake countdowns/scarcity. The game's tone is quiet; the marketing
  should be too.
- Do not quit your job based on the "featured" projection.
- Do not build merch, a Patreon, or a Discord until there is demand.
- Do not machine-translate the margin notes; they are the soul of the game.

---

## 14. Copy bank

### Store subtitle / short description

- Apple subtitle: **A puzzle platformer**
- Google short: **The world forgets its rules. You decide what it remembers.**
- One-liner: **You don't control the hero. You control what the world remembers.**

### Paywall

> **The notebook has five more pages.**
> And it never stops writing.
>
> Unlock the full notebook — 8 pages, endless margins, three inks, every ending.
> One purchase. No ads, no accounts, no subscription.
>
> **Unlock — $3.99** · **Restore purchase**

### Press pitch (email)

> Subject: A platformer where the world forgets its rules
>
> Hi [Name],
>
> I made **The Notebook That Forgot You**, a hand-drawn platformer where you
> never control the hero — you control what the world remembers. Gravity,
> solidity, left and right, even the word on the door keep disappearing. You
> pin rules with a paper clip, draw planks in ink, and turn the page before the
> notebook forgets you.
>
> It is out on iOS/Android [date], with a free 3-page demo here: [link].
> Trailer/GIFs/press kit: [link].
>
> I am reaching out because [specific reason you cover games like this]. Happy
> to send a key or answer anything.
>
> — [Name]

### Short-form hooks

- "This platformer forgets its own rules."
- "You don't control the hero. You control what the world remembers."
- "The game watches how you play — then uses it against you."
- "I drew a bridge out of ink and the notebook deleted gravity."
- "It remembered that I always hold on. So it took the ground away."

---

## 15. The 5 things to do first

1. **Decide the web/free question.** Recommended: 3-page web demo, full game
   paid. This is the highest-leverage decision in the document.
2. **Enroll in Apple's Small Business Program now.** 15% instead of 30% on every
   sale; approval takes weeks.
3. **Add the $3.99 full-game unlock with RevenueCat** (or launch paid at $2.99
   if you cannot wait). Test restore and offline.
4. **Build the launch kit:** trailer, 10 clips, press kit, 8 screenshots, store
   copy. Marketing starts weeks before launch, not on launch day.
5. **Start the Steam page/wishlist in parallel.** It is the highest-upside
   channel and it rewards early pages.

---

*Plan only. No game code, store records, or pricing were changed by this
document.*
