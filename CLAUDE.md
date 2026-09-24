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
  boolean state of its own at all — its day value is whatever
  `trackerDayValue(it, ds)` finds in that project's OWN `trackerEntries`
  (and "done" is `habitDayVal`, below), rendered via `ciTracker()` (a
  number box in the tick zone since 2.92; the bar opens the tracker's
  own project page). Its name/icon
  are read from `DB.data.projects[trackerPid]` live on every render,
  never copied into the dailyItems entry, so renaming the tracker can't
  leave a stale label sitting in Daily.
  Since 2.92 there is ONE answer to "is this habit done on day ds":
  `habitDayVal(it,ds)` (falsy / true / 'skip'). A normal habit is its
  check-off (`dcv`); a tracker habit is done when that day's value
  reaches `it.goal` (optional number on the dailyItems entry, set in the
  habit sheet), or with no goal when anything was logged that day, and
  otherwise can be 'skip' (swipe on Today, stored in dailyChecks like any
  habit; saving a value clears it). EVERY score/streak/bar/count/
  disappear check goes through it — use it for any new one; don't
  re-branch on `it.trackerPid`. That's the history of this area: first
  Overview's count missed trackers (only checked `isDailyChecked`), then
  Statistics excluded trackers entirely ("a logged number isn't a
  check-off") — reversed in 2.92 at the user's request: tracker habits
  now count in Stats, best/worst use `habitName(it)` (a tracker entry has
  no `text`).
  Statistics reset (`DB.resetHabitStats`) covers tracker habits too since
  2.94 (it used to skip them, so their history kept counting): like any
  habit, `created`=today + `wasReset` (past days show locked on Daily:
  `ciTracker(...,locked)` — lock icon, no logging), and additionally
  `it.statsFrom`=now, because the tracker's entries are KEPT (they're the
  tracker's own data) and some may be from earlier today. The habit reads
  its day value only through `trackerDayValue(it,ds)` (latest entry that
  day with ts >= statsFrom) — `trackerEntryForDate` is gone — and
  `setTrackerDayValue(pid,ds,val,from)` never edits a pre-reset entry, it
  adds a new one instead. The tracker page's own chart/entries list still
  shows every entry.
  Tracker habit rows (`ciTracker`, Today and Daily) are split rows like
  habits: the tick zone shows a number box (`.trk-box`, that day's value;
  `--box` grey until done, `--go` green when done, skip style when
  skipped — same colors as a tick box, widening to fit the number); a tap
  on it (a hold, in hold-to-complete mode — the HOLD handler has a
  `.trk-box` branch) opens `TrackerDaySheet`, which SETS that day's value
  (`DB.setTrackerDayValue`: changes that day's latest entry or adds one
  timestamped on that day) so adjusting through the day doesn't pile up
  entries; future days can't be logged. The bar opens the tracker page.
  The old inline trash icon on Daily's tracker rows is gone — delete is in
  the habit sheet now (openEdit shows Delete for trackers too), reached
  from the tracker page's "Daily habit" Days/Goal rows.
  A tracker page for a Daily-linked tracker (`renderTracker` +
  `TrackerPage`): entries fold behind one "Entries N ›" row (closed by
  default, state kept per pid while the app runs), then Days/Goal rows,
  the habit bar chart (Day/Week/Month), Consistency ring and Longest
  streak — same pieces as a habit's own page (`barReadout` is shared).

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

- Swipe-right-to-skip on Today (`Skip`, `swipeWrap`; rows are wrapped in
  `.sw` with the amber action behind `.sw-row`). Two different data
  shapes on purpose: a skipped TASK gets `t.skip = 'YYYY-MM-DD'` and is
  just filtered out of Today for that one day (nothing to clean up — it
  returns by itself tomorrow, sorted first within its priority); with
  "Refill automatically" on Today re-renders so the next task fills in,
  off it just removes the row (same as completing one). A skipped HABIT
  day is stored in `dailyChecks[ds][id]` as the string `'skip'` instead of
  `true` — deliberately truthy, so every existing "is it done" check
  (score, streak, remaining count, disappear-when-checked) counts it as
  done with zero changes; read it with `dcv(ds,id)==='skip'` where the
  difference matters (amber bars in `renderBarChart`, `paintCheck`, the
  "· N skipped" captions). Any new code that reads dailyChecks should use
  `dcv`/`paintCheck` rather than assuming a boolean, and any wrapper
  around Today rows means `.remove()` calls must remove the `.sw`, not
  just the inner row (see `A.doneLockedIn`).

- Today's section headers (🎯 Tasks / 📆 Habits) are hidden when their
  section is empty (`syncTodaySections`), with one "Nothing to do today."
  line if both are. "Category with no tasks" in the user's wording meant
  THESE sections on Today, not the Daily page's per-weekday categories —
  I misread it once and changed Daily instead (reverted); when a request
  names a page ("in daily" was mistranscribed voice input), confirm which
  screen from the words around it before editing. Also: a swipe-skip must
  be saved (`DB.skipTask`) at the START of the gesture, not after the
  slide animation — leaving Today mid-animation re-rendered from
  unsaved data and the task "reappeared".

- "Refill automatically" OFF on Today means the day gets N task slots
  (`DB.data.todaySet = {ds,n,keys}`), filled once; a task that's completed
  or skipped keeps its slot used, so nothing replaces it — not even after
  leaving Today and coming back (renderToday re-runs on every visit and
  used to re-pick the top N each time, which looked like "the skipped/done
  task came back" — it was a NEW task filling the gap; it took a
  screenshot from the user's phone and their plain-words description to
  see that, after I'd chased a persistence bug that didn't exist). Refill
  ON clears the set and always shows the top N. The set resets on a new
  day or when the Tasks-shown count changes. When a "reappears" report
  can't be reproduced, first ask what the reappearing thing actually IS
  (same item vs a different one) before instrumenting anything.

- Keep failed-attempt history in this file, not in code comments: the
  sheet scroll-lock / overlay code had accumulated paragraphs about
  approaches that no longer existed (and a stale "safety reset" comment
  for code that was gone). Comments in index.html should describe what
  the code does now and why; the story of how we got there belongs here.
  When a fix is superseded, delete the old code AND its comment in the
  same change, and don't leave "Temporary:" entries in CHANGELOG (keep the
  version entry, reword it — WhatsNew's queue looks versions up by name).

- Trash (Settings > Trash, page id `p-archive`, `renderArchive`/`Trash`):
  nothing is deleted outright anymore. Every delete path snapshots into
  `DB.data.trash` (`{id,type,label,sub,at,data}`, types: habit, project,
  entry — a deleted category is NOT an entry: its projects/habits are
  trashed one by one, each carrying a snapshot of the category so
  restoring recreates it; old category/habitcat entries are split on load) and `DB.restoreTrash(id)` puts it back
  (recreating a missing parent category from the snapshot; an entry needs
  its project to exist, else it returns a message). Completed tasks are
  still `DB.data.archived` and are the first tab (labelled Tasks). A NEW delete path must
  push to trash too (use `DB._trash`, and `_takeProject`/`_putProject`
  for projects) — grep `filter(` on dailyItems/dailyCats/projects when
  adding one. Settings > Overview > "Reset a project" (`DB.resetProject`) empties one
  project into the Trash: To-do/List tasks become `archived` entries with
  `removed:true` (no `dateISO`, so they don't count as completed in the
  stats), tracker entries become `entry` trash items, Daily's habits become
  `habit` items and its categories are removed. Ticking a one-time task (`dailyOnce`) archives it
  (`section:'One-time', once:true, due`) into Trash > Tasks (2.58); `restoreTask` puts a
  `once` entry back on the calendar with its old date.

- Language (Settings > Language, `I18N` in index.html): English is the
  source text in markup and JS; German is a DOM translation layer — `DE`
  maps exact English strings to German, `RULES` (regex) handles strings
  with numbers, a TreeWalker + MutationObserver translate text nodes and
  placeholder/title attributes (original kept on the node so switching
  back restores it). So: NEW UI TEXT needs an entry in `I18N`'s `DE`
  (or a rule if it has a number/name in it) or it stays English in
  German mode; strings that never reach the DOM (alert/confirm) must go
  through `t()`; CSS `content:` strings need an `html[lang="de"]`
  override. Text built as one string from a label + user content
  ("Tracking: "+name) needs a rule, not a DE entry. A DE key that is an
  ordinary word can also translate a user's own item with that exact
  name — acceptable, but avoid adding very generic keys. Dates already
  used de-CH everywhere, so they were left alone; What's new notes stay
  English. To find gaps, switch to German and walk every page/sheet
  listing text nodes that lack `__en`.

- Settings is a LIST of widgets that each open their own full page (no
  sheets): App (version, "Update automatically" switch = `settings.autoUpdate`,
  manual "Check for updates", version history), Appearance (theme), General
  (Open app on + Menu), then Today / Overview / Statistics / Data, plus
  Hold-to-complete / Language / Trash on the main list. Sub-pages are plain
  `.page.sp` elements listed in `SETTINGS_SUBPAGES` (back returns to
  Settings, the Settings tab stays lit; Menu's back goes to General);
  `renderSettings()` fills all their containers, so a new setting only needs
  its markup in the right container. Sub-pages have NO icons on their rows (only the main list does) — except Appearance, whose Light/Dark/System rows keep theirs by request. The `.sp` class carries the slim
  no-outline settings styling (it used to be `#p-settings`). The old Version
  history / Menu bottom sheets were removed. Auto update = a silent
  `A.checkForUpdate(true)` at launch and on resume after 30 min; it only
  speaks up (progress overlay, then reload) when an update exists.

- Update detection (2.28): the service-worker events (`updatefound`,
  `controllerchange`) are not trustworthy on iOS, and worse, the page's own
  `fetch('sw.js')` used to be answered from the SW's cache-first handler
  with a STALE stored copy — so "compare with the server" was comparing the
  device with itself. sw.js now returns early for its own URL (never cached
  or intercepted), and `A._latestInstalled()` fetches `sw.js?c=<now>`,
  reads `CACHE_NAME` and checks `caches.keys()` for it: a missing cache
  means a newer release exists regardless of what the events said. If the
  normal flow reports "no update" but that check says outdated,
  `A._hardUpdate()` unregisters the worker, deletes the caches and
  `location.replace`s to `?v=<now>` (localStorage untouched). Auto updates
  (`settings.autoUpdate`) run `checkForUpdate(true)` 1.2s after launch and
  on resume after 5 min. Every release must still bump CACHE_NAME (that's what the
  comparison keys on).

- Bottom sheets have NO Cancel/Close/back buttons (only real actions like
  Save/OK/Delete/Got it): they close by pulling down or tapping the dimmed
  background, and every `.sheet` gets a grey `.sheet-drag-handle` injected
  at load so that's obvious. The generic pull-down (search "Every bottom
  sheet closes by pulling it down") only takes over when the sheet is at its
  scroll top, follows the finger, and on release runs the overlay's own
  onclick (so a pull behaves exactly like a background tap, including
  cancel callbacks) with `_instantClose=true` so `_overlayClose` doesn't wait
  a second animation. A new sheet only needs `.sheet-overlay` with an onclick
  close and a `.sheet` child — no close button, and don't add one.

- Design system (2.55, the "DESIGN SYSTEM" block at the end of the CSS): the
  Settings look is the look of the whole app. Cards are `var(--card)` on
  `var(--pg)`, radius 14, NO outlines, 1.5px `var(--line)` dividers, rows 46px.
  Text roles (weights lightened in 2.56 — the "lighter weights" rule at the end of the
  block wins): page title 20/700 (26/700 on pushed pages via `.hh`), row text
  15/500, secondary 12/500 grey, paragraph 13/500 grey, uppercase label
  (`.sl`/`.shdr`/`.caltitle`/`.el-grp`/`.sheet-label`) 11/700, buttons 15/500,
  badges/pills 12/500. Groups of rows live in ONE card (`.card-list` for task
  rows, `.opt-group`, `.el-card`, `.calsec`), not one card per row. Header
  buttons are soft 40px squares (`.hh-btn`, and `.hdr-add/.menu-btn/.back/
  .edit-proj-btn` are restyled to match); pushed pages (project pages, Edit
  layout, Daily, habit detail, Settings sub-pages) all use the `.hh` header.
  Sheets have a grey (`--pg`) background with white inputs/rows; their buttons
  (`.sheet-save`, `.danger` for red) are white rows with blue text like
  Settings' buttons, choice lists (`#cat-choices`, `#add-choice-list`,
  `#cat-btn-list`) are one white card with dividers, option buttons are
  `.type-btn` in a `.type-grid`. The new block uses `html:not(#x)` to beat the
  older theme-specific rules above it — when restyling something, put the
  change in that block rather than editing the old rules again. New inputs
  inside an `.opt-row` need the `input` bail-out in the TAPPABLE handler
  (already added). No emojis on categories, section titles, choice rows or
  type buttons (only user-chosen project icons remain).

- `.cali`'s press-grey went through two rounds (2.87, then 2.88 — the
  2.87 approach is superseded, don't resurrect it). First round tried to
  keep `.cali`'s box model as-is (edge inset via a `.calsec>.cali{margin:
  0 -15.5px;padding:0 10px}` hack) and patch around `swipeWrap('h',...)`
  wrapping habit rows in `.sw.h > .sw-row > .cali` when Settings > Today
  > "Skip habits" is ON: scoped the CSS rule to `.calsec>.cali` (direct
  child only) and added a separate `.pressed-row` class on `.sw-row` for
  the wrapped case. That fixed the two reported symptoms (checkbox press
  greying the row; grey not reaching the edges) but still left `.cali`
  laid out differently from Settings' `.opt-row`, and got flagged
  immediately as still visibly misaligned ("the top is not aligning") —
  told directly to stop patching and copy `.opt-row`'s actual layout
  instead of reverse-engineering another fix. `.opt-row` never needs any
  inset hack in the first place because `.opt-group` (its card) carries
  NO padding of its own — `.opt-row` supplies its own `padding:0 14px`
  directly and that alone reaches the card's true edge. `.cali`/`.calsec`
  had the opposite arrangement (card padded, row unpadded, then a
  negative-margin hack to fix it back up) for no real reason. Fixed by
  making `.calsec` match `.opt-group`: `#today-daily .calsec,[id^="dp-"]
  .calsec` padding is now `0` (2.88 still kept a 2px top padding "for the
  gap under the category title" — but the title sits OUTSIDE the card, so
  those 2px were white inside the card above the first row, reported in
  2.89 as "a white strip at the top that isn't grey"; removed), `.cali`
  itself carries `padding:0 14px` directly, and the old `.calsec>.cali`
  margin hack plus
  the `.sw.h`/`.sw-row` margin/padding/`.sw-act` offset overrides are all
  gone outright — with the card unpadded, `.sw.h` is naturally already
  flush, so none of that compensation is needed whether a row is wrapped
  or not. This also means `.cali` is now uniformly the correctly-sized,
  full-bleed element in EVERY case (Today or Daily, Skip habits on or
  off), so the wrapped-vs-unwrapped CSS split from the 2.87 round is
  gone too: one rule, `.cali:not(.locked).pressed-row`, covers all of
  it. The checkbox-exclusion problem itself was real and stays fixed the
  same way regardless of layout — `.cali`'s checkbox is a normal,
  visibly-sized input and genuinely IS the touch target (unlike
  `.switch input`, deliberately `width:0;height:0` so it's never what
  the finger actually lands on), and `:has(input:active)` could not be
  confirmed reliable for excluding a real touch target on-device (only
  testable here via synthetic DOM events, not real `:active` state). The
  `.pressed-row` class is still JS-driven (search "Press feedback for
  habit rows"): a touchstart/touchmove/touchend IIFE that bails out on
  `closest('input')` — the same style of bail-out TAPPABLE already uses
  — and clears on >10px movement so a swipe starting doesn't leave the
  grey stuck. Verified via dispatched TouchEvents (checkbox press never
  adds the class; bar press does and now measures exactly equal to
  `.calsec`'s width in both Today and Daily) plus a visual screenshot.
  Lesson worth keeping: when two structurally-identical widgets
  (`.opt-row`/`.opt-group` vs `.cali`/`.calsec`) end up laid out
  differently for no functional reason, matching the ALREADY-WORKING
  one's actual box model is more reliable than layering CSS specificity
  tricks on top of the divergent one — asked for explicitly here after
  the narrower patch still visibly didn't match. `.sw.t` (tasks) uses
  the same `swipeWrap`/`.sw-row` structure and hasn't been reported
  broken or misaligned, so it was deliberately left as-is; if it ever
  is, this same box-model mismatch is the first thing to check.
  Removing `.calsec`'s horizontal padding in 2.88 also silently left the
  "No habits" placeholder (`.cal-none`, the only non-row child of a
  Daily card) flush against the card's left edge — it had relied on the
  card's padding. Fixed in 2.89 (`.cal-none` carries its own 14px). When
  moving padding from a container onto its rows, check every OTHER kind
  of child that container can hold, not just the rows.
  2.89 — habit rows (`ci()`/`ciEdit()`, class `cali split`) are two
  buttons that between them cover every point of the row, asked for
  explicitly ("one for the tick off where it doesn't get grey and the
  rest of the bar where it does"): `.cali-tick` (a span around the
  checkbox, padding `0 12px 0 14px`, full row height) — a tap anywhere
  in it ticks via `tickZone()` (forwards to `cb.click()` unless the tap
  landed on the checkbox itself, which toggles natively, and does
  nothing in hold-to-complete mode) and never greys; and the label,
  stretched to full height (`align-self:stretch;line-height:47px`,
  line-height rather than flex-centering so its ellipsis keeps working)
  and to the right edge (`padding-right:14px`) — opens the habit and
  greys the whole row. Before this, the 14px left padding, the 12px gap
  and the strips above/below the label text were dead zones that greyed
  the row but did nothing. The press-grey JS bails on
  `closest('input,.cali-tick')`, and Skip's swipe start check uses the
  tick zone's right edge instead of the checkbox's. One-time rows
  (`onceRow`) and tracker rows (`ciTracker`) are NOT split — a one-time
  row's label already ticks it. (Tracker rows became split rows too in
  2.92 — see the dailyItems entry above.)
  Since 2.92 every habit bar that opens a page ends in Settings' right
  arrow (`CALI_CHEV`, a `.cali-chev` span that forwards its tap to the
  label, so it's part of the bar); locked rows show the lock instead. The
  trailing element carries the row's 14px right edge (label has no right
  padding of its own).
  Regression from the 2.89 split, found in 2.92: `paintCheck` found the
  label with `cb.nextElementSibling` — empty once the checkbox moved into
  `.cali-tick`, so ticked habits silently lost their strike-through for
  three releases. Now `row.querySelector('label')`. When wrapping an
  element in a new container, grep for sibling/parent navigation from it
  (`nextElementSibling`, `previousSibling`, `parentNode`), not just
  selectors.
  Rule since 2.90 (asked for directly): the pressed grey only shows on
  rows that OPEN something (a window/sheet or a page). Habit bars (habit
  page), tracker rows (tracker page), task rows `.ti`/`.wri` (TaskSheet)
  grey; one-time tasks have nothing to open, so neither `.cali[data-once]`
  (Today/Daily, excluded in the press-grey JS) nor `.ti[data-once]`
  (Tasks > Calendar, excluded in the `.ti:active` CSS rule) grey. A NEW
  row type with a press-grey needs the same question asked: does a tap
  open anything? If not, no grey.
  Same rule for Settings-style rows (2.93): an `.opt-row` holding a
  `.switch` does nothing itself (only the switch toggles), so the
  `.opt-row:active` grey is `:not(:has(.switch))`. (A structural `:has()`
  like this is fine; it's `:has(input:active)` — a live touch state —
  that proved unreliable on-device.)
  2.95 — task rows (`.ti`/`.wri`) work like habit rows: two zones split
  at `tickEdge(row)` (a habit's `.cali-tick` right edge, or a task's
  checkbox right edge + 6px). A delegated click on the row's own padding
  ticks (tick zone, not in hold mode) or opens the task (clicks the
  `TaskSheet.open` element) — padding used to be a dead zone. ONE press-
  grey IIFE ("Press grey for task and habit rows") drives `.pressed-row`
  for `.cali/.ti/.wri`: never in the tick zone, never on one-time tasks or
  locked habits, and only after `PRESS_DELAY` (110ms) with any >10px
  movement cancelling it — so a swipe-to-skip never flashes grey (asked
  for: "a slight delay to the grey… when I start sliding it doesn't come
  but if I hold then it goes grey"); a tap shorter than the delay still
  flashes for `PRESS_TAP_MS`. Skip's swipe-start check uses `tickEdge`
  too. The old `.ti:active:not(:has(input:active))` rule is gone.
  Press-grey timing for EVERY greying element is one CSS block ("Press grey
  timing"): fade in .2s on the pressed state (`:active`/`.pressed-row`),
  and on the resting state `.4s` fade-out after a `.15s` linger — a
  transition takes the timing of the state it's going TO, which is what
  makes the linger possible even for plain `:active`. New greying
  elements need adding to both selector lists there.
  2.98 — Settings-style rows (`.opt-row`, not switch rows) moved onto the
  same JS `.pressed-row` IIFE, asked for as "the slide and grey animation
  in Today is perfect, make Settings the same". The page slide itself was
  already identical (both go through navForward, 280ms; page renders
  measured <1ms either way) — the felt difference was the grey: plain
  `:active` starts instantly and starts fading the moment the finger
  lifts, i.e. exactly when the slide begins, so a quick tap never reached
  full grey; the JS version holds a full flash for PRESS_TAP_MS into the
  slide. When two things "feel" different but share their animation
  code, compare what runs AROUND the animation before touching it.
  3.2 — "some Settings rows don't go grey": every row matched the press
  selector; the misses were rows whose tap REDRAWS their own list
  (Appearance Light/Dark/System re-render via renderAppearance, "Reset
  skipped tasks" via renderSettings) — TAPPABLE's click runs on touchend,
  the row element with `.pressed-row` is replaced by a fresh copy, and the
  grey goes with it. Fix (generic, in the press IIFE): 50ms after
  touchend, if the pressed row is detached, the row now at the touch point
  gets the grey — only if it has the same `onclick` (so a different row
  moving into the spot, e.g. after a Trash restore, doesn't flash); a row
  that was already fully grey is re-greyed instantly (`.press-now` =
  transition:none) and then fades out. Also: rows holding a dropdown
  (`.dsel-wrap`: Language, Day starts at, the Task window's Priority/
  Project…) no longer grey at all, by request — like switch rows, the
  control is the dropdown, not the row. Selector is `PRESS_ROWS`.
  To find which rows "don't do X", enumerate them all and test each
  (`.click()` with navigation/dialogs stubbed, then check
  `document.body.contains(row)`) instead of guessing from one.
  3.5 — the same thing again, on rows that NAVIGATE: opening Today/
  Overview/Statistics from Settings runs `_renderPage` -> renderSettings(),
  which rebuilt the Settings list itself too, replacing the tapped row
  while the new page slid in over the touch point (so the point-based
  carry-over couldn't find the copy). Root fix: renderSettings writes its
  three list containers through `setHTML(id,html)`, which only touches
  the DOM when the HTML changed — unchanged rows survive. The carry-over
  also now finds the copy by `onclick` anywhere (preferring the one under
  the finger, else only if it's the single match). Any render function
  that runs on navigation and rebuilds the page you're LEAVING will cause
  this; prefer setHTML-style "only if changed" writes there.
  3.10 — "the grey in Settings still feels a touch weaker than Today's":
  color, fade timings and slide were measured identical. The real
  difference was WHO clicks: Today's rows open on the browser's own click,
  which comes a moment after touchend, so the grey gets a head start before
  the slide; Settings' `.opt-row`s were clicked by TAPPABLE synchronously
  inside touchend, so the slide started in the same frame as the grey.
  Rows that grey (`PRESS_ROWS` with an onclick) are now left to the native
  click (TAPPABLE skips them), same path as Today by construction. The
  carry-over now waits for that click (capture listener, 300ms fallback)
  instead of a fixed 50ms. When two things "feel" different but measure
  the same, compare which code path triggers them, not just the timings.

- Stats/habit-detail progress ring (`renderPieChart`): fully round ends
  (`stroke-linecap="round"`) were called cheap-looking, flat ends (2.89)
  too spiky, and a gap between done and skipped (2.90) disliked too. Now
  (2.91): segments are filled paths (`ringSegment(f0,f1,col,rs,re)`), only
  the ring's two OUTER ends are rounded by `RING_CORNER` (2.5 = a quarter
  of the ring's 10-unit thickness), and done→skipped is a flat cut with
  no gap, "like the stacked bars in the bar chart". The skipped segment is
  drawn first and reaches a hair (EPS) under the green where they meet
  (and under green's start at 100%) so two shapes sharing an edge don't
  show an anti-aliasing seam. A stroke can only do sharp or fully round
  ends, hence the path. The corner radius shrinks on very short segments
  so corners never overlap (1% still renders as a sliver); a single color
  at 100% is a plain closed ring. Side benefit over round caps: the arc
  length is exact.

- Adding things on a project page (2.91): the header "+" (`TabPlus.tap`)
  opens a slide-up window instead of revealing an inline bar under the
  list — asked for as "a full new window". Tasks: the same Task window
  used for editing, `TaskSheet.openNew(pid)` (key stays null until Save,
  which calls `DB.addTask` then `updateTask` for notes). Trackers:
  `TrackerAddSheet` (title = tracker name, unit shown inside the field).
  Enter saves in both. The old inline bars (`addwrap-`, `trk-addwrap-`,
  priority pills `.pri-row/.pri-pill`, `selPri`, `A.addTask`,
  `.trk-addinp`) were removed outright; `.addrow/.addinp/.addbtn` stay
  because Daily's category sheet still uses them. The Task window hides
  its Priority row when the (destination) project is a List, in both add
  and edit mode — List projects don't sort by priority.
  3.9 — that change broke "+" on every project created before project
  types existed: those have NO `type` saved (everything else treats that
  as a to-do list), and TabPlus required `type==='todo'||'list'`, so they
  fell through to Overview's "Category / Project" choice. `DB._migrate`
  now sets `type:'todo'` on untyped projects (not the Daily project), and
  TabPlus opens the Task window for anything that isn't a tracker. Real
  data is older than the preview's blank data — when a new check keys on
  a field, ask whether old saves have that field at all.

- The update screen (`UpdateOverlay`) counts as an open overlay
  (`_overlayCount`, `_lockBodyScroll`) since 2.91 — it wasn't a
  `.sheet-overlay`, so the page behind it could be scrolled while it
  downloaded. Any other full-screen, non-sheet overlay needs the same.

- Project cards on Overview (`.acard`) don't scale down on press (removed
  `.acard:active{transform:scale(.95)}`, 2.91) — only the grey press
  color remains. Dragging still scales up via `.dragging`.

- Dates next to page titles look the same everywhere (2.91): Today's
  `#tlbl` and Daily's `#wlbl` are both `.tlbl` (13/500 grey), right of the
  title, format `toLocaleDateString('de-CH',{weekday:'short',day:
  'numeric',month:'short'})`. Daily's title row is `.hh-titlerow` (title
  button + date); its date follows the selected day (`updWL`). The two
  TITLES still differ by design system (Today is a tab page, 20px; Daily
  a pushed page, 26px).

