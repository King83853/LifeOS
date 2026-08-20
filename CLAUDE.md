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
- (fill in as they come up — e.g. "chose X gesture library over Y because Z")

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

## Definition of "done" for a change
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
