---
name: verify
description: Build, launch and drive Duey (Next.js + Capacitor money app) to verify changes end-to-end with touch gestures and screenshots.
---

# Verifying Duey

Duey is a Next.js 15 (app router, Turbopack) PWA that also ships as a Capacitor Android
APK. All UI is mobile-first; most interactions are TOUCH gestures (page-swipe carousel,
radial quick-add FAB, swipe-to-reveal rows), so verification needs real touch events,
not mouse clicks.

## Launch

```
npm run dev            # port 9002 — check first: it is often already running
```
If `EADDRINUSE :::9002`, a server is already up — reuse it (Turbopack hot-reloads your
working-tree changes). Health check: `Invoke-WebRequest http://localhost:9002`.
First compile of each route is lazy and SLOW (30s+); use generous timeouts, warm the
routes once before asserting.

## Drive (headless Edge + CDP touch)

No Playwright in the repo. Install `playwright-core` in the session scratchpad (a few
MB, no browser download) and use the system Edge:

```js
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
```

Touch gestures via CDP (Playwright's touchscreen only taps):

```js
const cdp = await context.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
// loop touchMove points ~16ms apart, then:
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
```

## Seeding state (skip onboarding, get data on screen)

App state lives in `localStorage['appState']` (see AppDataContext). Seed BEFORE load
with `context.addInitScript`. Gotchas learned the hard way:

- `currency: 'ZAR'` skips the first-run currency picker dialog.
- **`userThemes: []` is REQUIRED** — migrateState does not default it and DayNightToggle
  crashes the whole app ("Cannot read properties of undefined (reading 'map')").
- Expenses need `createdAt` (ISO) or the boot purge deletes non-recurring ones.
- Include `schemaVersion: 8` (see CURRENT_SCHEMA_VERSION), `history: []`, `debts`,
  `expenses`, `uberRides`, `extraIncomes: []`, `budgetPlans: []`, `notepadContent: ''`.

## Flows worth driving

- **Page swipe**: touch-drag horizontally at mid-screen; assert `page.url()` changes
  between /transport ↔ / ↔ /stats ↔ /settings. Mid-drag screenshot shows the live
  finger-follow + nav pill sync. Transition preset comes from appState.pageTransitionId.
- **Radial quick-add**: `button[aria-label="Quick add"]` on /transport and /stats;
  touchStart on it opens the radial (hold), move to aim, screenshot. Close via
  `button[aria-label="Close quick add"]`, then tap a nav tab to prove no frozen backdrop
  (the historic Android freeze bug).
- **Swipeable rows**: Money page → `getByRole('tab', { name: 'Expenses' })` → drag a
  `[data-swipe-row]` left → tray (Edit/Delete) appears, URL must stay '/'.
  Rows honour appState.swipeActionsEnabled (off → no data-swipe-row in DOM).
- **Theme → Style**: goto /settings then
  `page.evaluate(() => window.dispatchEvent(new Event('duey:open-theme')))` opens the
  theme menu (SettingsPage is always mounted). Cards: UI Style, Quick Add Effects
  (radial FX chips + live demo `button[aria-label="Effect demo button"]`), Quick Menu,
  Page Transition, Gestures.
- **Reduced motion**: `newContext({ reducedMotion: 'reduce' })` — page transitions force
  the flat slide preset; FX components return null.

## Gesture-driving gotchas

- **Warm every route first** (`goto` each of /, /transport, /stats, /settings): Next dev
  compiles routes on demand, so a committed swipe's `router.push` can land seconds after
  your assertion on a cold route.
- **CDP touch moves are slow** (~5-15ms round-trip each). For a genuine fling
  (>1.5 px/ms) send few moves with NO sleeps between them; sleeps per step read as a
  slow drag and won't clear velocity thresholds.
- Rows span ~x=40..350 in the 390px viewport — start row swipes at x≤340 or you'll hit
  the page background and page-swipe instead.
- Settledness assertion: the active carousel page (position:relative, width:100%)
  has inline `transform: none` at rest.

## Static gates

`npm run typecheck` works. `npm run lint` is NOT configured (next lint prompts
interactively) — don't block on it. APK path: `npm run sync:android` then Android Studio.
