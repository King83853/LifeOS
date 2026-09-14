# Life OS — Project Memory

## What this is
A personal productivity mobile web app consolidating habit tracking, goals,
vision board, and app blocker. Deployed at king83853.github.io/LifeOS.

## Stack (keep this accurate — update when it changes)
- Single-file HTML/JS/CSS app (no build step, no bundler)
- Persistence: browser localStorage (no backend yet)
- Deployment: GitHub Pages, static hosting
- Target: mobile web (primary interaction is touch/swipe, not mouse)

## Working agreement for this file
- Update the "Known gotchas" and "Decisions" sections whenever something is
  learned the hard way — a bug that wasted time, an approach that seemed
  right but broke things, a UI change that cascaded into other breakage.
- Before starting a new feature, re-read this file. Don't re-litigate
  decisions already made below.

## Decisions made (don't redo these debates)
- `Nav.sd` (Daily tab's selected-day state) is an absolute day OFFSET from
  today (0 = today, negative = past, positive = future) — NOT a weekday
  index 0-6. It used to be a weekday index back when the day strip only
  ever showed the current week (index doubled as both "which pill" and
  "which weekday, for recurring-schedule matching"). Extending the strip
  to DAILY_RANGE_BACK/DAILY_RANGE_FWD (buildPills/buildPanels) split those
  two meanings apart: the offset drives `pDate(pi)` — now literally
  `T + pi days`, nothing more — while a separate `wIdx(dateObj)` call
  gives the real weekday for matching `item.days`. `pDate` used to be
  `T.getDate()-TI+pi` (this week's Monday + pi) from when pi was a
  weekday index; that formula only gives the right date when pi equals
  TI, i.e. it silently only looked correct on the exact day it was
  tested. Shipped this way once, only caught it from a real bug report
  ("today" pill landing on Monday's date on any non-Monday) — verify
  `pDate(0)` against the actual wall-clock date directly next time, not
  just relative differences between two pDate() calls (which stay
  linear-correct either way and don't catch an anchor-point bug at all).
  If you touch this area
  again: recurring items are scheduled by weekday and apply every week —
  don't reintroduce a index-is-both-things assumption.
  There was a SECOND leftover call site of the same bug, found later:
  Today's own habit checkboxes (`renderToday()`, via `ci(it.id,it.text,TI)`)
  were still passing the weekday index `TI` as if it were a day-offset
  into `pDate`/`toggleDailyItemFor`, so ticking a habit in Today wrote the
  checkmark under `pDate(TI)` (today + TI days — some other date) while
  the read path correctly used `pDate(0)` (today) — checkbox looked
  checked until the next re-render, then reverted. Fixed by passing `0`.
  Lesson: when a function's parameter meaning changes (weekday index →
  day offset), grep every call site, not just the ones in the feature you
  were actively changing at the time — this one shipped for a whole
  session before a bug report caught it.

- The Daily project is a real entry in `DB.data.projects` (with its own
  name/icon/color/desc, editable through the normal SheetEditor sheet)
  but it never lives at its own page id — `Nav.go` redirects
  `habitsProjectId` to the static `#p-habits` page, so `#p-<pid>` for
  the Daily project's id is dead markup that's built but never shown.
  Two consequences worth remembering if this area changes again: (1)
  don't check `p.type==='daily'` alone to detect "is this the Daily
  project" — real data can have that project's `type` left as something
  else (e.g. `'todo'`) with only `habitsProjectId` actually pointing at
  it, so check `pid===DB.data.habitsProjectId` too (bit the Overview
  card count for exactly this reason). (2) Any code that updates a
  project's header after an edit by querying `#p-<pid> ...` (SheetEditor
  .save()) silently no-ops for the Daily project — it needs an explicit
  extra branch to update `#habits-dtitle` instead.

## Known gotchas
- A past UI change caused cascading breakage across the app — before large
  structural changes to shared components (nav, panels, layout containers),
  flag the blast radius and confirm before proceeding rather than assuming
  it's isolated.
- Single-file architecture means CSS/JS changes can have non-obvious global
  side effects — check surrounding sections after edits, not just the
  section touched.
- iOS home-screen launches can briefly flash a "No Internet Connection"
  warning even though the app is fully cached and works fine right after.
  Tried a `start.html` bootstrap page as `start_url` (theory: a WebKit
  race lets the first navigation hit the network before the SW finishes
  activating) — confirmed on a genuinely fresh install that it did NOT
  stop the warning. Reverted. Current read: this is very likely an
  iOS/WebKit-level thing outside app control, not worth chasing further.

- sw.js's navigate handler (fetch listener, `e.request.mode === 'navigate'`)
  must ALWAYS resolve to `SHELL_URL` (index.html) — never fetch or cache
  under the literally-requested URL. This is why: a home-screen icon's
  launch URL is baked in permanently by iOS at "Add to Home Screen" time
  and can never be changed after the fact. The `start.html` experiment
  above got deleted in the revert, and any icon added while it was live
  is now permanently pointed at a URL that no longer exists on the
  server — the old handler faithfully fetched that literal dead URL and
  rendered GitHub's raw 404 page. Fixed structurally so this can't
  recur: every navigation in scope, regardless of requested URL, always
  serves/caches index.html specifically. Verified by navigating straight
  to a URL that genuinely 404s server-side and confirming it still loads
  the real app. Don't ever go back to keying cache/fetch off `e.request`
  for navigation — same class of bug, just with a different broken URL
  next time.

- The global touch-feedback IIFE near the bottom of index.html (the one
  with the `TAPPABLE` selector list) fires a synthetic `.click()` on
  `touchend` for any element matching that selector, and calls
  `e.preventDefault()` first — meaning it suppresses whatever native
  touch-to-click the browser would otherwise have produced. `.opt-row`
  is in that list. A real `<input type=checkbox>`/`<label>` toggle
  switch placed INSIDE an `.opt-row` that has no `onclick` of its own
  (the row is just a label, not a button) gets its tap hijacked anyway,
  because `closest(TAPPABLE)` walks up to the row — so the synthetic
  click lands on the non-interactive row instead of the actual control,
  and the switch does nothing. This shipped once (the "hold to
  complete" switch was completely untappable on a real phone) and
  wasn't caught by testing with mouse clicks in the browser preview,
  which don't go through this touchstart/touchmove/touchend path at
  all — only mobile-viewport-emulated taps (or a real device) exercise
  it. Fixed generically: the touchstart handler now bails out (and
  resets `target` to null, not just returns early) whenever the touch
  started inside `.switch`, letting that control handle its own tap
  natively. Any future custom interactive control nested inside a
  TAPPABLE container needs the same explicit bail-out, and needs to be
  tested with the mobile viewport preset (or real touch events), not
  just mouse clicks, or this exact bug reappears silently.

- `checkForUpdate` (index.html, `A.checkForUpdate`) went through several
  broken iterations worth knowing about: (1) originally deleted all
  caches unconditionally before confirming a fresh copy was fetchable —
  any hiccup left a blank white screen with no recovery short of
  deleting the home-screen icon; (2) even after fixing that, it still
  did a full destructive wipe+reload even when there was NO update
  available. Current version: only touches anything if `reg.update()`
  actually finds a new service worker installing — in that case it lets
  the new worker cache its own assets and activate on its own
  (skipWaiting + clients.claim, already in sw.js's own lifecycle), waits
  for `controllerchange`, shows an "Updating…" → "✓ Updated" overlay, then
  reloads. If there's no update it's a pure no-op (message only, zero
  cache/page touch). The whole thing is wrapped in a 12s watchdog timeout
  so it can never hang. Note on iOS storage: a home-screen icon has ITS
  OWN isolated localStorage/cache/SW, separate from Safari and from any
  other icon of the same site — deleting an icon without exporting first
  loses its data permanently, and Safari "working fine" tells you nothing
  about whether a given icon's storage is broken.
  (3) A real-world report from the user's own device: "check for
  updates" mostly said "already on the latest version" even though a
  real update HAD landed (confirmed because the "what's new" sheet for
  the newer version showed up on the next cold launch) — and separately,
  the progress overlay sometimes froze partway ("Almost there…") and
  needed a manual reload to recover. Both traced to the same root cause:
  this flow trusted two browser-delivered signals — the `updatefound`
  event firing essentially synchronously with `reg.update()`'s promise
  resolving, and the `controllerchange` event firing once the new worker
  actually takes over — and neither is reliable enough to trust alone,
  particularly on iOS Safari (unconfirmed exactly which part, since this
  can only be tested in a desktop/Chromium preview here, not on the
  user's real device — sw.js's own lifecycle, self.skipWaiting() +
  clients.claim(), is unconditional and was already correct). Fixed
  defensively rather than chasing the exact engine quirk: (a) after
  reg.update() resolves, wait ~350ms before concluding "no update" —
  gives a slightly-late `updatefound` a chance to still arrive; (b) once
  `updatefound` DOES fire, also poll `navigator.serviceWorker.controller`
  every 400ms as a fallback for `controllerchange` never arriving; (c)
  if even the 12s watchdog fires while we know an update was found and
  started installing, don't report "nothing was changed" (actively
  false in that case) — reload on our own instead, since the new worker
  has very likely already activated by then. If this area breaks again,
  don't add more one-off timers — get a real device to test on, or at
  minimum get the actual browser/OS version from the report before
  guessing further.

- The global touchmove handler that blocks background/body scroll while
  a sheet is open (search "Block body scroll when any overlay is open")
  reads a counter, `_overlayCount`, that's also defensively reset to 0
  on every touchstart if a "safety check" thinks nothing is actually
  open — and that check used to be a hardcoded array of specific overlay
  ids. Every `.sheet-overlay` added after that array was written (this
  has happened repeatedly — whatsnew, verhist, daily-cat, daily-item,
  add-choice, once-add, task, color) wasn't on it, so opening any of
  those always looked like "nothing open" to the safety check, zeroed
  the counter on first touch, and silently disabled the scroll-blocker —
  which is what let scrolling inside that sheet scroll the page
  underneath instead, and could make a tall sheet's own close button
  drift out of reach with no way back except reopening the app. Fixed
  by checking `document.querySelector('.sheet-overlay.on')` instead of
  a maintained list — don't go back to a hardcoded list of ids for this,
  it will silently rot the same way again the next time a sheet is added.
  That fix alone wasn't the whole bug, though — reported as still
  happening on a real device afterward. The SAME handler's ancestor walk
  treated landing on `.sheet-overlay` itself (the dimmed backdrop, not
  just `.sheet`, the actual scrollable panel) as "inside the overlay,
  leave it alone" and skipped preventDefault there too. `.sheet` is
  `max-height:90vh`, so a sheet with enough content to need scrolling
  (Version history) never reaches the very top of the screen — there's
  always a sliver of bare, non-scrollable backdrop above it, and a
  gesture starting there (easy to do reaching for the top of a long
  list) hit that unblocked path and chained straight to the page
  underneath. Narrowed the check to `.sheet` only — the backdrop has
  nothing of its own worth allowing default touch behavior for.
  Lesson for both parts of this one: a fix that only checks the class
  it saw fail (`_overlayCount`) instead of re-reading the whole
  handler's logic can leave a second, adjacent bug in the same function
  untouched — when a bug report says a fix didn't work, re-derive the
  mechanism from scratch rather than re-checking only what was already
  changed.

- checkForUpdate() reliability, continued: even with the grace-period/
  polling fixes above, a real device still reported "already on the
  latest version" for an update that (per the user) only landed once
  the app was fully closed and reopened. That points at a different,
  more fundamental gap than event timing: `navigator.serviceWorker
  .register('sw.js')` was called with no `updateViaCache` option, which
  defaults to `'imports'` — meaning the browser is free to satisfy
  `reg.update()`'s fetch of sw.js from its own HTTP cache instead of the
  network, so the manual check can end up byte-comparing a stale cached
  copy against itself and correctly-but-uselessly conclude "no diff",
  while the browser's own separate automatic update timing (checked on
  relaunch, on a different schedule/cache policy) fetches a genuinely
  fresh copy later and finds the real diff. Registered with
  `{updateViaCache:'none'}` instead, which forces every update check to
  skip the HTTP cache for the SW script unconditionally. This is a
  registration-time option — it takes effect the next time `register()`
  runs (every page load already calls it), not retroactively on an
  already-active registration.
  `updateViaCache:'none'` alone still wasn't enough — confirmed on the
  user's actual iPhone (home-screen icon, standalone PWA, not Safari):
  manual check kept saying "latest", relaunching the app kept quietly
  picking up the real update anyway (no progress screen, just the
  What's New sheet on next open — confirming sw.js's own lifecycle was
  never the problem, only this page's detection of it). GitHub Pages
  serves sw.js with `Cache-Control: max-age=600` — confirmed via `curl
  -I`. Two ways to read that: either this WebKit version doesn't honor
  `updateViaCache`, or it does but `reg.update()`'s internal fetch still
  isn't guaranteed to ignore a *fresh-enough* cache entry regardless of
  that flag. Either way, stopped trying to make the SPEC-level API
  behave and instead forced it directly: `fetch('sw.js',{cache:
  'no-store'})` right before every `reg.update()` call. This doesn't
  need reg.update() to do anything differently — it just makes sure the
  browser's HTTP cache entry for sw.js is genuinely current by the time
  reg.update() reads it, network-cache policy or engine quirks aside.
  If a future report says update-checking is STILL wrong after this,
  the next thing to check is whether `fetch('sw.js',...)` itself is
  even reaching the network on that device (a browser dev-tools network
  tab on the actual device/OS in question, not another guess from here)
  — this file cannot get closer to root-causing an iOS-only bug without
  one.

- This app's own service worker is deliberately cache-first (see the
  navigate-handler gotcha above), which also means the LOCAL PREVIEW used
  to test changes during a session will keep serving an old cached copy
  of index.html after an edit — a plain reload is not enough to see the
  new file. Before checking any edit in the browser preview: unregister
  the SW and clear caches in that tab (`navigator.serviceWorker
  .getRegistrations()` → unregister each, `caches.keys()` → delete each),
  THEN reload. Confirmed once by diffing `document.styleSheets` cssText
  against the actual file on disk (via curl) — the file was already
  correct, the page just hadn't picked it up yet. Skipping this step
  reads as "my fix didn't work" when it actually did.

## Definition of "done" for a change
0. If index.html (or any other cached asset) changed, bump `CACHE_NAME` in
   sw.js — EVERY time, even for changes that have nothing to do with the
   service worker. The update check only diffs sw.js's own bytes; if it's
   unchanged, "Check for updates" truthfully-but-uselessly reports
   "already on the latest version" while the actual app content served
   stays stale. Got bitten by this exact bug once already — don't skip it.
0b. Also bump `APP_VERSION` in index.html (Beta 1.0 → 1.1 → 1.2 …) and add
    a matching entry to `CHANGELOG` for any user-visible change, so the
    "What's new" sheet has something real to show after the update lands.
1. No console errors on load or on interaction with the changed feature
2. Existing features still work (see smoke-test.js — run it after every change)
3. Screenshot review of the changed UI state looks correct (no layout
   breakage, elements not misaligned/overlapping)
4. Only THEN report back for human review of feel/interaction quality
   (swipe smoothness, gesture responsiveness, animation timing — these
   require human judgment, don't guess)

## Handling vague "feel" feedback
When the human gives vague interaction feedback (e.g. "the swiping feels
off", "the animation feels weird", "the scroll feels wrong") — DO NOT
guess and make a change. Instead, respond with a short table of the most
likely specific causes for that feature, so the human can just point at
one instead of having to articulate it themselves. Cover the standard
categories:
- Sensitivity/threshold (triggers too easily / too hard to trigger)
- Responsiveness/latency (delay between input and visible reaction)
- Motion quality (snap-back speed, easing, momentum, abruptness)
- Visual feedback during the interaction (does it track the finger/cursor
  live, or only react at the end)
- Direction/axis sensitivity (wrong gesture triggering it)
- Timing relative to other animations (feels like it's fighting something
  else on screen)

Once the human picks one (or names it directly if they already know),
translate it into the specific parameter/code change and make it — don't
ask them to also specify the technical fix.

## When to stop and ask instead of continuing to iterate
- Same error persists after 3-4 different fix attempts
- The fix requires a product/design decision, not a technical one
- A change would touch shared/global components with unclear blast radius
- Anything involving credentials, API keys, or payment integration
