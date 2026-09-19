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

- A `dailyItems` entry now has two distinct shapes, both handled through
  the same array/schedule machinery (`days`, category, buildPanels' day
  panels, Today's list) but rendered and "is it done" differently: a
  normal habit has its own `text` and is a boolean check-off
  (`dailyChecks`), rendered via `ci()`/`ciEdit()`; a tracker-linked item
  (`addTrackerDailyItem`) has `trackerPid` instead of `text` and no
  boolean state of its own at all — "done today" is whatever
  `trackerEntryForDate(trackerPid, ds)` finds in that project's OWN
  `trackerEntries`, rendered via `ciTracker()` (a status dot, not a
  checkbox — nothing to toggle inline, the row navigates to the
  tracker's own project page to actually log a value). Its name/icon
  are read from `DB.data.projects[trackerPid]` live on every render,
  never copied into the dailyItems entry, so renaming the tracker can't
  leave a stale label sitting in Daily.
  Anywhere that loops over `dailyItems` and asks "is this one done
  today" needs to branch on `it.trackerPid` — grepping for
  `isDailyChecked` finds the checkbox-only call sites, but doesn't catch
  places that need the tracker branch ADDED, which is exactly what got
  missed on the first pass here: Overview's Daily-card remaining count
  (`renderGrids`) silently always counted a tracker habit as pending
  because it only ever checked `isDailyChecked`, which a tracker item
  never sets. The Statistics tab's aggregate consistency/best-score/bars
  went the other way — rather than teaching that boolean-consistency
  math a second "done" definition, tracker-linked items are just
  excluded from it entirely (`aggHabitConsistency`/`bestHabitConsistency`
  /`aggHabitPeriods` all skip `it.trackerPid`), since a logged number
  isn't a check-off streak and forcing it into that shape would only
  produce a meaningless score.

- Habit consistency scores (`habitConsistency`, and the Statistics tab's
  ring/best/worst built on it) count only days ON OR AFTER the habit was
  created, over at most the last 90 days: score = scheduled days
  completed / scheduled days elapsed, today counted only once checked.
  Creation date is `it.created` (new items) or, for older ones, parsed
  from the id (`'di'+Date.now()+random`, see `habitCreatedDs`) — nothing
  needed migrating. It used to divide by a fixed ~90-day target, so a
  habit added yesterday scored ~1% against months it didn't exist. Items
  with target 0 (brand-new, nothing to judge yet) are skipped by
  best/worst. The bar charts skip pre-creation days too. If you add
  another place that counts "scheduled days" for a habit, use
  `habitCreatedDs`.

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
  It reappeared anyway: `.dsel-real` (the invisible, enlarged `<select>`
  behind the Language/Day starts at/Tasks shown dropdowns, added later
  to give them a bigger tap target) sits inside a TAPPABLE `.opt-row`
  with no `onclick` of its own — same shape as the switch, same bug.
  Reported as "the dropdowns don't work at all, I can't click them."
  Added `.dsel-real` to the same bail-out list (now
  `closest('.switch,.dsel-real')`). The lesson above about testing new
  controls with real/emulated touch, not mouse clicks, is exactly what
  would have caught this before shipping — didn't happen. When adding
  ANY new interactive element inside an `.opt-row`, `.acard`, or other
  TAPPABLE container, check this bail-out list first.

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
  Even THAT fix wasn't enough — reported as still intermittent ("it
  worked... wait now it doesn't"), and the detail that actually
  explained it: "there's a scrollbar from the background scrolling...
  only after that one disappears can I scroll in versions". That's iOS
  momentum/inertial scrolling — if the user was scrolling with any real
  velocity right as a sheet opened, the background keeps coasting
  entirely as a browser-internal animation, with no more touch events
  left for ANY handler to call preventDefault on. No touchmove-based
  approach can stop a scroll that's already committed, no matter how
  correct its touch-target logic is — that's the ceiling this whole
  approach (both attempts above) was built against without realizing
  it. Replaced the entire touchmove-interception strategy with
  `_lockBodyScroll()`/`_unlockBodyScroll()`: set `document.body`'s
  `position` to `fixed` (saving/restoring `scrollY` via `top`) for as
  long as `_overlayCount` is above 0, in `_overlayOpen`/`_overlayClose`
  themselves rather than a separate listener. A position:fixed element
  can't be mid-scroll at all, so this stops an already-in-flight
  momentum scroll dead, not just future gesture attempts — verified via
  `window.scrollTo()` while locked having no effect at all, and the
  original scroll position being restored correctly on unlock, including
  through nested opens (two overlays open at once only unlocks when the
  second one — the one that incremented the count off zero — closes).
  If background scroll during a sheet is ever reported broken again,
  don't add a fourth touchmove special case — this class of bug is why
  the fixed-position lock exists now, and if it's not enough the
  problem is somewhere else entirely (worth checking: does anything
  else in this app set `document.body.style.position` or `.top`
  directly and clobber this while it's active?).
  Immediate follow-up once the lock landed: scrolling UP to the very
  top of a sheet (Version history specifically) could break scrolling
  entirely. `.sheet` had no `overscroll-behavior`, so hitting the top
  of its own content triggered iOS's native rubber-band/scroll-chaining
  into the now-`position:fixed` body — an ancestor that can't scroll at
  all, which is exactly the kind of edge case that class of interaction
  breaks on. Added `overscroll-behavior-y:contain` to `.sheet`, which
  keeps overscroll contained inside it instead of chaining anywhere.
  While in there, also implemented what was asked instead of the
  original close-button design: `.sheet` is 75vh (was 90vh), and
  Version history specifically has no close button at all — dismiss by
  tapping the visible backdrop (`.sheet-overlay`'s own onclick, already
  existed) or by pulling down once already scrolled to the top of the
  list (new gesture, scoped to `#verhist-overlay` only via a dedicated
  touchstart/touchmove/touchend IIFE — only engages when the drag
  starts with `sheet.scrollTop<=0` and is moving downward, otherwise it
  does nothing and normal scrolling proceeds). This pattern (no close
  button, swipe-to-dismiss, backdrop tap) is scoped to Version history
  only, not the shared `.sheet` component in general — other sheets
  (Edit project, category pickers, etc.) still have real Save/Cancel
  actions and keep their explicit buttons; don't assume this same
  swipe-dismiss treatment should extend to those without being asked.
  Follow-up: the release animation felt off ("not that smooth") on a
  short drag. Cause: the drag itself tracks the finger 1:1 in px, but
  the release animated to a flat `translateY(100%)` over a flat 200ms
  regardless of how much px distance that actually was — a drag that
  barely crossed the 80px threshold still had to cover the sheet's
  full remaining height in the same 200ms as a drag that was most of
  the way there already, so it visibly sped up right as the finger
  lifted. Fixed by computing the close/snap-back duration from the
  actual remaining distance in px (clamped between ~120-280ms) instead
  of a flat number, so the release reads as a continuation of the same
  motion instead of a different, faster one taking over.

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

- Every bottom sheet's opening slide-up (`.sheet-overlay` → `.sheet`,
  shared by all ~12 sheets) used to key the transform transition off the
  SAME class the overlay's own `display:none → block` flip used
  (`.sheet-overlay.on`). Reported as "slides smoothly to one level, then
  makes a small jump" on a real iPhone. Root cause: a CSS transition
  needs a real rendered "before" frame to interpolate from, and
  `display:none → block` landing in the same style recalc as the
  transform change means there IS no such frame — different browsers
  resolve that ambiguity differently. Confirmed in this desktop preview
  by sampling the sheet's `getBoundingClientRect().top` every
  `requestAnimationFrame` right after triggering open: the very first
  sample was already at the final resting value — no interpolation ran
  at all here, the browser just skipped straight to the end state. iOS
  Safari apparently resolves the same ambiguity differently (a partial
  interpolation that then snaps the remainder) — same bug, two
  different-looking symptoms; neither is reproducible as "correct"
  behavior on any engine. Fixed by splitting the two changes across two
  guaranteed-separate paint frames: `.on` alone only flips visibility
  now (sheet stays at its resting off-screen transform); a second class,
  `.show`, is what the CSS actually keys the open transform off of
  (`.sheet-overlay.on.show .sheet`), added via a NESTED
  `requestAnimationFrame` (a single one wasn't reliably enough — its
  callback can still land before the `.on` frame has committed).
  `_overlayClose()` clears both classes together, not just `.on` — if
  `.show` were left behind, the next `_overlayOpen()` would add `.on`
  while `.show` is already present and both would flip together again,
  silently reintroducing the exact bug this works around. Verified via
  the same frame-sampling technique post-fix: one continuous monotonic
  ease from fully off-screen to rest, no stall, no jump, and repeat
  opens behave identically. If a similar "mostly smooth, then a snap"
  report ever comes up for some OTHER `display:none`-based
  show/hide-with-transition element in this app, check for this exact
  pattern first (a single class simultaneously toggling `display` and
  the transitioned property) before assuming it's a new bug.
  Follow-up once close got its own animation (see `_overlayClose`'s
  `SHEET_ANIM_MS` wait, added right after the above): `#verhist-overlay`'s
  swipe-to-dismiss gesture already animates the sheet off-screen itself
  before calling `close()`, so waiting out a SECOND, separate
  `SHEET_ANIM_MS` on top of that (the generic wait meant for the normal
  backdrop-tap/button close, where the sheet hasn't moved yet) left the
  dimmed backdrop sitting there for an extra beat after the sheet had
  already visually left — reported as "the window's gone, then a dead
  pause before you're back to the screen behind it." Fixed with an
  `instant` flag on `_overlayClose`/`VersionHistory.close` that skips
  straight to hiding when the caller already finished its own close
  animation. Any FUTURE sheet that gets its own custom pre-close
  animation (rather than just relying on `.show` removal) needs to pass
  `instant` too, for the same reason — the generic close always assumes
  it's starting the slide from scratch unless told otherwise.

- The "Hold to complete tasks" gesture (global `touchstart` handler,
  search "HOLD TO COMPLETE") has its own separate completion dispatch
  from the normal tap path (a checkbox's native `onchange`) — the two
  are NOT the same code path, and it's easy to update one without
  realizing the other needs the same fix. Bit exactly this way once
  already (`.switch` inside a TAPPABLE row) and again here: a one-time
  task's row (`data-once`, in Tasks > Calendar) completes correctly via
  its checkbox's `onchange="A.completeOnce(...)"` on a normal tap, but
  the hold-gesture branch for non-`.cali` rows only checked
  `data-li` vs "anything else" and fell through to `A.done(cb)` for a
  one-time row — which reads `data-key`/`data-text`/`data-sec`, none of
  which a `data-once` row has, so it silently called
  `DB.completeTask(null,null,null)` (touches nothing in `dailyOnce`,
  just adds a bogus null-key archived entry) while still fading out and
  removing the DOM row on its own timer. Looked completed right up
  until that view next re-rendered from data that still had the item —
  reported as "ticked it off, it just reappeared again." Fixed by
  giving that branch the same three-way `data-once`/`data-li`/else
  check the `.cali` branch above it already had. If a *different*
  completable row type gets added later, grep for
  `hasAttribute('data-` in that touchstart handler and make sure the
  new type is handled in BOTH branches (`.cali` and the `.ti`/`.wri`
  one), not just wherever its own `onchange` lives.

- ROOT CAUSE of the "dead space"/strip under every sheet AND the footer
  tab bar "jumping" on close (took five rounds; four were blind guesses
  that each got reverted): on the user's iPhone (iOS, installed
  standalone PWA, 393x852) the `position:fixed` body scroll lock shrinks
  the layout viewport from 852 to 793 — exactly the 59pt top safe area —
  for as long as it's applied. `window.innerHeight` goes 852 -> 793, every
  `position:fixed` element (sheet, backdrop, tab bar) is laid out against
  the shorter viewport and stops 59pt above the physical bottom, and the
  page cannot paint into the strip below it at all (only the html
  background color shows). The tab bar jumped because it moved up when
  the lock went on and back when it came off. Found only by adding a
  TEMPORARY on-device readout (innerHeight/screen/visualViewport/vh
  units/safe-area/rects + a lock toggle) to Version history and having
  the user screenshot it with the lock on and off: lock on -> sheet
  bottom 793 + strip; lock off -> 852, no strip. When a rendering bug is
  device-only and reproduction fails in preview, ship a diagnostic like
  that after the FIRST failed guess, not the fourth.
  Fix: `_lockBodyScroll` uses `overflow:hidden` on `<html>` (no viewport
  change) when `navigator.standalone===true`, and keeps the original
  `position:fixed` body lock everywhere else. `_lockMode` remembers which
  was applied so unlock undoes the right one. Trade-off to know about:
  the fixed lock existed because it stops an already-in-flight iOS
  momentum scroll dead; `overflow:hidden` may not, so background
  scrolling coasting behind a sheet is the thing to check first if that
  old report comes back on the installed app.
  Also kept, per explicit request ("no bottom bar when something slides
  up"): the tab bar is `display:none` while any sheet is open, restored
  through `TabBar.updateActive()` (project/Habits pages hide it
  regardless). Things that did NOT help and were removed: extending the
  sheet/backdrop past the bottom edge, recoloring `<html>` to the sheet's
  color, making Version history taller. Lesson: also read an annotated
  screenshot literally — one of those guesses came from picking the
  easiest reading of a circled region.

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