- The weekday picker in the habit add/edit sheet (`#daily-item-days`,
  `.type-grid.days .type-btn.active`) uses the same full `--ink` fill with
  `--card` text as the selected day on Daily's day strip (`.dpill.sel`),
  not the blue tint the other `.type-btn` option buttons use (2.89, asked
  to match "the full black fill"). Other `.type-btn` pickers (project
  type etc.) still use the blue tint — only day selection was asked for.

- Statistics (2.99) is laid out like a Settings page: `#p-stats` has the
  `.sp` class (Settings row sizing), `.sl` section labels, 14px between
  cards; best/worst are one-line `.opt-row`s in an `.opt-group` with an
  `.opt-ico` (green triangle up / red triangle down since 3.0 — trend
  lines were too busy), score and arrow
  (`Stats.habitRow`), tapping opens the habit page (`HabitDetail.open`,
  origin 'stats') or a tracked project's page (`_trackerOrigin='stats'`);
  back and swipe-back return to Statistics via `_backTarget`, and
  `TabBar.current` keeps the Stats tab lit on both (also lights Today for
  a tracker opened from Today, which used to light Overview). White cards
  (`.calsec`) have no border anywhere now — Statistics, habit pages and
  tracker pages still carried an invisible 1.5px one. Stat text uses
  `.stat-note` (paragraph role 13/500 grey) and `.stat-num` (32/700, like
  a tracker's value) on Statistics, habit pages and tracker pages alike.
  The "One-time tasks" section (average completed per day, from
  `DB.data.archived` entries' `dateISO`) was removed from Statistics in
  3.1 "for now" — markup, render code and `oneTimeTaskStats()` all went
  (see commit history to bring it back). `dateISO` is still recorded on
  every completion, so the history is intact if it returns.

- Back navigation (3.7) follows real history: `Nav.go` pushes the page
  you're leaving onto `Nav.stack`; `_backTarget()` returns the last entry
  that still exists (skipping e.g. a deleted project); arriving back —
  via navBack or the swipe-back gesture — calls `_popTo(target)`;
  `TabBar.go` (switching tabs) clears it. `TabBar.current()` lights the tab
  the history started on (`Nav.stack[0]`). The older fixed rules
  (SETTINGS_SUBPAGES -> Settings, HabitDetail.origin, _projFromDaily/
  _trackerOrigin, default Overview) remain only as a fallback when there's
  no history (e.g. right after the app reopens). Asked for as "always go
  back to the page before" — e.g. Settings > Overview > Edit layout used to
  jump back to Settings. New navigation should go through `Nav.go` (not
  navForward directly) or it won't be in the history.

- Page slides (3.6), after "holding a Settings row long then letting go
  makes the slide stutter; Today is fine": (1) nothing prevented a second
  navForward/navBack while a slide ran — two slide loops each rewrite the
  pages' transforms every frame and fight. `_slideStart()` now ignores a
  navigation while one is running (guard self-expires after 700ms so it
  can't block for good; `Nav.go` doesn't record a skipped one), and
  `_slideEnd()` releases it. (2) the status-bar blur (backdrop-filter +
  mask) re-blurs whatever moves under it every frame — heavy on iOS — and
  a long hold that drifts a few px (still a tap: TAPPABLE's threshold is
  10px) scrolls the scrollable Settings page just enough to switch it on
  as the slide starts; Today is usually too short to scroll. `body.sliding`
  now hides the blur (display:none) for the whole slide, and `_slideEnd`
  settles its `.on` state from the final scroll position before showing it
  again (no fade flash). Which of the two caused the reported stutter
  can't be told from the preview; both are fixed. The interactive
  swipe-back runs its own `_slideUnit` and isn't guarded.

- Page-open/close slide (`navForward`/`navBack`, via `_slideUnit`) was
  160ms forward / 180ms back — reported as feeling too quick, wanted
  slower and more graceful. Both bumped to 280ms, then 320ms in 3.8
  (`SLIDE_MS`, "a tiny bit slower") (same ease-out-cubic
  curve, untouched). Deliberately left the swipe-back gesture's own
  `_slideUnit` calls (the 120ms ones, for the interactive drag-release
  snap) alone — those are driven by the finger leaving the screen, not a
  tap, and the request was specifically about tapping into/out of a page.

- A tracker-linked Daily item (`ciTracker()`) renders on BOTH Today and
  Daily now (since 2.53), sharing one function — but `_projFromDaily`
  (set right before navigating to the tracker's project page, so back
  knows to return to Habits instead of Overview) only ever pointed at
  Habits, regardless of which page the tap actually came from. Tapping a
  tracked habit on TODAY and swiping back landed on Habits/Daily instead
  of Today. Fixed with a second variable, `_trackerOrigin` ('today' or
  'habits', derived from `ciTracker`'s existing `editable` flag — true
  only when rendered by Daily), read by `_backTarget()` instead of the
  hardcoded 'habits'. Any future page that both renders a tracker link
  AND isn't Today or Daily needs to set this explicitly too, the same
  way `HabitDetail.origin` already tracks it for the habit detail page.

- Regular (non-tracker) habits can now have an optional `desc` on the
  `dailyItems` entry, edited in `DailyItemSheet` (hidden, like the name
  field, when `trackerPid` is set — a tracked project's own description
  covers that case) and shown under the title on the habit's own page
  (`#hd-desc`, hidden when empty). Deleting a habit moved from a
  standalone trash icon on every Daily row (`ciEdit`) into a Delete
  button inside this same edit sheet (`DailyItemSheet.remove`, editId-
  gated) — `ciEdit` no longer renders one. `ciTracker`'s row keeps its
  own inline trash icon: a tracker link has no edit sheet of its own to
  hold a Delete button, so removing its only delete path would leave it
  stuck in Daily permanently.

- Drag-to-reorder (2.84, `DragReorder`): long-press (450ms, cancelled by
  >10px movement before then) picks an item up — `position:fixed`, a
  `.dragging` class (scale+shadow, no shiver by request), tracked to the
  finger — then swaps it past whichever sibling it overlaps on drop.
  `DragReorder.init(container, handleSel, itemSel, mode, onDrop)` is
  generic: `handleSel` is what has to be PRESSED to start a drag (a whole
  card, or just a category's title text so the title can drag the whole
  block); `itemSel` is what actually gets picked up (the nearest ancestor
  matching it from the handle). One `container` per sibling group is what
  scopes a drag — Overview wires each category's own `.agrid` separately
  for its projects (so a project can't be dragged into a different
  category this way), and the whole `#overview-grid` once for `.cat-block`
  category reordering. Daily wires every day panel's own `.calsec`
  (harmless to wire all of them — a `display:none` panel's rows never
  receive touches anyway) for habit reordering within a category.
  3.12 — ONE universal habit order, asked for as "if meditation is above
  reading it's always above reading… changing it on one day changes it
  everywhere": `dailyItems`' array order IS that order (every day panel
  and Today list habits in array order, filtered by day). The old
  `DB.reorderDailyItems` put the visible (dragged-day) habits first and
  appended every habit NOT shown that day after them, so a drag on Monday
  pushed Tuesday-only habits to the bottom of their category — the order
  shifted on other days. Replaced by `DB.moveDailyItem(id,beforeId,
  afterId)`: only the dragged habit moves, to right before the visible
  habit now below it (or right after the one above it when dropped last);
  everything else keeps its place. DragReorder's onDrop now also gets the
  dragged element (`onDrop(container,el)`). Never rebuild the whole list
  from what one day shows — that day doesn't show every habit.
  Two real bugs from writing this, worth not repeating: (1) suppressing
  the tap TAPPABLE (the generic touch-feedback IIFE) would otherwise still
  fire on release used `stopPropagation()` from a SEPARATE listener on the
  dragged element — which also silently ate the drag engine's OWN
  `touchend` listener, since that one was on `document` and never got to
  fire once propagation stopped. Fixed by binding the drag's own
  touchmove/touchend/touchcancel straight to the element instead of
  `document` (touch events always keep targeting whatever element
  touchstart actually hit, no matter where the finger goes, so this works
  and lets `_end` itself call `stopPropagation()` after doing its own job,
  with nothing downstream left to accidentally cut off). (2)
  `wireOverviewDrag()` runs at the end of every `renderGrids()` call (task
  completion, project add/edit/delete, tab switches — very frequent), and
  initially called `DragReorder.init` on `#overview-grid` itself every
  time — that container is NOT recreated by `innerHTML=h` (only its
  children are), so every call stacked another duplicate listener on the
  same persistent element, each independently firing `_begin()`/`_end()`
  for one gesture and stepping on each other's state in the shared
  `DragReorder` singleton (`_end` reading `this._el` after a previous
  duplicate call had already nulled it — `Cannot read properties of null`).
  Fixed with a `dataset.dragWired` guard so that specific container is
  only ever wired once; the per-category `.agrid`s and Daily's `.calsec`s
  genuinely ARE fresh elements every render, so they need no such guard.
  3.11: a habit row is picked up only from its BAR — a touch in the tick
  zone (`input`, or x <= `tickEdge(row)`, the same split as the press
  grey) never primes a drag (DragReorder.init's touchstart). Before, a
  hold on the tick box both ticked (hold-to-complete) and started a drag.
  Only verified via synthetic `Touch`/`TouchEvent` dispatch in this desktop
  preview (real long-press timing and drag physics need a real phone) —
  one thing that surfaced there and is worth knowing before "debugging" it
  again: this preview's `setTimeout` gets throttled to ~1s regardless of
  the requested delay whenever the tab isn't the foregrounded/focused one,
  which looked exactly like swap-oscillation until dispatching moves
  back-to-back (no artificial delay) confirmed the swap logic itself was
  already stable — a `_lastSwapWith`/`_lastSwapAt` 250ms cooldown on
  re-swapping the same pair is still in there as a real safety net against
  a swap's own reflow shifting the target enough to immediately re-trigger
  itself, just wasn't what that particular test artifact was showing.
  Follow-up (2.85), asked for explicitly ("they should move and make
  place like on Samsung/Google phones"): the swap above worked (the data
  order was correct) but nothing ever visibly SLID — because `el` is
  `position:fixed` the whole drag, which removes it from grid/list flow
  entirely; the siblings already did their one-time, unanimated reflow
  to close its gap the moment `_begin()` made it fixed, and reordering a
  fixed element's DOM position among them afterward changes nothing
  further about their layout no matter how many times it happens — so
  the FLIP diff always measured zero movement. Fixed by leaving a plain
  invisible `.drag-placeholder` (same size) in `el`'s spot instead: `el`
  still floats fixed on top same as before, but it's the PLACEHOLDER —
  a genuine flow participant — that actually gets swapped among the real
  siblings, which now truly reflows them and gives the FLIP diff real
  deltas to animate. `_end` swaps `el` back in for the placeholder at
  drop.
  This preview's `requestAnimationFrame` doesn't fire at all during
  `javascript_exec` calls (confirmed separately — a counter incremented
  in an rAF loop stayed at 0 after a real 300ms wait), on top of the
  `setTimeout` throttling already noted above — so the FLIP animation's
  before-offset was verified correct (a real `translate()` delta showed
  up immediately after a swap, proving the placeholder approach fixed
  the "nothing moves" bug) but the animation's OWN cleanup (the thing
  that's supposed to release the offset with a transition so it slides
  rather than snaps) could only be verified by manually flushing a
  monkey-patched rAF queue, not by actually watching a frame render. If
  a future report says the slide still just snaps instead of easing, get
  that confirmed on a real device before assuming this code is at fault
  — this preview cannot exercise that path at all.
  Also from this same round: don't trust `navigate`-ing this file to a
  new `?v=N` query as a clean reset between test scenarios — this file
  lives outside the configured preview root and renders as a static
  `data:` snapshot (confirmed: `localStorage` throws `SecurityError:
  Storage is disabled inside 'data:' URLs` here), and `DB.data` kept
  accumulating projects/categories added by earlier `javascript_exec`
  calls across what looked like separate navigations. `DB.data=DB._blank()`
  at the start of a test scenario is what actually gets a clean slate.
  The same goes for monkey-patches: a test that wrapped
  `A.toggleDailyItemFor` and then threw before restoring it left the
  wrapper installed across a `navigate`, and a second test's
  `var orig=...` (global scope, same name) turned the old wrapper into
  one that called itself — "Maximum call stack size exceeded" and ticks
  that never saved, which looked exactly like an app bug and wasn't.
  Wrap test code in an IIFE (no globals), restore patches in `finally`,
  and when a result looks impossible, check `fn.toString()` for a leftover
  wrapper first. Closing the tab and opening a new one (`tabs_close` +
  `preview_start`) is the only reliable full reset. Also: `DB._blank()`
  has "Hold to complete" ON (the fresh-install default), where a plain
  tap on a habit deliberately doesn't tick — turn it off in a test before
  concluding that ticking is broken.
  `location.reload()` doesn't reload this preview's data: snapshot (a
  marker variable survives it), and a tab can't be put into the mobile
  preset before its first load — so code that decides "is this iOS" at
  load time always sees desktop here. To test such a path, eval the real
  block from `document.scripts[0].textContent` with only the flag line
  replaced (2.97 did this for the keyboard tap takeover).
  Screenshots only show what the pane last PAINTED: when the Browser pane
  is hidden (`document.visibilityState==='hidden'`) it stops repainting
  and every screenshot repeats the last frame even though the DOM has
  moved on — check `document.visibilityState` before trusting a
  screenshot that contradicts the DOM, and verify layout with
  getBoundingClientRect measurements instead.
  Two unrelated fixes landed in the same 2.85 pass while looking at this
  screen's presses: (a) the pressed-grey on a `.ti`/`.cali`/`.wri` row
  was appearing when pressing the CHECKBOX too, since CSS `:active`
  bubbles up from any pressed descendant — scoped it to the row itself
  with `:active:not(:has(input:active))`, since the checkbox already has
  its own tick animation and didn't need the row flashing on top of it.
  (b) a row with no border-radius of its own (by design — dividers run
  edge-to-edge) relies entirely on its card's `overflow:hidden` clip to
  look rounded at the top/bottom row — but that clip only ever cuts a
  sharp corner down to the curve, it was never actually PAINTING anything
  of its own into the sliver that sits outside that curve but inside the
  square. At rest that sliver just showed the card's own color (invisible
  — the row's rest background matched it exactly), but the row's own
  OPAQUE press-color filling it revealed whatever's behind the WHOLE
  card instead of the card's color, in every single first/last row
  across the app, not just Today (same root cause as the white-sliver
  fix two versions earlier, just the corners instead of the bottom edge).
  Fixed the same way: `:first-child`/`:last-child` on every row-in-card
  type get the matching corner radius directly, so their own fill
  reaches the true rounded boundary instead of depending on the parent's
  clip to fake it.
  That `:first-child`/`:last-child` fix itself turned out wrong for
  habits specifically (2.86, reported with a real screenshot: a MIDDLE
  row rounding at the bottom like it was last). Root cause: with Settings
  > Today > "Skip habits" turned ON, `swipeWrap()` wraps EVERY habit row
  in its own `.sw.h > .sw-row`, so each `.cali` becomes the ONLY child of
  its own individual wrapper — making it simultaneously `:first-child`
  AND `:last-child` of THAT wrapper, for every single row, all the time.
  Both radius rules then matched every row; whichever was declared later
  in the stylesheet (the `:last-child` one) won outright since border-
  radius is a single shorthand property, not four independent longhands,
  so EVERY row silently got bottom-only rounding regardless of position.
  This didn't reproduce with "Skip habits" off (the default, and what
  every test in the previous entry happened to use) since then `.cali` is
  a plain direct child of `.calsec` and the selector matches correctly —
  which is exactly why it shipped unnoticed and needed a real device
  screenshot to catch. Fixed by dropping the CSS pseudo-selector for
  `.cali` specifically and marking the true edges explicitly instead:
  `markEdgeRows(container, itemSel)` (in index.html, called after every
  `buildPanels()`/`renderToday()`) reads `container.querySelectorAll
  (itemSel)` — which finds `.cali` regardless of how deep it's nested —
  and toggles `.row-first`/`.row-last` on the actual first/last match;
  the CSS now keys off those classes for `.cali` instead of the pseudo-
  selector. Needs calling from BOTH render paths that build a `.calsec`
  of habits — Daily's `buildPanels()` (all day panels, plus its own
  `[data-cat]`-less One-time section, which `wireDailyDrag` deliberately
  skips since one-time tasks aren't reorderable — that skip must not
  also skip marking it) AND Today's separate `renderToday()` — missing
  either one leaves that screen's edge rows back to unrounded/square
  rather than wrong, but still not matching the card. Other row-in-card
  types (`.ti` in `.card-list`, `.opt-row` in `.opt-group`, etc.) still
  use the plain pseudo-selector — they don't have an equivalent per-row
  wrapping path today, but if one is ever added to any of them, it needs
  this same explicit-class treatment, not another one-off fix.
  A row ALONE in its card matches both first and last; the later
  bottom-only rule won, so e.g. a single War Room task's red stripe
  (inset box-shadow, follows the radius) was square at the top. Fixed in
  2.92 with an `:only-child` (and `.cali.row-first.row-last`) rule giving
  all four corners — every row type in that rule set is covered.

