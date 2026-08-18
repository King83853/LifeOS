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
  Tried: a `start.html` bootstrap page as the manifest `start_url` that
  waits for the service worker to control the page before redirecting to
  `index.html` (theory: a WebKit race lets the first navigation hit the
  network before the SW finishes activating). Confirmed on a genuinely
  fresh install that it did NOT stop the warning — reverted. Worse, it
  exposed a real bug: sw.js's navigate handler always writes the fetched
  response under the hardcoded `index.html` cache key regardless of which
  URL was actually requested, so a cache-miss on `start.html` could get
  its (tiny redirect stub) content wrongly cached as `index.html`, causing
  an infinite redirect loop that looks exactly like a white screen. Don't
  reintroduce a second navigable URL without fixing that cache-key bug
  first (key the cache.put on `e.request.url`, not a hardcoded constant).
  Current read: this warning is very likely an iOS/WebKit-level thing that
  can't be reliably fixed from app code — not worth chasing further given
  how easily changes here cause real (data-risk) breakage. See also: the
  `checkForUpdate` flow (index.html, `A.checkForUpdate`) used to delete
  all caches before confirming a fresh copy was fetchable — any hiccup
  left a blank white screen with no recovery short of deleting and
  re-adding the home-screen icon (which, on iOS, has ITS OWN isolated
  localStorage/cache/SW separate from Safari and from any other icon of
  the same site — deleting one without an Export first loses its data
  permanently). Fixed by fetching a fresh copy first and only clearing
  the cache once that succeeds.

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
