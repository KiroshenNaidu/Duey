# Duey
**A personal debt and transport tracker.**

<p>
  <a href="https://github.com/KiroshenNaidu/Duey/releases/download/v.2/duey_v.2.4.1.apk"><img src="docs/assets/btn-download-apk.svg" alt="Download Duey - Android APK v2.3.1" width="240"></a>
  &nbsp;
  <a href="https://duey.netlify.app/"><img src="docs/assets/btn-open-web.svg" alt="Open the Duey web app - duey.netlify.app" width="240"></a>
  &nbsp;
  <a href="https://github.com/KiroshenNaidu/Duey/releases/download/TestData/test-data.json"><img src="docs/assets/btn-download-sample-data.svg" alt="Download the sample dataset - test-data.json" width="240"></a>
</p>

> I have a pretty bad memory. I needed a simple way to keep track of what I owe and when I traveled to work without relying on scattered notes or mental math. Built this purely for myself, feel free to use it if it helps you too.

**100% offline.** No internet, no account, no server. Everything stays on your device.

---

## Features

- **Debts** - track what you owe, see progress, get optional due-date reminders. Debts to the same person group into one card.
- **Money lent out** - log what people owe *you*, with repayments and overdue dates.
- **Savings** - piggybank jars with goals. Each pay cycle's leftovers are swept in automatically, and standing orders run on their own.
- **Transport** - tap the days you traveled and the monthly cost works itself out. Uber rides logged separately.
- **Budgets, expenses & income** - spending plans, recurring or one-off expenses, and extra income on top of your salary.
- **Stats & history** - everything measured per pay cycle, with a full editable history.
- **Export & backup** - PDF, DOCX, XLSX, CSV or TXT, plus full backup and restore.
- **Customisation** - themes, fonts, backgrounds, a Day/Night switch, haptics and undo on deletes.

---

## Install

Just want to look around? Open **[duey.netlify.app](https://duey.netlify.app/)** in any browser, no install needed. Your data stays in that browser.

For the Android app:

1. Download the APK with the button above.
2. Open it on your Android device.
3. Allow installation from unknown sources when prompted, Google will warn you since it's a raw APK. Install if you trust the file...or dont your call lmao i aint your dad-unless.
4. Launch **Duey** and embrace the disapointment your family has always had for you.

---

## Try it with sample data

Download `test-data.json` with the button above, then in the app go to **Settings → Data Management → Import Backup**.

> This overwrites your current data. Export a backup first if you want to keep it.

The sample covers every pay cycle since January 2022: debts, loans, savings, transport, budgets and themes, all consistent with each other.

---

## Development

**Tech:** Next.js 15, React 19, TypeScript, Tailwind, Capacitor 7 (Android). Data lives in `localStorage` and IndexedDB.

Install dependencies (errors here are expected, carry on if `node_modules` exists):

```bash
npm install
```

Run the dev server on port 9002:

```bash
npm run dev
```

### Build for Android

Build, sync and open Android Studio:

```bash
npm run sync
```

Same, plus a version bump (use this when cutting a new APK):

```bash
npm run sync:full
```

Build and sync without opening Android Studio:

```bash
npm run sync:android:norev
```

### Versioning

`package.json` is the single source of truth for the version. `sync:full` and `sync:android` bump the patch automatically. For bigger jumps:

```bash
npm run version:minor
```

```bash
npm run version:major
```

### Sample data

Regenerate `public/test-data.json` (edit the spec tables at the top of the script to change what's in it):

```bash
node scripts/generate-test-data.mjs
```

On the dev server, paste [`load-test-data.js`](load-test-data.js) into the browser console to load it without importing, or [`reset-app-data.js`](reset-app-data.js) to wipe everything. To wipe the Android build:

```bash
adb shell pm clear com.duey.app
```

### Troubleshooting

An `ERESOLVE` error on install means the `@capacitor/*` packages are on different major versions. Align them all to `^7.x` in `package.json`, then run `npm install` again.

---

*Built with <3 to solve my own forgetfulness.*
