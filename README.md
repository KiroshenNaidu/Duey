# Duey
**A personal debt and transport tracker.**

[![Download APK](https://img.shields.io/badge/Download-APK-green?style=for-the-badge&logo=android)](https://github.com/KiroshenNaidu/Duey/releases/latest/download/duey_v.1.7.apk)
> I have a pretty bad memory. I needed a simple way to keep track of what I owe and when I traveled to work without relying on scattered notes or mental math. Built this purely for myself — feel free to use it if it helps you too.

---

## Privacy First — 100% Offline

- **No internet required.** Zero online connectivity.
- **Local storage only.** All data is saved directly on your device via IndexedDB.

---

## Features

### Debt Management
- Add and track balances for money owed
- See repayment progress at a glance
- Attach notes to individual debt entries

### Transport Calculator
- Tap days on a custom calendar to mark days you traveled
- Auto-calculates your total transport cost for the month
- Log individual Uber rides with routes, distance, and price

### Budget Planner
- Create spending plans with a set budget and track items against it

### Stats & History
- View payment history: what was paid, how much, and when
- Dedicated history page with editing and a financial-statement export

### Utilities
- Built-in calculator and a quick notepad so you don't have to leave the app
- Multi-currency support (pick your currency in settings)

### Export & Backup
- Export history and statements to **PDF, DOCX, XLSX, CSV, or TXT** — PDFs and Word docs include the app logo in the header
- Export/import a full backup or a portable config (theme + profile)
- **Android:** choose any export folder once — internal storage, SD card, or USB — and every export saves there automatically. Files are named `INITIALS-type-DD-MM-YYYY.ext` (e.g. `K-backup-17-06-2026.json`)

### Customisation
- Change app colors, fonts, and upload a custom background image
- Save and switch between your own themes

---

## Notes

- On Android, the first time you export, the system folder picker appears — pick where exports go and Duey remembers it for every future export (it uses the Storage Access Framework, so no broad storage permission is needed).
- Safe-area insets are always on, so content never hides behind the phone's nav bars.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS, Radix UI, shadcn/ui |
| Mobile | Capacitor 7 (Android), custom SAF folder-access plugin |
| Storage | localStorage + IndexedDB (via `idb`) |
| Charts | Recharts |
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
npm run sync:android   # next build && cap sync android
npm run android        # opens Android Studio
```

---

*Built with <3 to solve my own forgetfulness.*