- Status-bar blur (`.statusbar-blur`, shown once the page scrolls): its
  mask used to end at 50% opacity, which drew a hard line where the blur
  stopped. Since 3.3 the mask fades fully to transparent with an eased
  curve over the last 44px, and the element is 28px taller so the
  full-strength part reaches as far as before (height was "perfect",
  only the edge was wrong). backdrop-filter and the mask must stay on the
  SAME element: a mask/opacity on a parent turns it into a backdrop root,
  and children's backdrop-filter would then have nothing to blur. The
  preview has no notch (safe-area 0) — to eyeball it, temporarily set its
  height to `calc(59px + 34px)` and put content under it.

- Data safety (3.4), after a friend on Android (Pixel, probably) lost all
  data twice "after updates". Nothing in the code deletes data on update
  (update code only drops caches/SW; storage key has been 'lifeos' in all
  291 versions; same origin), but two weak spots could turn a phone-side
  problem into a wipe: (1) `DB.load` silently fell back to an empty set if
  reading/parsing failed, and What's New saves ~0.4s after every update's
  first launch — writing that empty set over the real data; (2) the app
  never asked for persistent storage, so Android Chrome may evict the
  whole origin (data + cached app) when the phone runs low on space, and
  the next launch downloads the newest version fresh — indistinguishable
  from "wiped after an update". Now: `DB.load` sets `DB.readOnly` +
  `DB.loadProblem` ('unavailable' = storage threw, 'unreadable' = invalid
  data or a migration threw; migrations moved into `DB._migrate`) and
  `DB.save` does nothing while readOnly; unreadable text is also copied to
  'lifeos-unreadable'; `DataNotice` (a tap-to-dismiss card) says what
  happened; a throwing `setItem` (storage full) shows one notice per
  session instead of failing silently; startup calls
  `navigator.storage.persist()` if not yet persisted. NEVER reintroduce a
  code path that starts with blank data and saves after a failed read.
  Testing note: this preview blocks localStorage (data: URL), so every
  load here now starts readOnly with the 'unavailable' notice — expected.
  To test data paths, swap `window.localStorage` for a fake object via
  `Object.defineProperty(window,'localStorage',{value:fake,...})` and call
  `DB.load()`.

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
  3.10: rows that grey (PRESS_ROWS with an onclick) are no longer clicked
  by TAPPABLE at all (see the press-grey entry) — so a tap on them during
  a momentum scroll only stops the scroll, which the user wants ("I don't
  want to click something when I just want to stop scrolling"). The one
  exception they asked for is the tab bar: `.tab-item` clicks on TOUCHSTART
  while the page is scrolling (`_lastScrollAt` < 150ms ago), since a tap
  that stops a scroll apparently never reached touchend-based handling on
  their phone. Not scrolling, the tab bar still acts on touchend (so a
  scroll gesture that starts on the tab bar doesn't switch tabs).

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
  was applied so unlock undoes the right one. Since 2.19 a document-level non-passive `touchmove` (search "While a
  sheet is open nothing behind it may scroll") also cancels any drag that
  would scroll the page (backdrop drags, and sheet drags at a scroll
  boundary), plus `touch-action:none` on `.sheet-overlay` / `pan-y` on
  `.sheet`, because overflow:hidden on <html> alone doesn't stop touch
  scrolling on all iOS versions. Trade-off to know about:
  the fixed lock existed because it stops an already-in-flight iOS
  momentum scroll dead; `overflow:hidden` may not, so background
  scrolling coasting behind a sheet is the thing to check first if that
  old report comes back on the installed app.
  Things that did NOT help and were removed: extending the
  sheet/backdrop past the bottom edge, recoloring `<html>` to the sheet's
  color, making Version history taller. Lesson: also read an annotated
  screenshot literally — one of those guesses came from picking the
  easiest reading of a circled region.

- `body.kb-open` (hides the tab bar/FAB while typing) is set on focusin
  only for fields that bring up a keyboard (`_isTypingField`: textarea,
  and inputs other than checkbox/radio/range/buttons/color/file/hidden).
  It used to match any `input`: Android focuses a switch's checkbox on tap
  (iOS doesn't), so on a Samsung flipping a Settings > Menu switch hid the
  whole tab bar until leaving the page — looked like the Menu setting
  didn't apply live, while it actually had. Anything Android-only that
  "disappears until you navigate away" is worth checking against focus.

- The footer tab bar is ALWAYS visible now (it used to hide on project
  pages / Daily and while a sheet was open, with a timed show/hide dance
  around slides — all removed in 2.23 at the user's request "for now").
  Only `body.kb-open` (keyboard) hides it. Project pages therefore have the
  normal 118px bottom padding, and `TabBar.current()` decides which tab is
  lit on pages that aren't tabs. Tabs can also be switched off in Settings
  > Menu (`settings.hiddenTabs`, `TabBar.applyTabs`). If hiding is ever
  wanted again, don't resurrect the timers blindly: hiding before a slide
  looked unfinished, so it has to be deferred until the moving page covers
  the bar and shown immediately when something slides back.

- DSel dropdowns (customSelect/DSel — Language, Day starts at, Tasks shown,
  Reset a project, and since 2.61 the Task window's Priority/Project rows)
  render their open list (`.dsel-menu`) as a floating element appended
  straight to `document.body`, not nested inside whatever row opened it.
  The global touchmove blocker that stops the page scrolling behind an open
  `.sheet-overlay` (search "While a sheet is open nothing behind it may
  scroll") only carved out `.sheet` itself as scrollable — so a DSel menu
  opened from a row THAT LIVES INSIDE an already-open sheet (exactly what
  the Task window's Priority/Project rows do) got every touchmove inside
  it treated as background scroll and blocked outright: reported as "the
  dropdown doesn't work, I can't scroll." DSel dropdowns opened from a
  Settings page never hit this, because no `.sheet-overlay` is open there
  (`_overlayCount` is 0) and the blocker returns immediately. Fixed by
  adding `.dsel-menu` to that blocker's carve-out alongside `.sheet`. If a
  future floating element (another menu/popover appended to body rather
  than nested in the sheet) needs to scroll while opened from inside a
  sheet, it needs the same carve-out, not a new one-off case.

- iOS: a `position:fixed` sheet is anchored to the LAYOUT viewport, which
  does NOT shrink when the on-screen keyboard opens — only the VISUAL
  viewport does. From iOS's point of view a sheet sitting at `bottom:0`
  is now BEHIND the keyboard, so it auto-scrolls the whole document to
  bring the focused input back into view — and because fixed positioning
  on iOS tracks that same scroll instead of staying put, the sheet AND
  the page behind it visibly jump together. Reported as "it's not just
  the edit window that moves, the background does too." This is the
  same root cause as the tab bar/FAB hiding while typing (see the
  comment right above this fix) — just with an interactive sheet, which
  can't simply be hidden. Fixed (2.73) by tracking `window.visualViewport`
  directly and lifting the open sheet by the keyboard's height via an
  inline `bottom` style (composes fine with the existing open/close slide,
  which only ever touches `transform`) — once the sheet already sits
  right above the keyboard, iOS has no remaining reason to auto-scroll
  the document, so the background stops moving too. Reset on `focusout`.
  Only verified with a simulated `visualViewport` resize in this desktop
  preview (there's no real virtual keyboard here) — this is the standard
  fix for this well-documented WebKit behavior, but still needs
  confirming on a real iPhone; if it's not enough there, the next thing
  to check is whether `visualViewport.offsetTop` is actually nonzero
  during the real keyboard animation (it's assumed to track any residual
  page scroll) rather than guessing at more one-off timers.
  2.96 — reported: Android pushed tall sheets (New project) past the top
  of the screen, and on iPhone the background still moved. Causes: (1)
  nothing capped the sheet to the VISIBLE height — a 75vh/88vh sheet
  (vh = the full screen) lifted above the keyboard, or placed in an
  Android layout viewport the keyboard had already shrunk, simply didn't
  fit; (2) the lift only happened after the keyboard animation, by which
  time iOS had already panned the page up to reveal the field, and
  nothing undid that pan. Now ("must track the KEYBOARD"): while a typing
  field in a sheet has focus, the sheet gets `.kb` + `--kbvh` (max-height
  = visible height - top safe area - 12px, beats per-sheet max-heights
  with !important) and the focused field is scrolled into view inside
  it; any visual-viewport pan (offsetTop>0) is scrolled back to the
  locked position; and on iOS the sheet is lifted by the last measured
  keyboard height (localStorage 'lifeos-kb', else 40% of the screen)
  BEFORE the field focuses. 2.96 did that lift on touchstart — the
  background stopped moving, but the keyboard never opened: moving the
  field out from under the finger mid-tap makes iOS drop the tap, so the
  field never got focus. 2.97 takes the tap over instead: on touchend of
  a real tap (no >10px move) on a text field in a sheet, with no field
  focused yet, it preventDefault()s the native focus, lifts the sheet,
  and calls `field.focus({preventScroll:true})` itself — still inside the
  touch gesture, which is what lets iOS open the keyboard. Text fields
  only (date/time open pickers); a tap on an already-focused field stays
  native (caret placement); undone after 600ms if no focus followed.
  General lesson: never move/restyle the element under the finger between
  touchstart and touchend on iOS if the tap itself must still work.
  The lift formula (innerHeight - vv.height - vv.offsetTop) already gives
  0 on an Android that shrinks the layout viewport itself, so Android only
  gets the height cap. Verified by overriding visualViewport.height/
  offsetTop in the preview; whether the iOS pre-lift fully stops the pan
  needs the real phone — if it doesn't, ship an on-device readout of
  innerHeight/vv.height/vv.offsetTop/scrollY during focus (see the
  "dead space" entry) before guessing again.
  3.10 — the lift itself was the problem: "it looks best if nothing moves
  and the keyboard goes over everything", plus "make all the input windows
  high enough so it doesn't cover them". The lift, the `.kb`/`--kbvh`
  height cap and the iOS pre-lift are gone. Now `KbFit.fit(sheet)` runs in
  `_overlayOpen` (before the slide-up, and again one frame later) for any
  sheet with a text field and sets its `height` so every visible text field
  (a tall notes box: its first 88px) ends 16px above the predicted keyboard
  top, including the first `.sheet-save` when that still fits; capped at
  screen - top safe area - 12px. Predicted keyboard = largest measured
  (`lifeos-kb`, only ever raised; iOS number pad is shorter than the text
  keyboard) or 46% of the screen. A MutationObserver re-fits (grow only)
  when an open sheet's content changes. While typing, the sheet gets extra
  bottom padding for the covered part so a field that still can't fit
  (New project's emoji/Window size) is scrolled up INSIDE it; on iOS that
  scroll happens in the tap takeover before focus (only for such fields —
  fields above the line get a plain native tap). Android: viewport meta
  has `interactive-widget=resizes-visual`, and if the layout viewport still
  shrinks, the sheet gets a negative `bottom` so it stays put. Verified with
  an overridden visualViewport.height in the preview; the real keyboard
  height and iOS's pan behavior need the phone.

- A single wrong CHANGELOG string (2.85) silently broke the ENTIRE app —
  worth internalizing exactly how, since nothing about it looked wrong at
  a glance and it slipped past writing the edit AND a first look at the
  diff. A changelog line was written as `'...when you\\'re pressing...'`
  — double backslash before the apostrophe. In the tool call that WROTE
  it, that was meant to produce a single escaped `\'` in the file; instead
  it put a literal `\\'` into the file — an escaped backslash (`\\`,
  a real backslash character) immediately followed by an UNescaped `'`,
  which closes the string right there. Everything after that point in the
  array literal is now bare, invalid tokens, so the whole (single, giant)
  `<script>` tag fails to parse — and since it's one classic script, not a
  module, a parse failure anywhere in it means NONE of it runs, not just
  the broken part. Every top-level `var` stays hoisted-but-`undefined`
  (`DB`, `A`, `APP_VERSION`, all of it) — so the page still LOOKS fine
  (HTML+CSS render normally, tab bar and all) but every screen is empty
  and every interaction does nothing, because there is, functionally, no
  app running at all. Console logging didn't surface this in the tool
  used to check it — `read_console_messages` came back empty even with no
  filter — so absence of a logged error is NOT proof the script loaded.
  What actually caught it: `typeof APP_VERSION` (or any top-level var)
  coming back `"undefined"` after a fresh load, and `new Function(document
  .scripts[0].textContent)` to get a real `SyntaxError` with a message to
  grep for (`grep -n "\\\\'" index.html` immediately found both broken
  lines — the actual fix search that worked). The general lesson: after
  ANY edit that adds a JS string with an apostrophe via escaping, verify
  by loading the page fresh and checking that a top-level global is
  actually defined — a page that "looks right" (renders its static shell)
  is not proof the script executed; only a defined global proves it did.

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
