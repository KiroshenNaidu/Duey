# Duey
**A personal debt and transport tracker.**

<a href="https://github.com/KiroshenNaidu/Duey/releases/latest/download/duey_v2.2.2.apk">
  <img src="https://img.shields.io/badge/Download-000000?style=for-the-badge&logo=github&logoColor=white" width="200">
</a>

> I have a pretty bad memory. I needed a simple way to keep track of what I owe and when I traveled to work without relying on scattered notes or mental math. Built this purely for myself — feel free to use it if it helps you too.

---

## Privacy First — 100% Offline

- **No internet required.** Zero online connectivity.
- **Local storage only.** Everything lives on your device — app data in `localStorage`, images (background, avatar) in IndexedDB. Nothing is ever sent anywhere.

---

## Features

### Debt Management
- Add and track balances for money owed
- See repayment progress at a glance
- Attach notes and custom labels to individual payments in your history
- Optional per-debt due-date reminders (Android notifications, opt-in per debt)
- People manager — a roster of everyone you've owed, built from your history; rename someone once and it updates across active debts, history, and suggestions
- Debts owed to the same person group into one card, with their combined progress on top

### Money Lent Out
- The other side of the ledger: **Money → Debts → Incoming** tracks what people owe *you*
- A loan is an event log, not a number — hand over more later and it joins the same loan
- Log repayments as they trickle in, with an optional due date that marks a loan overdue
- Outstanding loans come off your balance: money you've lent isn't money you can spend

### Savings
- Whatever a pay cycle ends with is swept into savings automatically when it seals — saving is the default outcome of not spending, not something you have to remember
- Add money you put away yourself against any cycle
- The Savings tab splits the pile into what you kept and what you set aside, with a per-cycle trend

### Transport Calculator
- Tap days on a custom calendar to mark days you traveled — full days or half days
- Auto-calculates your total transport cost for the month (daily rate or flat monthly fee)
- Log individual Uber rides with routes, distance, and price

### Budget Planner
- Create spending plans with a set budget and track items against it

### Income & Expenses
- Track recurring and one-off expenses alongside your monthly income
- Add extra income sources on top of your main salary

### Stats & History
- View payment history: what was paid, how much, and when
- Automatic month-end balance snapshots so past months never drift
- Dedicated history page with editing and a financial-statement export
- Everything is measured per **pay cycle**, not per calendar month — set your payday and the app follows it
- Pick any span of cycles from a tap-through calendar: day → month → year, with one-tap jumps a month or a year at a time, and presets for the last 3 / 6 / 12 cycles

### Utilities
- Built-in calculator and a quick notepad so you don't have to leave the app
- Quick-add radial menu — flick from the FAB to any action, with configurable shortcuts
- Multi-currency support (pick your currency in settings)

### Export & Backup
- Export history and statements to **PDF, DOCX, XLSX, CSV, or TXT** — PDFs and Word docs include the app logo in the header
- Export/import a full backup or a portable config (theme + profile)
- **Android:** choose any export folder once — internal storage, SD card, or USB — and every export saves there automatically. Files are named `INITIALS-type-DD-MM-YYYY.ext` (e.g. `K-backup-17-06-2026.json`)

### Customisation
- Change app colors, fonts, and upload a custom background image
- Save and switch between your own themes, or start from a built-in preset
- Day/Night quick-switch — assign a theme to each mode and flip between them
- Pick your page-swipe transition and quick-add radial effect

### Feel
- Swipe pages left/right to move between Money, Stats, and Transport
- Swipe list cards to reveal edit/delete actions
- Undo on deletes and archives — debts, budget plans, Uber days and saved themes all come back exactly as they were from the toast
- Haptic feedback on buttons and gestures — off / light / medium / strong

---

## Notes

- On Android, the first time you export, the system folder picker appears — pick where exports go and Duey remembers it for every future export (it uses the Storage Access Framework, so no broad storage permission is needed).
- Safe-area insets are always on, so content never hides behind the phone's nav bars.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (static export), React 19, TypeScript |
| Styling | Tailwind CSS, Radix UI, shadcn/ui |
| Motion | Framer Motion, canvas-confetti |
| Mobile | Capacitor 7 (Android) — haptics, local notifications, custom SAF folder-access plugin |
| Storage | localStorage + IndexedDB (via `idb`) |
| Charts | Hand-rolled SVG/CSS — no charting library |
| Export | jsPDF, docx, xlsx |

---

## Installation

1. Download the latest APK from the [Releases page](https://github.com/KiroshenNaidu/Duey/releases/latest).
2. Open the `.apk` on your Android device.
3. Allow installation from unknown sources when prompted — Google will warn you since it's a raw APK. Install if you trust the file...or dont your call lmao i aint your dad-unless.
4. Launch **Duey** and embrace the disapointment your family has always had for you.

---

## Local Development

```bash
npm install        # may show errors — that's fine, skip to the next step
npm run dev        # runs on port 9002
```

> **`npm install` errors are expected** — some optional or peer dependencies may fail to resolve. As long as `node_modules` exists, `npm run dev` will work correctly. Skip the install entirely if you already have the folder.

To build and sync to Android:

```bash
npm run sync:android         # patch bump && clean && next build && cap sync android
npm run sync:android:norev   # same, without bumping the version
npm run android              # opens Android Studio
```

---

## Versioning

`package.json`'s `version` is the single source of truth. `next.config.ts` inlines it as
`NEXT_PUBLIC_APP_VERSION`, and `android/app/build.gradle` reads it into `versionName` plus a
derived `versionCode` (`major * 10000 + minor * 100 + patch`).

`npm run sync:android` runs a patch bump first, so every APK you build carries a fresh
`versionCode`. For the bigger jumps, bump by hand before syncing:

```bash
npm run version:minor   # or version:major / version:patch
```

Use `sync:android:norev` when you want to rebuild without burning a version number.

---

## Starting from Scratch (after deleting node_modules or package-lock.json)

If you deleted `node_modules` and/or `package-lock.json` (e.g. to fix a broken install), run:

```bash
npm install
```

> Use `npm install` — not `npm run install` (that's not a script and will error).

If you get an `ERESOLVE` peer dependency conflict involving `@capacitor/*` packages, it means something bumped a Capacitor package to a different major version. All Capacitor packages must be on the **same major version**. Check `package.json` and align them — this project targets **Capacitor 7** across the board:
- `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, `@capacitor/app`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor/filesystem`, `@capacitor/share` should all be `^7.x`

Once `npm install` succeeds cleanly, continue as normal.

---

## Test Data

Want to try the app with realistic data already loaded? A sample backup is included in the repo.

**[Download test-data.json](public/test-data.json)**

It belongs to **Jhon Skyrim**, a developer paid on the 26th, and covers **every pay cycle from
January 2022 to the current one** — 56 cycles, ~134 KB, 431 history entries. Enough history that
the charts, the trends and the year-back jumps all have something real to draw.

| | |
|---|---|
| **Debts** | 18 in total — 10 still open (student loan, bakkie finance, a home-loan top-up, phone contract, credit card) and 8 paid off and closed. Two people (Sarah Oblivion, Mike Fallout) hold two debts each, so the grouped person cards show up |
| **Money lent out** | 8 loans to Geralt Rivia, Ciri Nova, Kratos Mbeki, Zelda Naicker, Ellie Lastly, Duke Nukemzi, Nathan Drakeford and Aloy Nkosi — 23 events between them, two settled, one overdue, one with a second hand-out on the same loan |
| **History** | 246 payments, 55 sealed cycle summaries, 55 transport months, 34 expenses, 18 debt creations, 14 confirmed budgets, 8 completions — R467,550 paid across four and a half years, with missed months, late notes and labelled extra payments |
| **Savings** | 80 entries, R431,556 — 53 swept automatically at cycle end plus 27 put away by hand |
| **Transport** | 1,072 days ticked since Jan 2022 at R96/day, including 108 half-days, public holidays, annual leave and the December shutdown |
| **Uber** | 77 rides with routes and distances |
| **Budgets** | 15 plans — 14 confirmed and archived across past cycles, plus live ones on the current cycle |
| **Expenses & income** | 9 recurring expenses and 3 one-offs, 2 recurring extra incomes and 2 one-offs |
| **Settings & themes** | 3 custom themes (Aurora Glass / Mint Minimal / Sunset Elevated), starred favourites, a Day/Night pairing, two hidden presets, plus quick-menu, radial-FX, page-transition, swipe and haptics preferences |

Every figure agrees with every other one: a cycle's swept leftover **is** its sealed summary's
remaining, and the transport total **is** the days ticked on the calendar. The sealed summaries
carry the exact titles the app's own month-end seal writes, so importing adds nothing and
re-seals nothing.

To import: **Settings → Data Management → Import Backup** → select `test-data.json`.

> This will overwrite your current data — export a backup first if you have anything you want to keep.

### Regenerating it

The file is generated, not hand-written — four and a half years of interlocking figures is not
something to maintain by hand:

```bash
node scripts/generate-test-data.mjs
```

It anchors on today's date (so the current cycle always has live data and nothing gets
auto-purged) and writes `public/test-data.json` — one copy, under `public/` so the dev server
can serve it. Everything random comes from a seeded PRNG, so two runs on the same day produce
identical output. To change what
the dataset contains, edit the spec tables at the top of the script — `DEBT_SPECS`,
`LOAN_SPECS`, the expense and budget lists — rather than the JSON.

On the dev server you can skip the import dialog entirely: paste `load-test-data.js` into the
browser console and it fetches `/test-data.json` straight into `localStorage`.

---

*Built with <3 to solve my own forgetfulness.*
